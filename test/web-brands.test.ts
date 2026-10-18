import { test } from "node:test";
import assert from "node:assert/strict";
import { brandsIn, brandStrip, brandChip } from "../web/brands.js";
import { BRAND_ICONS } from "../web/brand-icons.js";
import { renderTool } from "../web/cards.js";

// Brand chips: found by name in the text of a card, never guessed; the marks are off unless the page turns them on.
test("brands are found in the order they are written, once each", () => {
  assert.deepEqual(brandsIn("PayPay, LINE Pay, Rakuten Pay y MerPay son las apps QR más comunes. Apple Pay, Google Pay y Alipay a veces no funcionan.").map((b) => b.name),
    ["PayPay", "LINE Pay", "Rakuten Pay", "MerPay", "Apple Pay", "Google Pay", "Alipay"]);
  assert.deepEqual(brandsIn("Visa, Mastercard and JCB at large hotels. Visa again.").map((b) => b.name), ["Visa", "Mastercard", "JCB"]);
  assert.deepEqual(brandsIn("Suica or PASMO IC card, bought at station machines").map((b) => [b.name, b.kind]), [["Suica", "transit"], ["PASMO", "transit"]]);
});

test("a word that is only a brand sometimes is not read as one", () => {
  assert.deepEqual(brandsIn("e-visa required; do not grab a taxi; la ola de calor"), []);
  assert.deepEqual(brandsIn("Rakuten Pay").map((b) => b.name), ["Rakuten Pay"]);
  assert.deepEqual(brandsIn("Rakuten").map((b) => b.name), ["Rakuten"]);
});

test("a chip carries the kind's icon and, when the brand has one, its mark; the name is always text", () => {
  const withMark = brandChip({ name: "Uber", kind: "ride", icon: "uber" });
  assert.match(withMark, /class="g"/);
  assert.match(withMark, /class="lg"/);
  assert.match(withMark, /<b>Uber<\/b>/);
  const without = brandChip({ name: "Rappi", kind: "delivery", icon: null });
  assert.match(without, /class="lg gl"/);
  assert.equal(brandStrip("nothing to see here"), "");
  assert.ok(brandStrip("Visa").includes('class="brands"'));
});

test("every icon named in the brand list exists in the icon file, and the names are escaped", () => {
  for (const name of Object.keys(BRAND_ICONS)) { assert.match(BRAND_ICONS[name].d, /^M/); assert.match(BRAND_ICONS[name].vb, /^[\d. -]+$/); }
  assert.doesNotMatch(brandChip({ name: "<b>x</b>", kind: "card", icon: null }), /<b>x<\/b>/);
});

test("the payment, app and transit cards show chips; other cards do not", () => {
  const sc = { card: { title: "Payments in Japan", rows: [{ label: "QR and e-wallets", value: "PayPay, LINE Pay and MerPay are the most common QR apps.", status: "info" }, { label: "Cash", value: "Still needed.", status: "info" }] }, sources: [] };
  const pay = renderTool("get_payment_methods", sc, "en");
  assert.match(pay, /class="bchip b-wallet( linked)?"/);
  assert.match(pay, /href="https:\/\/(play\.google\.com|apps\.apple\.com)\//); // a chip with a verified app link opens its store page
  assert.equal((pay.match(/class="brands"/g) || []).length, 1);
  const apps = renderTool("get_local_apps", { card: { title: "Apps in Japan", rows: [{ label: "Uber", value: "On the company's list", status: "ok" }, { label: "Rappi", value: "No verified data", status: "warn" }] }, sources: [] }, "en");
  assert.match(apps, /<b>Uber<\/b>/);
  assert.match(apps, /<b>Rappi<\/b>/);
  assert.doesNotMatch(renderTool("get_local_rules", sc, "en"), /class="bchip /);
});

test("each stop of the day plan shows its suggested time and an https map link; anything else is not drawn as a link", () => {
  const day = (url: string) => ({ data: { days: [{ day: 1, stops: [{ name: "Senso-ji", area: "Asakusa", category: "sight", durationMinutes: 90, start: "09:00", end: "10:30", mapsUrl: url }] }] }, sources: [] });
  const ok = renderTool("build_itinerary", day("https://www.google.com/maps/search/?api=1&query=Senso-ji"), "en");
  assert.match(ok, /09:00–10:30/);
  assert.match(ok, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Senso-ji"/);
  assert.match(ok, /rel="noopener noreferrer"/);
  assert.match(ok, /Suggested times, not opening hours/);
  assert.doesNotMatch(renderTool("build_itinerary", day("javascript:alert(1)"), "en"), /<a /);
});

test("an exchange-rate card dates the rate, says if it is live, and does not claim a review", () => {
  const base = { card: { title: "Budget", rows: [{ label: "Exchange", value: "MXN 20,000 = JPY 171,132", status: "info" }] }, sources: [{ id: "src:open-er-api", title: "Open Exchange Rates (open.er-api.com)", retrieved: "Sun, 18 Oct 2026" }], review: "curated", lastVerified: "2026-10-11", confidence: "high" };
  const live = renderTool("convert_budget", { ...base, data: { rateSource: "live" } }, "en");
  assert.match(live, /Open Exchange Rates · rate of Sun, 18 Oct 2026 · live, the provider updates it daily · confidence: high/);
  assert.doesNotMatch(live, /not yet reviewed|sources checked/);
  assert.match(renderTool("convert_budget", { ...base, data: { rateSource: "snapshot" } }, "es"), /tasa del Sun, 18 Oct 2026 · copia guardada, no en vivo/);
});
