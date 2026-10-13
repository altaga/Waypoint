// Live check of the deployed concierge: the page loads, and the Bedrock brain runs a
// multi-tool trip turn through the public URL exactly as the simulated Alexa+ host does.
// Usage: node scripts/concierge-live.mjs https://xxxx.lambda-url.us-east-1.on.aws
const base = (process.argv[2] || process.env.WAYPOINT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
if (!/^https:\/\//.test(base)) {
  console.error("Pass the public https base URL.");
  process.exit(2);
}
const origin = base;
const user = `live-check-${Date.now()}`;

async function brain(utterance, history, locale) {
  const started = Date.now();
  const res = await fetch(`${base}/api/brain`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-waypoint-user": user, "x-waypoint-locale": locale },
    body: JSON.stringify({ utterance, history }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`brain HTTP ${res.status} ${body.error ?? ""} ${body.kind ?? ""}`);
  console.log(`\nUSER: ${utterance}\nWAYPOINT (${Date.now() - started} ms): ${body.text}\nTOOLS: ${body.calls.map((c) => c.tool + (c.isError ? "(error)" : "")).join(", ")}`);
  return body;
}

const page = await fetch(`${base}/`);
const html = await page.text();
if (page.status !== 200 || !/simulated Alexa\+ host/.test(html)) throw new Error(`root page HTTP ${page.status}`);
console.log("PAGE OK");

const history = [];
const t1 = "Hola. Tengo pasaporte mexicano y quiero ir a Japón del 3 al 10 de diciembre.";
const r1 = await brain(t1, history, "es-MX");
const tools1 = r1.calls.map((c) => c.tool);
for (const need of ["update_traveler_profile", "plan_trip", "check_entry_requirements"]) {
  if (!tools1.includes(need)) throw new Error(`turn 1 did not call ${need}`);
}
if (/[*#|]|```|https?:\/\//.test(r1.text)) throw new Error("turn 1 has markdown or URLs in the spoken answer");
history.push({ role: "user", text: t1 }, { role: "assistant", text: r1.text });

const t2 = "¿Qué me falta?";
const r2 = await brain(t2, history, "es-MX");
if (!r2.calls.some((c) => c.tool === "trip_brief" || c.tool === "packing_checklist")) throw new Error("turn 2 did not check what is pending");

history.push({ role: "user", text: t2 }, { role: "assistant", text: r2.text });
const t3 = "Ármame los primeros 3 días: me gusta la comida y los templos.";
const r3 = await brain(t3, history, "es-MX");
const plan = r3.calls.find((c) => c.tool === "build_itinerary" && !c.isError);
if (!plan || !(plan.structured?.data?.planned > 0)) throw new Error("turn 3 did not write and save a day plan");

// Clean up the test user.
await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", "x-waypoint-user": user },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "forget_me", arguments: { confirm: true } } }),
}).catch(() => {});
console.log("\nCONCIERGE LIVE CHECK PASSED");
