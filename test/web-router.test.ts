import { test } from "node:test";
import assert from "node:assert/strict";
import { routeUtterance } from "../web/router.js";

// The local router answers the rules questions a traveler asks during a demo, with or without a country in the question.
test("\"what can't I bring\" is answered for the trip on the screen", () => {
  assert.deepEqual(routeUtterance("¿Qué no puedo llevar?", { destination: "JP" }), { tool: "get_local_rules", args: { destination: "JP", categories: ["prohibited_items"] } });
  assert.deepEqual(routeUtterance("What can't I bring?", { destination: "JP" }), { tool: "get_local_rules", args: { destination: "JP", categories: ["prohibited_items"] } });
});

test("a country named in the question wins over the trip on the screen", () => {
  assert.deepEqual(routeUtterance("¿Puedo llevar vapes a Singapur?", { destination: "JP" }), { tool: "get_local_rules", args: { destination: "SG", categories: ["prohibited_items"] } });
});

test("without a trip or a country, the router says it does not know rather than guessing", () => {
  assert.equal(routeUtterance("¿Qué no puedo llevar?"), null);
});

test("a cost with the name of who paid is logged for that traveler, shared by everyone", () => {
  const r = routeUtterance("Gasté 900 pesos de la cena, pagó Ana");
  assert.equal(r?.tool, "log_expense");
  assert.equal(r?.args.amount, 900);
  assert.equal(r?.args.category, "food");
  assert.equal(r?.args.payer, "Ana");
  assert.equal("splitAmong" in (r?.args ?? {}), false);
});

test("a question about money is not logged as an expense", () => {
  assert.notEqual(routeUtterance("¿Cuánto pagó Ana por la cena?")?.tool, "log_expense");
});

test("a question about how to pay goes to the payment methods of the trip's country", () => {
  assert.deepEqual(routeUtterance("¿Aceptan tarjeta en Japón?"), { tool: "get_payment_methods", args: { destination: "JP", topic: "cards" } });
  assert.deepEqual(routeUtterance("¿Puedo pagar con QR?", { destination: "VN" }), { tool: "get_payment_methods", args: { destination: "VN", topic: "qr" } });
  assert.deepEqual(routeUtterance("¿Hay cajeros que acepten tarjeta extranjera?", { destination: "JP" }), { tool: "get_payment_methods", args: { destination: "JP", topic: "atm" } });
  // A country the router does not know is not answered with the trip's country.
  assert.equal(routeUtterance("¿Aceptan tarjeta en Perú?", { destination: "JP" }), null);
});

// Passports are registered from plain words; a companion with no passport makes the server ask for it.
test("\"my passport is Mexican\" registers the speaker, in English and Spanish", () => {
  assert.deepEqual(routeUtterance("My passport is Mexican"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Me", role: "self", passports: ["Mexican"] }] } });
  assert.deepEqual(routeUtterance("Mi pasaporte es mexicano"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Yo", role: "self", passports: ["mexicano"] }] } });
  assert.deepEqual(routeUtterance("I have an Indian passport"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Me", role: "self", passports: ["Indian"] }] } });
});

test("adding a companion keeps the passport when it is given and leaves it out when it is not", () => {
  assert.deepEqual(routeUtterance("Add Sam"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Sam", role: "friend" }] } });
  assert.deepEqual(routeUtterance("Add my friend Priya, Indian passport"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Priya", role: "friend", passports: ["Indian"] }] } });
  assert.deepEqual(routeUtterance("Agrega a Sam con pasaporte de Estados Unidos"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Sam", role: "friend", passports: ["Estados Unidos"] }] } });
});

test("sentences that only look like a passport or an addition are not read as one", () => {
  assert.equal(routeUtterance("I have a trip to Japan from December 3 to 10")?.tool === "update_traveler_profile", false);
  assert.equal(routeUtterance("Add Sam to the calendar"), null);
  assert.equal(routeUtterance("Add Japan"), null);
});

test("a companion's passport can be given on its own, after the host asked for it", () => {
  assert.deepEqual(routeUtterance("Sam's passport is American"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Sam", passports: ["American"] }] } });
  assert.deepEqual(routeUtterance("Priya has an Indian passport"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Priya", passports: ["Indian"] }] } });
  assert.deepEqual(routeUtterance("Sam tiene pasaporte de Estados Unidos"), { tool: "update_traveler_profile", args: { travelers: [{ displayName: "Sam", passports: ["Estados Unidos"] }] } });
});

// The suggested chips must reach a tool when the local router answers.
test("every suggested chip is understood by the local router", () => {
  const ctx = { destination: "JP" };
  assert.equal(routeUtterance("Plan my days: food and temples", ctx)?.tool, "build_itinerary");
  assert.equal(routeUtterance("Arma mis días: comida y templos", ctx)?.tool, "build_itinerary");
  assert.equal(routeUtterance("What should I pack?", ctx)?.tool, "packing_checklist");
  assert.equal(routeUtterance("What will the weather be like?", ctx)?.tool, "get_trip_climate");
  assert.equal(routeUtterance("What's left for my trip?", ctx)?.tool, "trip_brief");
});

test("an amount with a thousands separator is read whole, and the currency said first is the one it is in", () => {
  assert.deepEqual(routeUtterance("How much is 20,000 pesos there?", { destination: "JP" }), { tool: "convert_budget", args: { amount: 20000, from: "MXN", to: undefined, destination: undefined } });
  assert.deepEqual(routeUtterance("¿Cuánto rinden 20 mil pesos allá?", { destination: "JP" }), { tool: "convert_budget", args: { amount: 20000, from: "MXN", to: undefined, destination: undefined } });
  assert.deepEqual(routeUtterance("How much is MXN 20,000 there?", { destination: "JP" }), routeUtterance("How much is 20,000 pesos there?", { destination: "JP" }));
  assert.deepEqual(routeUtterance("¿Cuánto rinden MXN 20,000 allá?", { destination: "JP" }), routeUtterance("¿Cuánto rinden 20 mil pesos allá?", { destination: "JP" }));
  assert.deepEqual(routeUtterance("How much is 1000 dollars in yen?"), { tool: "convert_budget", args: { amount: 1000, from: "USD", to: "JPY", destination: undefined } });
});

test("plugs and emergency numbers are answered for the trip on the screen", () => {
  assert.deepEqual(routeUtterance("Show me the plugs and emergency numbers", { destination: "JP" }), { tool: "get_destination_essentials", args: { destination: "JP" } });
});
