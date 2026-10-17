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
