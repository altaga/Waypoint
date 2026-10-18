import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearestCity, whereLine, fromHereRequest } from "../web/geo.js";

const cities = JSON.parse(readFileSync(new URL("../web/world-cities.json", import.meta.url), "utf8")).cities;

test("a position near a city names that city, in both languages", () => {
  const near = nearestCity(19.45, -99.1, cities)!;
  assert.equal(near.iso, "MX");
  assert.match(near.name.en, /Mexico City/);
  assert.match(near.name.es, /M[eé]xico/);
  assert.match(whereLine("en", near, "Japan"), /I see you're near .*Mexico City.*Want me to check your Japan plan from there\?/);
  assert.match(whereLine("es", near, "Japón"), /Veo que estás cerca de .*M[eé]xico.*¿Quieres que revise tu plan de Japón desde ahí\?/);
});

test("a position in the middle of the ocean names no city and sends no coordinates", () => {
  assert.equal(nearestCity(-45, -130, cities), null);
  assert.match(whereLine("en", null), /no city of my list is near/);
  assert.doesNotMatch(fromHereRequest("en", nearestCity(35.68, 139.7, cities), true), /\d{2}\.\d/);
});

test("the request carries the city name and whether there is a trip", () => {
  const near = nearestCity(1.35, 103.82, cities)!;
  assert.equal(fromHereRequest("en", near, true), "I'm in Singapore and I'll leave from here. Check my plan.");
  assert.match(fromHereRequest("es", near, false), /^Estoy en Singapur\. Quiero planear un viaje/);
});
