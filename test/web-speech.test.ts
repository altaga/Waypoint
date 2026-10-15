import { test } from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../web/speech.js";

// The voice must not spell out codes: a currency code is said as its name, after the amount.
test("a currency code is said as its name, after the amount", () => {
  assert.equal(speakable("MXN 1,000 son unos USD 54.16.", "es-MX"), "1,000 pesos mexicanos son unos 54.16 dólares estadounidenses.");
  assert.equal(speakable("USD 54.16 is about MXN 1,000.", "en-US"), "54.16 US dollars is about 1,000 Mexican pesos.");
});

test("an unknown code is left alone rather than guessed", () => {
  assert.equal(speakable("ABC 10", "es-MX"), "ABC 10");
});

test("eTA and e-visa are said as words in the language of the reply", () => {
  assert.equal(speakable("Tu lista: eTA o e-visa.", "es"), "Tu lista: autorización electrónica de viaje o visa electrónica.");
  assert.equal(speakable("Your list: eTA or e-visa.", "en"), "Your list: electronic travel authorization or e-visa.");
});

test("arrows and dots become pauses, not noise", () => {
  assert.equal(speakable("2026-12-03 → 2026-12-10 · 8 días", "es"), "2026-12-03, 2026-12-10, 8 días");
  assert.equal(speakable("a – b", "en"), "a, b");
});

test("text with no codes is unchanged", () => {
  assert.equal(speakable("Listo: tu viaje a Japón del 3 al 10 de diciembre.", "es-MX"), "Listo: tu viaje a Japón del 3 al 10 de diciembre.");
});
