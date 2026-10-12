import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Offline checks for the rules Amazon's SMAPI enforces on the interaction model, so a model
// error fails here instead of in the deploy (the first deploy failed on slot names and on
// samples that mixed a phrase slot with another slot).

type Slot = { name: string; type: string };
type Intent = { name: string; slots?: Slot[]; samples?: string[] };
type SlotType = { name: string; values: { id?: string; name: { value: string; synonyms?: string[] } }[] };
type Model = { interactionModel: { languageModel: { invocationName: string; intents: Intent[]; types?: SlotType[] } } };

const LOCALES = ["en-US", "es-MX"];
const load = (l: string) => JSON.parse(readFileSync(`skill/interactionModels/custom/${l}.json`, "utf8")) as Model;

for (const locale of LOCALES) {
  const lm = load(locale).interactionModel.languageModel;
  const typeNames = new Set((lm.types ?? []).map((t) => t.name));

  test(`${locale}: invocation name is lowercase words`, () => {
    assert.match(lm.invocationName, /^[a-z][a-z ]*$/);
  });

  test(`${locale}: required built-in intents are present`, () => {
    for (const name of ["AMAZON.CancelIntent", "AMAZON.HelpIntent", "AMAZON.StopIntent", "AMAZON.FallbackIntent"]) {
      assert.ok(lm.intents.some((i) => i.name === name), name);
    }
  });

  test(`${locale}: slot names use letters, periods and underscores only, and types exist`, () => {
    for (const i of lm.intents) {
      for (const s of i.slots ?? []) {
        assert.match(s.name, /^[A-Za-z][A-Za-z._]*$/, `${i.name}.${s.name}`);
        assert.ok(s.type.startsWith("AMAZON.") || typeNames.has(s.type), `${i.name}.${s.name}: type ${s.type} is not defined`);
      }
    }
  });

  test(`${locale}: every slot in a sample is declared by its intent`, () => {
    for (const i of lm.intents) {
      const declared = new Set((i.slots ?? []).map((s) => s.name));
      for (const sample of i.samples ?? []) {
        for (const m of sample.matchAll(/\{([^}]*)\}/g)) assert.ok(declared.has(m[1]), `${i.name}: "${sample}" uses undeclared {${m[1]}}`);
      }
    }
  });

  test(`${locale}: a phrase slot is never mixed with another slot, and has words around it`, () => {
    for (const i of lm.intents) {
      const phrase = new Set((i.slots ?? []).filter((s) => s.type === "AMAZON.SearchQuery").map((s) => s.name));
      for (const sample of i.samples ?? []) {
        const used = [...sample.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
        if (!used.some((u) => phrase.has(u))) continue;
        assert.equal(used.length, 1, `${i.name}: "${sample}" mixes a phrase slot with another slot`);
        assert.ok(sample.replace(/\{[^}]*\}/g, "").trim().length > 0, `${i.name}: "${sample}" has no carrier phrase`);
      }
    }
  });

  test(`${locale}: samples use letters, spaces, apostrophes, periods and hyphens (no digits or symbols)`, () => {
    for (const i of lm.intents) {
      for (const sample of i.samples ?? []) assert.match(sample, /^[\p{L}\s'.\-{}]+$/u, `${i.name}: "${sample}"`);
    }
  });

  test(`${locale}: no sample appears twice, in one intent or across intents`, () => {
    const seen = new Map<string, string>();
    for (const i of lm.intents) {
      for (const sample of i.samples ?? []) {
        const key = sample.toLowerCase().replace(/\s+/g, " ").trim();
        assert.ok(!seen.has(key), `"${sample}" is in ${seen.get(key)} and ${i.name}`);
        seen.set(key, i.name);
      }
    }
  });

  test(`${locale}: custom slot values are clean and not repeated`, () => {
    for (const t of lm.types ?? []) {
      const seen = new Set<string>();
      for (const v of t.values) {
        for (const word of [v.name.value, ...(v.name.synonyms ?? [])]) {
          assert.match(word, /^[\p{L}\s'.\-]+$/u, `${t.name}: "${word}"`);
          const key = word.toLowerCase();
          assert.ok(!seen.has(key), `${t.name}: "${word}" is repeated`);
          seen.add(key);
        }
      }
    }
  });
}

test("both locales have the same intents with the same slots", () => {
  const shape = (l: string) =>
    load(l)
      .interactionModel.languageModel.intents.map((i) => `${i.name}(${(i.slots ?? []).map((s) => `${s.name}:${s.type}`).join(",")})`)
      .sort();
  assert.deepEqual(shape("es-MX"), shape("en-US"));
});
