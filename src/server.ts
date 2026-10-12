import { randomUUID } from "node:crypto";
import { join } from "node:path";
import express, { type Request, type Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createContext, type AppContext } from "./context.ts";
import { createWaypointMcpServer } from "./mcp-server.ts";
import { runBrain, brainConfigured } from "./brain.ts";
import { mountAlexa } from "./alexa/endpoint.ts";

// Streamable HTTP transport for MCP 2025-11-25 at /mcp. Sessions are kept in memory
// for the local demo; the user is identified by the x-waypoint-user header until
// account linking exists (context doc §1.4, item 13).

interface Session {
  transport: StreamableHTTPServerTransport;
}

const DEFAULT_ORIGINS = ["http://localhost", "http://127.0.0.1"];

export function allowedOrigins(): string[] {
  const extra = (process.env.WAYPOINT_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function originAllowed(origin: string | undefined, allow: string[]): boolean {
  if (!origin) return true; // non-browser clients do not send Origin
  return allow.some((a) => origin === a || origin.startsWith(`${a}:`));
}

function userFrom(req: Request): string {
  const raw = req.header("x-waypoint-user") ?? "anonymous-demo";
  return raw.slice(0, 64).replace(/[^\w.-]/g, "_");
}

export function createApp(ctx: AppContext = createContext()) {
  // Root app without body parsers: the Alexa adapter must read the raw body to verify
  // Amazon's signature. The MCP app below parses JSON itself, so it is mounted after /alexa.
  const root = express();
  mountAlexa(root, "/alexa");
  const app = createMcpExpressApp({ host: "127.0.0.1" });
  const sessions = new Map<string, Session>();
  const allow = allowedOrigins();

  // Origin validation: a browser request from an unknown origin gets 403 (2025-11-25).
  app.use((req, res, next) => {
    if (!originAllowed(req.header("origin"), allow)) {
      res.status(403).json({ error: "forbidden origin" });
      return;
    }
    next();
  });

  async function handleMcp(req: Request, res: Response) {
    const sessionId = req.header("mcp-session-id");
    try {
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
          return;
        }
        await session.transport.handleRequest(req, res, req.body);
        return;
      }
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: no valid session" }, id: null });
        return;
      }
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string): void => {
          sessions.set(id, { transport });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = createWaypointMcpServer(ctx, userFrom(req));
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("mcp request failed", (err as Error).name);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  }

  app.post("/mcp", handleMcp);
  app.get("/mcp", handleMcp);
  app.delete("/mcp", handleMcp);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, server: "waypoint", protocolVersion: "2025-11-25", packs: ctx.packs.list().length, offline: ctx.offline, brain: brainConfigured() });
  });

  app.post("/api/brain", express.json(), async (req, res) => {
    const utterance = typeof req.body?.utterance === "string" ? req.body.utterance.slice(0, 500) : "";
    if (!utterance) {
      res.status(400).json({ error: "utterance required" });
      return;
    }
    if (!brainConfigured()) {
      res.status(503).json({ error: "brain_unavailable" });
      return;
    }
    try {
      const text = await runBrain(utterance, `http://127.0.0.1:${process.env.PORT ?? 3000}/mcp`, userFrom(req));
      res.json({ text });
    } catch {
      res.status(502).json({ error: "brain_failed" });
    }
  });

  app.use(express.static(join(ctx.root, "web")));
  root.use(app);
  return root;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();
  app.listen(port, "127.0.0.1", () => {
    console.log(`Waypoint MCP server on http://127.0.0.1:${port}/mcp (simulator at /)`);
  });
}
