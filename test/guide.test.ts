import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { Guide } from "../src/services/guide.ts";
import { renderTool } from "../web/cards.js";

const root = new URL("..", import.meta.url).pathname;
const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-19T12:00:00Z") });
async function call(args: Record<string, unknown>, locale = "en-US") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, "guide-" + locale, locale).connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const r = (await client.callTool({ name: "get_travel_guide", arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
  assert.ok(!r.isError, r.content?.[0]?.text);
  return r.structuredContent;
}

test("every fact in the guide data has a quote, a source and a Spanish text, and none is a visa rule for UK passports only", () => {
  const files = readdirSync(root + "data/guide").filter((f) => /^[A-Z]{2}\.json$/.test(f));
  assert.ok(files.length >= 1);
  let facts = 0;
  for (const f of files) {
    const g = Guide.parse(JSON.parse(readFileSync(root + "data/guide/" + f, "utf8")));
    for (const [topic, list] of Object.entries(g.topics)) {
      assert.ok(list.length <= 12, `${f} ${topic}`);
      for (const x of list) {
        facts++;
        const min = topic === "phrases" ? 2 : 6; // a phrase may be one word ("Yes")
        assert.ok(x.quote.length >= 20 && x.en.length >= min && x.es.length >= min, `${f} ${topic}: ${x.en}`);
        assert.ok(g.sources[x.source], `${f}: source ${x.source} is listed`);
        if (topic === "entry") assert.ok(!(/\b(UK|British)\b/i.test(x.en) && /\b(visa|ETA|permit|waiver)/i.test(x.en)), `${f}: UK-only visa fact`);
      }
    }
  }
  assert.ok(facts > 50);
});

test("the guide of a country: overview, then a topic with the quote it comes from, in both languages", async () => {
  const ov = await call({ destination: "PH" });
  assert.match(ov.voice, /I have a travel guide for Philippines/);
  assert.ok(ov.card.rows.some((r: any) => /^\d+ facts$/.test(r.value)));
  const safety = await call({ destination: "PH", topic: "safety" });
  assert.ok(safety.data.facts.length >= 1);
  assert.ok(safety.data.facts.every((f: any) => f.quote.length >= 20 && ["fcdo", "wikivoyage"].includes(f.source)));
  assert.ok(safety.card.rows.some((r: any) => r.status === "blocked" && /UK government advises against all travel to parts/.test(r.value)), "the UK alert comes first");
  assert.ok(safety.sources.some((s: any) => s.id === "src:fcdo" && /Open Government Licence/.test(s.title)));
  const es = await call({ destination: "PH", topic: "money" }, "es-MX");
  assert.match(es.voice, /^Dinero, propinas y costos en Filipinas:/);
  const entry = await call({ destination: "PH", topic: "entry" });
  assert.match(entry.card.subtitle, /for visas by passport use the entry check/);
});

test("a country with no guide says there is no verified data and invents nothing", async () => {
  const real = ctx.guide;
  ctx.guide = { forCountry: () => undefined, countries: () => [] };
  const r = await call({ destination: "GB" });
  ctx.guide = real;
  assert.match(r.voice, /don't have a verified travel guide/);
  assert.equal(r.confidence, "low");
  assert.deepEqual(r.data.topics, {});
});

test("the guide card shows each fact with its source and the quote under it; a phrase shows the local text", () => {
  const html = renderTool("get_travel_guide", { card: { title: "Useful phrases · Philippines", rows: [] }, data: { facts: [{ text: "Hello.", quote: "Kumusta ka?", source: "phrasebook", local: "Kumusta", say: "koo-moos-TAH" }, { text: "Cash is king.", quote: "a cash-only society", source: "wikivoyage" }] }, sources: [] }, "en");
  assert.match(html, /<b>Kumusta<\/b> <span>koo-moos-TAH<\/span>/);
  assert.match(html, /<summary>Wikivoyage<\/summary><q>a cash-only society<\/q>/);
  assert.equal((html.match(/class="g-fact"/g) || []).length, 2);
});
