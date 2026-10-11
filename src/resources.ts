import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// MCP Apps resource (extension 2026-01-26). The HTML is one self-contained file
// with a content-hashed URI, so hosts can cache it safely.

const html = readFileSync(join(import.meta.dirname, "ui/plan-dashboard.html"), "utf8");
const hash = createHash("sha256").update(html).digest("hex").slice(0, 8);
export const PLAN_DASHBOARD_URI = `ui://waypoint/plan-dashboard-${hash}.html`;
export const MCP_APP_MIME = "text/html;profile=mcp-app";

export function registerWaypointResources(server: McpServer): void {
  server.registerResource(
    "plan-dashboard",
    PLAN_DASHBOARD_URI,
    {
      title: "Trip readiness dashboard",
      description: "Per-traveler entry status, local rules and days left for a planned trip.",
      mimeType: MCP_APP_MIME,
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
    },
    async () => ({
      contents: [{ uri: PLAN_DASHBOARD_URI, mimeType: MCP_APP_MIME, text: html }],
    }),
  );
}
