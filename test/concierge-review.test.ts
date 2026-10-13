import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext, type AppContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { withGroundingNote } from "../scripts/apply-grounding.ts";

// Regression tests for the review of the concierge tools: each one reproduces a defect the review
// found in the old code and checks the fixed behaviour.

function context(now: string): AppContext {
  return createContext({ offline: true, store: createMemoryStore(), clock: () => new Date(now) });
}

async function session(ctx: AppContext, user: string) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, "en-US").connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  // Calls that must be refused: an error result, or a schema error raised by the protocol.
  const refused = async (name: string, args: Record<string, unknown>) => {
    try {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { refused: r.isError === true, text: r.content?.map((c) => c.text).join(" ") ?? "" };
    } catch (err) {
      return { refused: true, text: String((err as Error).message) };
    }
  };
  return { call, refused, close: () => client.close() };
}

async function group(ctx: AppContext, user: string, homeTimezone = "UTC", trip = { startDate: "2026-12-03", endDate: "2026-12-10" }) {
  const s = await session(ctx, user);
  await s.call("update_traveler_profile", {
    homeCurrency: "USD",
    homeTimezone,
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" },
      { displayName: "Sam", passports: ["US"], role: "friend", ageBand: "adult" },
      { displayName: "Priya", passports: ["IN"], role: "friend", ageBand: "adult" },
    ],
  });
  await s.call("plan_trip", { destination: "JP", ...trip });
  return s;
}

test("itinerary: a place saved on one day cannot be planned on another day", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "repeat-user");
  const first = await s.call("build_itinerary", { plan: [{ day: 1, stops: ["jp-senso-ji"] }] });
  assert.equal(first.data.saved, true);
  const again = await s.call("build_itinerary", { plan: [{ day: 2, stops: ["jp-senso-ji"] }] });
  assert.equal(again.data.saved, false);
  assert.equal(again.data.violations[0].code, "repeated_place");
  // Replacing day 1 keeps its own places: they are not counted against the new day 1.
  const replaced = await s.call("build_itinerary", { plan: [{ day: 1, stops: ["jp-senso-ji", "jp-meiji-jingu"] }] });
  assert.equal(replaced.data.saved, true);
  await s.close();
});

test("expenses: a name outside the group is refused, and a repeated name counts once", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "names-user");
  const unknown = await s.refused("log_expense", { amount: 60, category: "food", payer: "Ana", splitAmong: ["Lu", "Mar"] });
  assert.equal(unknown.refused, true);
  assert.match(unknown.text, /Lu/);
  const unknownPayer = await s.refused("log_expense", { amount: 60, category: "food", payer: "Lu" });
  assert.equal(unknownPayer.refused, true);
  const dup = await s.call("log_expense", { amount: 30, category: "food", payer: "Ana", splitAmong: ["Sam", "Sam", "Priya"] });
  assert.deepEqual(dup.data.expense.splitAmong.length, 2);
  await s.close();
});

test("expenses: an unknown trip id is refused instead of stored with no trip", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "trip-id-user");
  const r = await s.refused("log_expense", { amount: 10, category: "taxi", tripId: "no-such-trip" });
  assert.equal(r.refused, true);
  await s.close();
});

test("currency: only ISO 4217 codes are accepted", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "iso-user");
  const r = await s.refused("log_expense", { amount: 10, currency: "US$", category: "taxi" });
  assert.equal(r.refused, true);
  const ok = await s.call("log_expense", { amount: 10, currency: "usd", category: "taxi" });
  assert.equal(ok.data.expense.currency, "USD");
  await s.close();
});

test("settle up: balances settle to the cent, so the transfers add up exactly", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "cents-user");
  // 100 USD split three ways: 33.33 each, with one cent left over for the payer.
  await s.call("log_expense", { amount: 100, category: "food", payer: "Ana" });
  const settle = await s.call("settle_up");
  const total = settle.data.transfers.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  assert.equal(Math.round(total * 100), 6666);
  assert.deepEqual(settle.data.transfers.map((t: { amount: number }) => t.amount), [33.33, 33.33]);
  const balances = Object.values(settle.data.balances as Record<string, number>);
  assert.equal(Math.round(balances.reduce((a, b) => a + b, 0) * 100), 0);
  await s.close();
});

test("settle up: expenses that cannot be converted are said, not dropped in silence", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await group(ctx, "rate-user");
  await s.call("log_expense", { amount: 50, currency: "KPW", category: "souvenir", payer: "Ana" });
  const settle = await s.call("settle_up");
  assert.equal(settle.data.unconverted, 1);
  assert.match(settle.voice, /exchange rate/);
  await s.close();
});

test("dates: a date that is not in the calendar is refused, and a trip over a year is too", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await session(ctx, "dates-user");
  await s.call("update_traveler_profile", { travelers: [{ displayName: "Solo", passports: ["MX"], role: "self", ageBand: "adult" }] });
  const feb30 = await s.refused("plan_trip", { destination: "JP", startDate: "2026-02-30", endDate: "2026-03-03" });
  assert.equal(feb30.refused, true);
  const long = await s.refused("plan_trip", { destination: "JP", startDate: "2026-01-01", endDate: "2027-02-05" });
  assert.equal(long.refused, true);
  assert.match(long.text, /365/);
  await s.close();
});

test("countdown and deadlines use the traveler's day, not the UTC day", async () => {
  // 23:00 UTC on 13 October is already 14 October in Tokyo.
  const tokyo = context("2026-10-13T23:00:00Z");
  const s1 = await group(tokyo, "tokyo-user", "Asia/Tokyo", { startDate: "2026-10-14", endDate: "2026-10-20" });
  const brief = await s1.call("trip_brief");
  assert.equal(brief.data.daysUntil, 0);
  await s1.close();

  const utc = context("2026-10-13T23:00:00Z");
  const s2 = await group(utc, "utc-user", "UTC", { startDate: "2026-10-14", endDate: "2026-10-20" });
  const briefUtc = await s2.call("trip_brief");
  assert.equal(briefUtc.data.daysUntil, 1);
  await s2.close();
});

test("highlights: each place says whether its text is from Wikipedia and links to that article", async () => {
  const ctx = context("2026-10-13T12:00:00Z");
  const s = await session(ctx, "highlights-user");
  const andorra = await s.call("get_highlights", { destination: "AD" });
  const grounded = andorra.data.places.find((p: { id: string }) => p.id === "ad-q2124368");
  assert.ok(grounded, "the grounded place is in the list");
  assert.equal(grounded.descSource, "wikipedia");
  assert.equal(grounded.article.url, "https://en.wikipedia.org/wiki/Casa_Rull_Museum");
  const japan = await s.call("get_highlights", { destination: "JP" });
  const curated = japan.data.places.find((p: { id: string }) => p.id === "jp-senso-ji");
  assert.equal(curated.descSource, "curated");
  assert.equal(curated.article, null);
  await s.close();
});

test("grounding: the note keeps the pack's own text and gets the description sentence once", () => {
  const original = "Selected from the Wikidata list by Waypoint. Hours change: verify on the official source.";
  const once = withGroundingNote(original);
  assert.ok(once.startsWith(original));
  assert.match(once, /descBy is wikipedia/);
  assert.equal(withGroundingNote(once), once, "running it again changes nothing");
  assert.ok(withGroundingNote(undefined).startsWith("Descriptions:"));
});
