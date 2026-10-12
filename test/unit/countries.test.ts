import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCountry, resolveCountry, normalize, editDistance } from "../../src/countries.ts";

// Free-text countries: exact after normalizing, tolerant to a typo only when one country is nearest.

test("accents, case and punctuation are ignored", () => {
  assert.equal(resolveCountry("Perú"), "PE");
  assert.equal(resolveCountry("peru"), "PE");
  assert.equal(resolveCountry("MÉXICO"), "MX");
  assert.equal(resolveCountry("EE.UU."), "US");
  assert.equal(resolveCountry("  japon "), "JP");
  assert.equal(normalize("Côte d'Ivoire"), "cote d ivoire");
});

test("ISO codes still resolve", () => {
  assert.equal(resolveCountry("MX"), "MX");
  assert.equal(resolveCountry("jp"), "JP");
  assert.equal(resolveCountry("ZZ"), null);
});

test("demonyms resolve in both languages", () => {
  for (const [word, iso] of [["mexicano", "MX"], ["Mexican", "MX"], ["estadounidense", "US"], ["American", "US"], ["peruana", "PE"], ["Turkish", "TR"], ["alemán", "DE"]] as const) {
    assert.equal(resolveCountry(word), iso, word);
  }
});

test("a one-letter typo resolves to the nearest country and is marked as not exact", () => {
  for (const [typo, iso] of [["Mexco", "MX"], ["Thiland", "TH"], ["Brazl", "BR"], ["Singapor", "SG"], ["mexicanoo", "MX"], ["estadounidence", "US"], ["Mexicno", "MX"]] as const) {
    const m = matchCountry(typo);
    assert.equal(m?.iso, iso, typo);
    assert.equal(m?.exact, false, typo);
  }
});

test("an exact name is marked as exact", () => {
  assert.equal(matchCountry("Japón")?.exact, true);
});

test("things that are not countries are not guessed", () => {
  for (const word of ["Narnia", "Atlantis", "xyz", "banana", "pasaporte", "hola"]) {
    assert.equal(resolveCountry(word), null, word);
  }
});

test("short words are never guessed from a typo", () => {
  assert.equal(resolveCountry("Per"), null);
  assert.equal(resolveCountry("Chia"), null);
  assert.equal(resolveCountry("Cuna"), null);
});

test("a tie between two countries returns null instead of picking one", () => {
  // 'nigeri' is one edit from both Nigeria and Niger.
  assert.equal(resolveCountry("Nigeri"), null);
});

test("edit distance counts a swap of neighbouring letters as one", () => {
  assert.equal(editDistance("japon", "jpaon"), 1);
  assert.equal(editDistance("mexico", "mexico"), 0);
  assert.equal(editDistance("mexco", "mexico"), 1);
});
