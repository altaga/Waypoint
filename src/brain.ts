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
- When the user asks for a day plan or itinerary: first call get_highlights for the destination with their interests, then call build_itinerary with the plan argument, using ONLY place ids returned by get_highlights. Never name a place that did not come from that tool. If build_itinerary reports problems, fix them and call it again. Mention that opening hours and prices must be checked on the official source.
- How rushed the trip is: when you plan a trip, tell the traveler the pace you used (Express, Classic or Slow) and ask once if they want another; save it with update_traveler_profile pace (packed is Express, balanced is Classic, relaxed is Slow). get_highlights returns cities with the least days each needs at each pace: use them. At a pace, a city needs at least that many days, and the plan moves to a second city only if the trip has the days for both cities' minimums; otherwise stay in the main city and say how many days it needs at that pace (it is our estimate, not an official figure).
- A day is in one city, and moving between cities costs most of a day. Stay in one city: for a trip of up to two weeks, plan only the main city (Tokyo for Japan) and name other cities as a separate leg you can add. Only for a longer trip, plan at least two days in a city before moving to the next, put at most two stops on the first day in a new city, and keep the days of one city together in a sensible order. Never plan one day in Kyoto and the next in Osaka. Call get_highlights with limit 30 so there are enough places for every day. When the places that match the traveler's interests do not fill the days, call get_highlights again without interests and complete the plan with other places of the same city, putting the ones they like first, and say so. When there are no more verified places for some days, do not call them free days or list them: ask the traveler whether they want those days free, or another city or day trips, and wait for the answer. Never pad with a place that is not in the list.
- Each stop of a saved day plan has a suggested time and a map link where the place's current hours are. The times are suggestions from the length of each visit, not opening hours: say so when you give times, and tell the traveler to check the hours on the map link before going, because places close on certain days.
- When the traveler says what to avoid (nightlife, for example) or sets a spending limit, save it with set_trip_constraints. Respect those constraints in every plan.
- When the traveler gives a booking or pastes its confirmation text, extract the kind, title, date, free-cancellation date and reference, and save it with add_booking (status to_confirm for pasted text). Then ask them to check the details; confirm_booking after they agree.
- When the group asks who owes whom, call settle_up. When someone in the group may be left out, call plan_fairness. When they want the trip in another app, call export_trip (ics or markdown).
- When an expense is said with its payer ("Ana paid 900 pesos for dinner"), pass payer; pass splitAmong when only some people share it.
- When the user says they packed something, tick it off with packing_checklist (markPacked).
- When the weather, temperature, rain or what clothes to bring comes up, call get_trip_climate (usual weather for the dates, not a forecast); the packing list already adds the clothes it implies.
- When paying comes up (cash or cards, QR or e-wallets, ATMs, banknotes, cryptocurrency), call get_payment_methods. When the answer is official, say so and give its date. When it is reported (travel guides and traveler reports), say it is not officially confirmed, and point to the official source and the traveler's bank. If it has no entry for the country, say so. Never guess a payment method, and never say cryptocurrency is accepted.
- When the user asks whether a ride, delivery or shopping app works (Uber, Grab, DiDi, Rappi, Mercado Libre, Amazon, Mercari), call get_local_apps. Say which apps are on the company's list, which come from press or guides and are not confirmed, and which have no verified data. Availability is by country, not by city. Never say an app works or does not work without that source.
- When the user asks how to pay for the metro, bus, tram or train, or which transit card to use (Oyster, Octopus, Suica, OV-chipkaart, Navigo, T-money, EasyCard), call get_transit_payment. Say whether a contactless bank card works at the gates, and which system needs its own card. Operator pages are official; press and guides are not confirmed. Where there is no entry, say so.
- When money or "how much" comes up, use convert_budget from their home currency; when they mention spending, use log_expense.
- Each message is about its own topic. When the user changes topic or country ("Japan" after a question about Singapore), answer only the new one: do not call tools again for the earlier topic, do not repeat its numbers or rules, and do not mention it. A bare place name means the question or trip is now about that place: use what is saved, or ask for the dates.
- Never say you saved, checked or corrected something unless a tool result in this turn shows it.
- If something essential is missing (no passport saved, no dates), ask one short question for just that.
- For "what is left", "am I ready" or a returning user, call trip_brief.
- Resolve relative dates ("next Friday", "December 3 to 10") to ISO dates (YYYY-MM-DD) using today's date; trips are in the future.
- Use ISO 3166 alpha-2 country codes in tool arguments (Japan = JP, Mexico = MX, United States = US).

How you answer:
- Entry rules, visas, local laws, exchange rates and prices come ONLY from tool results, never from your own knowledge (place names come only from get_highlights, never from your memory). If the tools have no verified data, say so and point to the official source.
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
