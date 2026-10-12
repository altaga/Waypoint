import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeftSentence, spokenDates, visaSentence, daysUntilTripSentence } from "../../src/voice.ts";

test("dates are said as people say them", () => {
  assert.equal(spokenDates("2026-11-03", "2026-11-10", "es"), "del 3 al 10 de noviembre");
  assert.equal(spokenDates("2026-12-28", "2027-01-03", "es"), "del 28 de diciembre al 3 de enero");
  assert.equal(spokenDates("2026-12-05", "2026-12-05", "es"), "el 5 de diciembre");
  assert.equal(spokenDates("2026-11-03", "2026-11-10", "en"), "from November 3 to 10");
  assert.equal(spokenDates("2026-12-28", "2027-01-03", "en"), "from December 28 to January 3");
});

test("day counts agree in number, and today and tomorrow are said as such", () => {
  assert.equal(daysLeftSentence(22, "es"), "Faltan 22 días.");
  assert.equal(daysLeftSentence(1, "es"), "Sales mañana.");
  assert.equal(daysLeftSentence(0, "en"), "You leave today.");
  assert.equal(daysUntilTripSentence(1, "Japón", "es"), "Sales mañana a Japón.");
});

test("visa status is a sentence, to the user or about a named traveler", () => {
  assert.equal(visaSentence("visa_free", 90, "es"), "No necesitas visa para estancias de hasta 90 días.");
  assert.equal(visaSentence("visa_free", 90, "es", "Ana"), "Ana no necesita visa para estancias de hasta 90 días.");
  assert.equal(visaSentence("visa_required", undefined, "en"), "You need a visa; apply before you travel.");
  for (const status of ["visa_free", "same_country", "visa_on_arrival", "e_visa", "eta", "visa_required", "no_admission", "unknown"] as const) {
    for (const l of ["en", "es"] as const) assert.ok(visaSentence(status, 30, l).length > 10);
  }
});
