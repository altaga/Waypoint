import { join } from "node:path";
import express, { type Request, type Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createContext, type AppContext } from "./context.ts";
import { createWaypointMcpServer } from "./mcp-server.ts";
import { runBrain, brainConfigured, type BrainTurn } from "./brain.ts";
import { createSpeech, type SpeechLang } from "./speech.ts";
import { mountAlexa } from "./alexa/endpoint.ts";
import { setLocalMcpFactory } from "./alexa/mcp-call.ts";

// Streamable HTTP transport for MCP 2025-11-25 at /mcp. Sessions are kept in memory
// for the local demo; the user is identified by the x-waypoint-user header until
// account linking exists (context doc §1.4, item 13).

const DEFAULT_ORIGINS = ["http://localhost", "http://127.0.0.1"];

export function allowedOrigins(): string[] {
  const extra = (process.env.WAYPOINT_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function originAllowed(origin: string | undefined, allow: string[], host?: string): boolean {
  if (!origin) return true; // non-browser clients do not send Origin
  // The simulator page served by this same server (e.g. the public Function URL).
  if (host && /^https:\/\//.test(origin) && origin.slice("https://".length) === host) return true;
  return allow.some((a) => origin === a || origin.startsWith(`${a}:`));
}

// Optional language hint from the Alexa skill (e.g. es-MX). Anything that is not a plain tag is ignored.
function localeFrom(req: Request): string | undefined {
  const raw = req.header("x-waypoint-locale") ?? "";
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(raw) ? raw : undefined;
}

function userFrom(req: Request): string {
  const raw = req.header("x-waypoint-user") ?? "anonymous-demo";
  return raw.slice(0, 64).replace(/[^\w.-]/g, "_");
}

export function createApp(ctx: AppContext = createContext()) {
  // Root app without body parsers: the Alexa adapter must read the raw body to verify
  // Amazon's signature. The MCP app below parses JSON itself, so it is mounted after /alexa.
  const root = express();
  // The skill reaches this server in memory, so it needs no public URL of its own.
  setLocalMcpFactory((userKey, locale) => createWaypointMcpServer(ctx, userKey, locale));
  mountAlexa(root, "/alexa");
  // Local runs bind to localhost and get DNS-rebinding protection. Lambda serves a public
  // Function URL host, so host checks are off there; the origin guard still applies.
  const app = createMcpExpressApp({ host: process.env.AWS_LAMBDA_FUNCTION_NAME ? "0.0.0.0" : "127.0.0.1" });
  const allow = allowedOrigins();

  // Origin validation: a browser request from an unknown origin gets 403 (2025-11-25).
  app.use((req, res, next) => {
    if (!originAllowed(req.header("origin"), allow, req.header("host"))) {
      res.status(403).json({ error: "forbidden origin" });
      return;
    }
    next();
  });

  // Stateless MCP: every request gets its own server and transport, so any Lambda container
  // can answer any call. Memory lives in the state store, not in the MCP session.
  async function handleMcp(req: Request, res: Response) {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = createWaypointMcpServer(ctx, userFrom(req), localeFrom(req));
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
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

  const speech = createSpeech();
  // The host's reply, said with a neural voice. The audio comes back as base64 inside JSON, so the
  // function URL needs no binary configuration. On failure the browser speaks the reply instead.
  app.post("/api/speech", express.json(), async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    const lang: SpeechLang = String(req.body?.lang || "").toLowerCase().startsWith("en") ? "en" : "es";
    try {
      const audio = await speech(text, lang);
      res.json({ audio: Buffer.from(audio).toString("base64"), type: "audio/mpeg" });
    } catch (err) {
      console.error("speech_failed", err instanceof Error ? err.name : "Error");
      res.status(503).json({ error: "speech_unavailable" });
    }
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
    const history = Array.isArray(req.body?.history)
      ? (req.body.history as unknown[])
          .filter((t): t is BrainTurn => {
            const x = t as BrainTurn;
            return (x?.role === "user" || x?.role === "assistant") && typeof x.text === "string";
          })
          .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }))
      : [];
    try {
      const reply = await runBrain({ ctx, userId: userFrom(req), utterance, history, locale: localeFrom(req) });
      res.json(reply);
    } catch (err) {
      // The error class (e.g. ValidationException) helps debugging and carries no secrets.
      const kind = err instanceof Error ? err.name : "Error";
      console.error("brain_failed", kind, err instanceof Error ? err.message : err);
      res.status(502).json({ error: "brain_failed", kind });
    }
  });

  app.use(express.static(join(ctx.root, "web"), { extensions: ["html"] }));
  // Under Lambda, serverless-http puts the raw body on req.body; the JSON parser of the MCP app
  // would then skip reading the stream. Drop that copy so the parser reads the real body.
  root.use((req, _res, next) => {
    if ((req as { body?: unknown }).body !== undefined) delete (req as { body?: unknown }).body;
    // The MCP SDK converts Node requests with their rawHeaders; serverless-http only sets headers.
    if (!req.rawHeaders?.length) {
      req.rawHeaders = Object.entries(req.headers).flatMap(([k, v]) =>
        Array.isArray(v) ? v.flatMap((x) => [k, x]) : v === undefined ? [] : [k, String(v)],
      );
    }
    next();
  });
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
