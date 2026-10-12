import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Calls one Waypoint tool for one Alexa user. Two ways to reach the server:
//  - WAYPOINT_MCP_URL set: over HTTP (useful when the skill runs elsewhere).
//  - otherwise: an in-memory MCP connection to the server in this process (Lambda).
// The Alexa userId is long and not header-safe, so it is hashed to a stable id.

let localFactory: ((userKey: string) => McpServer) | null = null;
export function setLocalMcpFactory(factory: (userKey: string) => McpServer) {
  localFactory = factory;
}
export function canReachWaypoint(): boolean {
  return Boolean(process.env.WAYPOINT_MCP_URL) || localFactory !== null;
}

export function alexaUserKey(alexaUserId: string): string {
  return "alexa-" + createHash("sha256").update(alexaUserId).digest("hex").slice(0, 48);
}

export interface ToolCall {
  voice: string;
  rows: string[];
  missing: string[];
  isError: boolean;
}

async function connect(alexaUserId: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const client = new Client({ name: "waypoint-alexa-skill", version: "0.1.0" });
  const mcpUrl = process.env.WAYPOINT_MCP_URL;
  if (mcpUrl) {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { "x-waypoint-user": alexaUserKey(alexaUserId) } },
    });
    await client.connect(transport);
    return { client, close: () => client.close() };
  }
  if (!localFactory) throw new Error("no Waypoint server reachable");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = localFactory(alexaUserKey(alexaUserId));
  await server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export async function callWaypointTool(
  alexaUserId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCall> {
  const conn = await connect(alexaUserId);
  try {
    const res = await conn.client.callTool({ name, arguments: args });
    if (res.isError) {
      const text = (res.content as { text: string }[]).map((c) => c.text).join(" ");
      return { voice: text, rows: [], missing: [], isError: true };
    }
    const sc = res.structuredContent as {
      voice: string;
      card?: { rows?: { label: string; value: string }[] };
      missingFields?: string[];
    };
    return {
      voice: sc.voice,
      rows: (sc.card?.rows ?? []).map((r) => `${r.label}: ${r.value}`),
      missing: sc.missingFields ?? [],
      isError: false,
    };
  } finally {
    await conn.close();
  }
}
