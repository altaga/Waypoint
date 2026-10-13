// The Waypoint concierge "brain": a Strands agent on Amazon Bedrock that plans and calls
// several Waypoint MCP tools in one turn (context doc §5.6). Enabled only with
// WAYPOINT_BRAIN=bedrock and WAYPOINT_BEDROCK_MODEL. The deterministic router in the web
// host works without it.
//
// The agent reaches the MCP server in memory (same process), so it works on Lambda, where
// nothing listens on a local port. Every tools/call is recorded so the host can show which
// tools ran and render their cards.
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Agent, BedrockModel, McpClient } from "@strands-agents/sdk";
import type { AppContext } from "./context.ts";
import { createWaypointMcpServer } from "./mcp-server.ts";

export function brainConfigured(): boolean {
  return process.env.WAYPOINT_BRAIN === "bedrock" && Boolean(process.env.WAYPOINT_BEDROCK_MODEL);
}

export interface BrainTurn {
  role: "user" | "assistant";
  text: string;
}

export interface BrainCall {
  tool: string;
  args: Record<string, unknown>;
  isError: boolean;
  structured?: Record<string, unknown>;
  uiResourceUri?: string;
}

export interface BrainReply {
  text: string;
  calls: BrainCall[];
  ms: number;
}

export function systemPrompt(today: string, locale: string): string {
  const spanish = locale.toLowerCase().startsWith("es");
  return `You are Waypoint, a travel-readiness concierge on a voice-first assistant (a simulated Alexa+ host with a screen).
Today is ${today}. The host language is ${spanish ? "Spanish (Mexico)" : "English (US)"}: answer in the language the user writes in; if unclear, use the host language.

How you work:
- At the start of a conversation, call get_traveler_profile to learn who the user is (passports, residence, saved trips). Use what is saved; never ask again for something the profile already has.
- When the user tells you their nationality, passport(s), residence or home currency, save it with update_traveler_profile before anything else.
- When the user mentions a trip (destination and dates), do the whole job without being asked twice: plan_trip, then check_entry_requirements, then get_local_rules for the destination. Add convert_budget when money comes up and packing_checklist when packing comes up.
- If something essential is missing (no passport saved, no dates), ask one short question for just that.
- For "what is left", "am I ready" or a returning user, call trip_brief.
- Resolve relative dates ("next Friday", "December 3 to 10") to ISO dates (YYYY-MM-DD) using today's date; trips are in the future.
- Use ISO 3166 alpha-2 country codes in tool arguments (Japan = JP, Mexico = MX, United States = US).

How you answer:
- Entry rules, visas, local laws and prices come ONLY from tool results, never from your own knowledge. If the tools have no verified data, say so and point to the official source.
- Speak like a concierge: warm, direct, 1 to 3 short sentences, at most about 60 words. The screen shows the details as cards, so do not repeat lists, tables or every rule.
- Plain spoken text only: no markdown, no bullet points, no emojis, no URLs, no tool names, no JSON, no error codes.
- End with one useful next step as a short question when it helps (for example offering the packing list or the budget).
- Mention once per conversation that rules change and the official source has the final word.`;
}

/** Runs one concierge turn for one user. History is the recent spoken conversation. */
export async function runBrain(opts: {
  ctx: AppContext;
  userId: string;
  utterance: string;
  history?: BrainTurn[];
  locale?: string;
}): Promise<BrainReply> {
  const started = Date.now();
  const locale = opts.locale ?? "en-US";
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createWaypointMcpServer(opts.ctx, opts.userId, locale);
  await server.connect(serverSide);

  // Record tools/call requests and their results as they cross the in-memory link.
  const pending = new Map<string | number, { tool: string; args: Record<string, unknown> }>();
  const calls: BrainCall[] = [];
  const toServer = serverSide.onmessage?.bind(serverSide);
  serverSide.onmessage = (msg: JSONRPCMessage, extra?: unknown) => {
    const m = msg as { id?: string | number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    if (m.method === "tools/call" && m.id !== undefined) {
      pending.set(m.id, { tool: String(m.params?.name ?? ""), args: m.params?.arguments ?? {} });
    }
    toServer?.(msg, extra as never);
  };
  const sendToClient = serverSide.send.bind(serverSide);
  serverSide.send = async (msg: JSONRPCMessage, options?: unknown) => {
    const m = msg as { id?: string | number; result?: { isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: { ui?: { resourceUri?: string } } } };
    const req = m.id !== undefined ? pending.get(m.id) : undefined;
    if (req && m.result) {
      pending.delete(m.id!);
      calls.push({
        tool: req.tool,
        args: req.args,
        isError: Boolean(m.result.isError),
        structured: m.result.structuredContent,
        uiResourceUri: m.result._meta?.ui?.resourceUri,
      });
    }
    return sendToClient(msg, options as never);
  };

  const mcp = new McpClient({ transport: clientSide, applicationName: "waypoint-concierge" });
  const agent = new Agent({
    model: new BedrockModel({
      region: process.env.AWS_REGION ?? "us-east-1",
      // Model id is required (WAYPOINT_BEDROCK_MODEL); no default is assumed.
      modelId: process.env.WAYPOINT_BEDROCK_MODEL,
    }),
    tools: [mcp],
    systemPrompt: systemPrompt(opts.ctx.clock().toISOString().slice(0, 10), locale),
    messages: (opts.history ?? []).slice(-8).map((t) => ({ role: t.role, content: [{ text: t.text }] })),
    printer: false,
  });
  try {
    const result = await agent.invoke(opts.utterance);
    return { text: String(result).trim(), calls, ms: Date.now() - started };
  } finally {
    await mcp.disconnect?.().catch(() => {});
    await server.close().catch(() => {});
  }
}
