// Live check of the deterministic tools on the deployed server (no model involved): a group of
// two, a trip, a plan made of catalog ids, payers and splits, the settle-up arithmetic,
// fairness, a booking with a free-cancellation date, and the calendar export.
// Usage: node scripts/tools-live.mjs https://xxxx.lambda-url.us-east-1.on.aws
const base = (process.argv[2] || process.env.WAYPOINT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
if (!/^https:\/\//.test(base)) {
  console.error("Pass the public https base URL.");
  process.exit(2);
}
const user = `tools-live-${Date.now()}`;
let id = 0;
async function call(name, args = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", "x-waypoint-user": user, "x-waypoint-locale": "en-US" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  const msg = JSON.parse(line ? line.slice(5) : text).result;
  if (msg.isError) throw new Error(`${name}: ${msg.content?.[0]?.text ?? "error"}`);
  return msg.structuredContent;
}
const check = (ok, what) => {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok  ${what}`);
};

try {
  await call("update_traveler_profile", {
    homeCurrency: "USD",
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult", likes: ["temples"] },
      { displayName: "Sam", passports: ["US"], role: "friend", ageBand: "adult", likes: ["nightlife"] },
    ],
  });
  await call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const hl = await call("get_highlights", { destination: "JP", interests: ["temples"] });
  const ids = hl.data.places.map((p) => p.id);
  check(ids.includes("jp-senso-ji"), "the catalog lists Senso-ji for temples");
  const plan = await call("build_itinerary", { plan: [{ day: 1, title: "Asakusa", stops: ["jp-senso-ji"] }] });
  check(plan.data.saved === true, "a catalog plan is saved");
  const bad = await call("build_itinerary", { plan: [{ day: 2, stops: ["jp-not-a-real-place"] }] });
  check(bad.data.saved === false && bad.data.violations[0].code === "unknown_place", "an invented place is refused");

  await call("log_expense", { amount: 100, currency: "USD", category: "dinner", payer: "Ana" });
  await call("log_expense", { amount: 40, currency: "USD", category: "taxi", payer: "Sam" });
  const settle = await call("settle_up");
  const b = settle.data.balances;
  check(Math.abs(b.Ana - 30) < 0.01 && Math.abs(b.Sam + 30) < 0.01, "balances: Ana +30, Sam -30 (100 and 40 split two ways)");
  check(settle.data.transfers.length === 1 && settle.data.transfers[0].from === "Sam" && settle.data.transfers[0].to === "Ana", "one transfer: Sam pays Ana");

  const fair = await call("plan_fairness");
  check(fair.data.rows.some((r) => r.traveler === "Ana" && r.liked === 1), "fairness: Ana likes the one planned stop");

  const booking = await call("add_booking", { kind: "hotel", title: "Shinjuku hotel", date: "2026-12-03", cancelBy: "2026-11-25", status: "confirmed" });
  check(booking.data.booking.cancelBy === "2026-11-25", "a booking keeps its free-cancellation date");

  const ics = await call("export_trip", { format: "ics" });
  check(/BEGIN:VCALENDAR/.test(ics.data.content) && ics.data.content.includes("END:VCALENDAR"), "the calendar export is a whole VCALENDAR");
  check((ics.data.content.match(/BEGIN:VEVENT/g) || []).length === 2, "the calendar has the trip and the planned day");
  console.log("\nTOOLS LIVE CHECK PASSED");
} finally {
  await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", "x-waypoint-user": user },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "forget_me", arguments: { confirm: true } } }),
  }).catch(() => {});
}
