import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Calls one Waypoint tool over MCP (Streamable HTTP) for one Alexa user.
// The Alexa userId is long and not header-safe, so it is hashed to a stable id.
export function alexaUserKey(alexaUserId: string): string {
  return "alexa-" + createHash("sha256").update(alexaUserId).digest("hex").slice(0, 48);
}

export interface ToolCall {
  voice: string;
  rows: string[];
  missing: string[];
  isError: boolean;
}

export async function callWaypointTool(
  mcpUrl: string,
  alexaUserId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCall> {
  const client = new Client({ name: "waypoint-alexa-skill", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { "x-waypoint-user": alexaUserKey(alexaUserId) } },
  });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name, arguments: args });
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
    await client.close();
  }
}
