import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang } from "../web/lang.js";

// The host follows the language the traveler writes in. Only clear messages switch it.
test("a Spanish message switches the host to Spanish", () => {
  assert.equal(detectLang("Hola. Tengo pasaporte mexicano y quiero ir a Japón del 3 al 10 de diciembre."), "es");
  assert.equal(detectLang("¿Qué me falta?"), "es");
  assert.equal(detectLang("Ármame los primeros 3 días: me gusta la comida y los templos."), "es");
});

test("an English message switches the host to English", () => {
  assert.equal(detectLang("My passport is Mexican"), "en");
  assert.equal(detectLang("Can I bring vapes to Singapore?"), "en");
  assert.equal(detectLang("How much is 1000 dollars in yen?"), "en");
  assert.equal(detectLang("What's left for my trip?"), "en");
});

test("a message that does not say stays in the current language", () => {
  assert.equal(detectLang("Japan"), null);
  assert.equal(detectLang(""), null);
  assert.equal(detectLang("   "), null);
});
