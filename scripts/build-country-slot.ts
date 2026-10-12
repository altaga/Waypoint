import { readFileSync, writeFileSync } from "node:fs";
import { countries } from "countries-list";
import { ALIASES, EN_DEMONYMS, ES_DEMONYMS, GENTILICIOS, SPANISH_NAMES } from "../src/countries.ts";

// Builds the WaypointCountry slot type for both interaction models, and the intents that use it.
// Each value's id is the ISO alpha-2 code, so the skill gets "MX" back even when the user says
// "mexicano" or "Mexican". Synonyms: English and Spanish names, aliases and demonyms.
// Run: npx tsx scripts/build-country-slot.ts

// Slot values: letters, spaces, apostrophes, hyphens and periods only.
function clean(s: string): string {
  return s.normalize("NFC").replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^\p{L}\s'.-]/gu, " ").replace(/\s+/g, " ").trim();
}

function buildType(locale: "es-MX" | "en-US") {
  const es = locale === "es-MX";
  const used = new Set<string>();
  const entries: { id: string; value: string; synonyms: string[] }[] = [];
  const names = (iso: string) => (es ? SPANISH_NAMES[iso] ?? countries[iso as keyof typeof countries].name : countries[iso as keyof typeof countries].name);
  // Values first, so no synonym repeats another value.
  for (const iso of Object.keys(countries)) {
    const value = clean(names(iso));
    if (!value || used.has(value.toLowerCase())) continue;
    used.add(value.toLowerCase());
    entries.push({ id: iso, value, synonyms: [] });
  }
  const add = (iso: string, raw: string) => {
    const e = entries.find((x) => x.id === iso);
    const v = clean(raw);
    if (!e || !v || used.has(v.toLowerCase())) return;
    used.add(v.toLowerCase());
    e.synonyms.push(v);
  };
  for (const e of entries) {
    add(e.id, countries[e.id as keyof typeof countries].name);
    if (SPANISH_NAMES[e.id]) add(e.id, SPANISH_NAMES[e.id]);
  }
  for (const [word, iso] of Object.entries(GENTILICIOS)) add(iso, word);
  for (const [word, iso] of Object.entries(ALIASES)) add(iso, word);
  for (const [iso, list] of Object.entries(EN_DEMONYMS)) for (const w of list) add(iso, w);
  for (const [iso, list] of Object.entries(ES_DEMONYMS)) for (const w of list) add(iso, w);
  return {
    name: "WaypointCountry",
    values: entries.map((e) => ({ id: e.id, name: { value: e.value, ...(e.synonyms.length ? { synonyms: e.synonyms } : {}) } })),
  };
}

for (const locale of ["es-MX", "en-US"] as const) {
  const file = `skill/interactionModels/custom/${locale}.json`;
  const model = JSON.parse(readFileSync(file, "utf8"));
  const lm = model.interactionModel.languageModel;
  lm.types = [buildType(locale)];
  const byName = (n: string) => lm.intents.find((i: { name: string }) => i.name === n);
  // People-related country slots use the custom type; destinations keep AMAZON.Country.
  for (const [intent, slot] of [["SetPassportIntent", "country"], ["SetPassportIntent", "secondCountry"], ["SetResidenceIntent", "country"]]) {
    const s = byName(intent)?.slots.find((x: { name: string }) => x.name === slot);
    if (s) s.type = "WaypointCountry";
  }
  // A bare country answer, resolved by what the skill just asked (see the skill's session state).
  if (!byName("CountryAnswerIntent")) {
    const at = lm.intents.findIndex((i: { name: string }) => i.name.startsWith("AMAZON."));
    lm.intents.splice(at, 0, { name: "CountryAnswerIntent", slots: [{ name: "country", type: "WaypointCountry" }], samples: ["{country}"] });
  }
  if (!byName("AMAZON.FallbackIntent")) lm.intents.push({ name: "AMAZON.FallbackIntent", samples: [] });
  writeFileSync(file, JSON.stringify(model, null, 2) + "\n");
  console.log(locale, "values:", lm.types[0].values.length);
}
