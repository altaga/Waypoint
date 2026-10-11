import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.ts";
import { registerWaypointTools } from "./tools.ts";
import { registerWaypointResources } from "./resources.ts";

export const SERVER_NAME = "waypoint";
export const SERVER_VERSION = "0.1.0";

/** One MCP server per session, bound to the user it serves. */
export function createWaypointMcpServer(ctx: AppContext, userId: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerWaypointTools(server, ctx, userId);
  registerWaypointResources(server);
  return server;
}
