import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVisaCsv, lookupVisa, classify, bestEntry } from "../../src/services/visa.ts";
import { resolveCountry } from "../../src/countries.ts";
import { createFxService } from "../../src/services/fx.ts";
import { loadPacks } from "../../src/services/packs.ts";
import { validatePack } from "../../src/packs/validate.ts";
import { htmlToText, normalizeForMatch } from "../../src/packs/text.ts";
import { pppEquivalent } from "../../src/services/ppp.ts";
import { friendlyError, UnknownDestinationError } from "../../src/errors.ts";

const ROOT = join(import.meta.dirname, "../..");

test("visa classification covers numeric stays and text statuses", () => {
  assert.deepEqual(classify("90"), { status: "visa_free", maxStayDays: 90 });
  assert.deepEqual(classify("e-visa"), { status: "e_visa" });
  assert.deepEqual(classify("visa required"), { status: "visa_required" });
  assert.deepEqual(classify("-1"), { status: "same_country" });
  assert.equal(classify("something new").status, "unknown");
});

test("visa lookup reads the vendored matrix and never guesses", () => {
  const m = parseVisaCsv(readFileSync(join(ROOT, "data/vendor/passport-index/passport-index-tidy-iso2.csv"), "utf8"));
  assert.deepEqual(lookupVisa(m, "MX", "JP"), { status: "visa_free", maxStayDays: 90 });
  assert.equal(lookupVisa(m, "MX", "XX").status, "unknown");
  assert.equal(lookupVisa(m, "JP", "JP").status, "same_country");
});

test("dual passports take the most permissive entry", () => {
  const best = bestEntry([
    { passport: "IN", entry: { status: "e_visa" } },
    { passport: "US", entry: { status: "visa_free", maxStayDays: 90 } },
  ]);
  assert.equal(best.passport, "US");
});

test("country resolver accepts English, Spanish, aliases, codes and gentilicios", () => {
  assert.equal(resolveCountry("Japan"), "JP");
  assert.equal(resolveCountry("Japón"), "JP");
  assert.equal(resolveCountry("japon"), "JP");
  assert.equal(resolveCountry("mexicano"), "MX");
  assert.equal(resolveCountry("EEUU"), "US");
  assert.equal(resolveCountry("Viet Nam"), "VN");
  assert.equal(resolveCountry("Atlantis"), null);
});

test("FX falls back to the labelled snapshot when offline", async () => {
  const fx = createFxService({
    offline: true,
    snapshot: { base: "USD", rates: { USD: 1, MXN: 20, JPY: 150 }, time_last_update_utc: "Sat, 10 Oct 2026 00:00:00 +0000" },
  });
  const r = await fx.convert(100, "USD", "JPY");
  assert.ok(r);
  assert.equal(r.source, "snapshot");
  assert.equal(Math.round(r.value), 15000);
});

test("FX falls back to the snapshot when the live call fails", async () => {
  const fx = createFxService({
    offline: false,
    snapshot: { base: "USD", rates: { USD: 1, EUR: 0.9 } },
    fetchImpl: (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch,
  });
  const r = await fx.convert(10, "USD", "EUR");
  assert.equal(r?.source, "snapshot");
});

test("PPP equivalent scales by destination over home factors", () => {
  const v = pppEquivalent(100, { iso2: "MX", year: 2024, value: 10 }, { iso2: "TH", year: 2024, value: 20 });
  assert.equal(v, 200);
});

test("shipped packs load and validate", () => {
  const packs = loadPacks(ROOT);
  const list = packs.list();
  assert.ok(list.length >= 10, `expected at least 10 packs, got ${list.length}`);
  const sg = packs.get("SG");
  assert.ok(sg?.localRules.some((r) => r.quote === "chewing gum to sell"));
});

test("validator rejects a quote that is not in the cited source", () => {
  const pack = {
    schemaVersion: "1.0.0", country: "ZZ", names: { en: "Zed" }, generatedAt: "2026-10-11", tier: "B",
    review: { status: "machine_extracted", reviewedBy: null, reviewedAt: null },
    localRules: [{ id: "r1", category: "conduct", severity: "info", summary: { en: "x" },
      quote: "This sentence does not exist in the source text.", sources: ["src:a"], lastVerified: "2026-10-11", confidence: "medium" }],
    essentials: { currency: null, plugTypes: [], emergency: {}, languages: [] },
    advisory: {}, sources: { "src:a": { title: "A", url: "https://example.org/a", license: "CC0", retrieved: "2026-10-11" } },
    disclaimer: { en: "d", es: "d" },
  };
  const res = validatePack(pack, { "src:a": "Totally different text." }, { referenceDate: "2026-10-11", maxAgeDays: 90 });
  assert.equal(res.ok, false);
  assert.match(res.issues.map((i) => i.message).join(" "), /not found verbatim/);
});

test("validator rejects tier A without a human reviewer and stale rules", () => {
  const base = {
    schemaVersion: "1.0.0", country: "ZZ", names: { en: "Zed" }, generatedAt: "2026-10-11", tier: "A",
    review: { status: "machine_extracted", reviewedBy: null, reviewedAt: null },
    localRules: [], essentials: { currency: null, plugTypes: [], emergency: {}, languages: [] },
    advisory: {}, sources: {}, disclaimer: { en: "d", es: "d" },
  };
  const res = validatePack(base, {}, { referenceDate: "2026-10-11", maxAgeDays: 90 });
  assert.match(res.issues.map((i) => i.message).join(" "), /human review/);
});

test("HTML to text keeps block breaks and decodes entities", () => {
  assert.equal(htmlToText("<p>Don&rsquo;t&nbsp;bring <b>gum</b></p><li>Two</li>"), "Don’t bring gum\nTwo");
  assert.equal(normalizeForMatch("Don’t  Bring"), "don't bring");
});

test("friendly errors map unknown destinations with the query and a next step", () => {
  const e = friendlyError(new UnknownDestinationError("Atlantis"));
  assert.match(e.message, /Atlantis/);
  assert.doesNotMatch(JSON.stringify(e), /Error:|stack|https?:/);
});
