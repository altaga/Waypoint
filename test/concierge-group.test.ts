import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-13T12:00:00Z") });

async function session(user: string) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, "en").connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  return { call, close: () => client.close() };
}

async function group(user: string) {
  const s = await session(user);
  await s.call("update_traveler_profile", {
    homeCurrency: "USD",
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult", likes: ["temples", "food"], avoid: ["nightlife"] },
      { displayName: "Sam", passports: ["US"], role: "friend", ageBand: "adult", likes: ["nightlife", "food"] },
      { displayName: "Priya", passports: ["IN"], role: "friend", ageBand: "adult" },
    ],
  });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  return s;
}

test("settle up: uneven costs produce the fewest transfers that square the group", async () => {
  const s = await group("settle-user");
  await s.call("log_expense", { amount: 90, currency: "USD", category: "dinner", payer: "Ana" });
  await s.call("log_expense", { amount: 30, currency: "USD", category: "taxi", payer: "Sam", splitAmong: ["Sam", "Priya"] });
  const r = await s.call("settle_up");
  const b = r.data.balances as Record<string, number>;
  // Dinner: 90 split three ways (30 each). Taxi: 30 split between Sam and Priya (15 each).
  assert.equal(b.Ana, 60);
  assert.equal(b.Sam, -15);
  assert.equal(b.Priya, -45);
  const total = r.data.transfers.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  assert.equal(Math.round(total * 100) / 100, 60);
  assert.ok(r.data.transfers.every((t: { to: string }) => t.to === "Ana"));
  await s.close();
});

test("settle up: expenses without a payer are reported, never guessed", async () => {
  const s = await group("settle-nopayer");
  await s.call("log_expense", { amount: 50, currency: "USD", category: "museum" });
  const r = await s.call("settle_up");
  assert.equal(r.data.unassigned, 1);
  assert.equal(r.data.transfers.length, 0);
  await s.close();
});

test("fairness: each traveler's likes are scored, and an avoided stop is flagged", async () => {
  const s = await group("fair-user");
  await s.call("build_itinerary", { plan: [{ day: 1, stops: ["jp-senso-ji", "jp-omoide-yokocho"] }] });
  const r = await s.call("plan_fairness");
  const rows = r.data.rows as { traveler: string; liked: number; stops: number; clash: string[] }[];
  const ana = rows.find((x) => x.traveler === "Ana")!;
  // Senso-ji matches her "temples" and Omoide Yokocho matches her "food": both count as liked.
  assert.equal(ana.liked, 2);
  assert.equal(ana.clash.length, 1, "Omoide Yokocho is nightlife, which Ana avoids");
  const priya = rows.find((x) => x.traveler === "Priya")!;
  assert.equal(priya.stops, 2);
  await s.close();
});

test("bookings: a free-cancellation date becomes a deadline in the brief, and pasted bookings wait for confirmation", async () => {
  const s = await group("book-user");
  const hotel = await s.call("add_booking", { kind: "hotel", title: "Shinjuku hotel", date: "2026-12-03", cancelBy: "2026-11-25", reference: "HX-88", status: "to_confirm" });
  assert.equal(hotel.data.booking.status, "to_confirm");
  const brief = await s.call("trip_brief");
  assert.ok(brief.data.deadlines.length === 0 || brief.data.deadlines[0].title === "Shinjuku hotel");
  assert.ok(brief.data.pending.some((p: string) => p.includes("Confirm") || p.includes("Confirma")));
  await s.call("confirm_booking", { bookingId: hotel.data.booking.id });
  const after = await s.call("trip_brief");
  assert.ok(!after.data.pending.some((p: string) => p.includes("Confirm the details")));
  await s.close();
});

test("export: the calendar file has the trip and each planned day; markdown names the places", async () => {
  const s = await group("export-user");
  await s.call("build_itinerary", { plan: [{ day: 1, title: "Asakusa", stops: ["jp-senso-ji"] }] });
  const ics = await s.call("export_trip", { format: "ics" });
  assert.match(ics.data.content, /BEGIN:VCALENDAR/);
  assert.equal((ics.data.content.match(/BEGIN:VEVENT/g) ?? []).length, 2, "the trip and day 1");
  const md = await s.call("export_trip", { format: "markdown" });
  assert.match(md.data.content, /Senso-ji/);
  await s.close();
});
