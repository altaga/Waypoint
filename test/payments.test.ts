import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// How a visitor pays: every country with an entry cites https sources and a date, and is labelled either
// official ("oficial") or reported ("reportado": guides and traveler reports, never presented as official).
// A country without an entry is said so, not guessed. Crypto is never presented as accepted without a source.
const data = JSON.parse(readFileSync("data/world/payments.json", "utf8")) as {
  countries: Record<string, { tier: string; retrieved: string; sources: { url: string; title: string }[]; crypto?: string | null }>;
};
const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-17T12:00:00Z") });

async function session(user: string, locale = "en-US") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, locale).connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  return { call };
}

test("every country cites https sources with a retrieval date, and each entry has a tier", () => {
  const entries = Object.entries(data.countries);
  assert.ok(entries.length >= 180, "most of the world is covered");
  const tiers = new Set(entries.map(([, e]) => e.tier));
  assert.deepEqual([...tiers].sort(), ["oficial", "reportado"]);
  assert.ok(entries.filter(([, e]) => e.tier === "oficial").length >= 18, "the official entries are kept");
  for (const [iso, e] of entries) {
    assert.match(e.retrieved, /^\d{4}-\d{2}-\d{2}$/, iso);
    assert.ok(e.sources.length > 0, `${iso} has sources`);
    for (const s of e.sources) assert.match(s.url, /^https:\/\//, `${iso} ${s.url}`);
  }
});

test("no country is shown as accepting cryptocurrency without an official source", () => {
  for (const [iso, e] of Object.entries(data.countries)) {
    assert.ok(e.crypto === null || e.crypto === undefined, `${iso} crypto is not verified`);
  }
});

test("an official country answers with its methods, its source date and a warning on crypto", async () => {
  const s = await session("payments-jp");
  const r = await s.call("get_payment_methods", { destination: "JP" });
  assert.equal(r.data.tier, "oficial");
  assert.equal(r.data.verified, true);
  assert.equal(r.data.destination, "JP");
  assert.match(r.card.subtitle, /Official sources/);
  const rows = r.card.rows as { label: string; status: string }[];
  assert.ok(rows.some((x) => x.label === "Cash") && rows.some((x) => x.label === "Cards"));
  const crypto = rows.find((x) => x.label === "Cryptocurrency");
  assert.equal(crypto?.status, "warn");
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string; license: string }) => x.url.startsWith("https://") && x.license === "Official public information"));
  assert.match(r.card.subtitle, new RegExp(data.countries.JP!.retrieved));
  assert.match(r.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
});

test("a reported country says it is not officially confirmed, is low confidence and cites its guides", async () => {
  const s = await session("payments-pe");
  const r = await s.call("get_payment_methods", { destination: "PE" });
  assert.equal(r.data.tier, "reportado");
  assert.equal(r.data.verified, false);
  assert.equal(r.confidence, "low");
  assert.match(r.voice, /not confirmed by an official source/);
  assert.match(r.card.subtitle, /not official/);
  const rows = r.card.rows as { label: string }[];
  assert.ok(rows.some((x) => x.label === "Cards"), "Peru has a cards answer; a country with no verified cash data has no cash row");
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string; license: string }) => x.url.startsWith("https://") && x.license !== "Official public information"));
});

test("a country with no entry at all says so and cites nothing", async () => {
  const s = await session("payments-none");
  const r = await s.call("get_payment_methods", { destination: "AQ" });
  assert.equal(r.data.verified, false);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.card.rows, []);
  assert.match(r.voice, /don't have payment information/);
});

// English: the 18 official entries have an English version with the same facts; the others say their detail is Spanish.
test("every official entry has English text with the same fields as the Spanish original", () => {
  const en = JSON.parse(readFileSync("data/world/payments.en.json", "utf8")) as { countries: Record<string, Record<string, unknown>> };
  const official = Object.entries(data.countries).filter(([, v]) => v.tier === "oficial").map(([k]) => k).sort();
  assert.deepEqual(Object.keys(en.countries).sort(), official);
  for (const iso of official) {
    const es = data.countries[iso] as Record<string, unknown>;
    for (const f of ["cash", "cards", "contactless", "qr", "atm", "banknotes", "crypto"]) assert.equal(Boolean(es[f]), Boolean(en.countries[iso][f]), `${iso}.${f}`);
    assert.equal(((es.notes as string[]) ?? []).length, ((en.countries[iso].notes as string[]) ?? []).length, `${iso}.notes`);
    for (const f of ["cash", "cards", "qr", "atm"]) assert.doesNotMatch(String(en.countries[iso][f] ?? ""), /\b(Sigue|Las tarjetas|Hace falta|Los cajeros|Sin dato)\b/, `${iso}.${f} reads as Spanish`);
  }
});

test("in English an official country answers in English, card and voice", async () => {
  const s = await session("payments-en-jp");
  const r = await s.call("get_payment_methods", { destination: "Japan", topic: "qr" });
  assert.match(r.voice, /PayPay, Rakuten Pay and MerPay/);
  assert.doesNotMatch(r.voice, /LINE Pay/);
  assert.ok((r.data.notes as string[]).some((n) => /30 April 2025/.test(n)));
  assert.doesNotMatch(r.voice, /Sigue|apps QR/);
  const rows = r.card.rows.map((x: { value: string }) => x.value).join(" ");
  assert.doesNotMatch(rows, /Sigue|tiendas|cajeros/);
});

test("in English a reported country says its detail is only in Spanish instead of mixing the languages", async () => {
  const reported = Object.entries(data.countries).find(([, v]) => v.tier === "reportado");
  assert.ok(reported);
  const s = await session("payments-en-reported");
  const r = await s.call("get_payment_methods", { destination: reported![0] });
  assert.match(r.voice, /only written in Spanish/);
});
