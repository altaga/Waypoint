import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { renderTool } from "../web/cards.js";

const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-13T12:00:00Z") });
async function call(name: string, args: Record<string, unknown>, locale = "en-US") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, "near-" + locale, locale).connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
  assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
  return r.structuredContent;
}

test("near a position, only places within the radius come back, closest first, with the distance", async () => {
  const r = await call("get_highlights", { destination: "VN", near: { lat: 21.0285, lon: 105.8542 }, radiusKm: 5 });
  const places = r.data.places;
  assert.ok(places.length >= 1);
  assert.equal(places[0].id, "vn-hoan-kiem");
  assert.ok(places[0].distanceKm < 1);
  assert.ok(places.every((p: any) => p.distanceKm <= 5));
  assert.deepEqual(places.map((p: any) => p.distanceKm), [...places.map((p: any) => p.distanceKm)].sort((a, b) => a - b));
  assert.match(r.voice, /places near you, closest first: Hoan Kiem Lake \(/);
  assert.equal(r.data.near.withinRadius, true);
});

test("when nothing is within the radius the answer says so and names the closest with their distance", async () => {
  const r = await call("get_highlights", { destination: "VN", near: { lat: 10.0, lon: 108.0 }, radiusKm: 5 });
  assert.match(r.voice, /nothing within 5 km\. The closest are .* away/);
  assert.equal(r.data.near.withinRadius, false);
  assert.ok(r.data.places.length > 0 && r.data.places.length <= 3);
});

test("a town the list and the world list do not know is not guessed", async () => {
  const r = await call("get_highlights", { destination: "VN", nearPlace: "Narnia" });
  assert.match(r.voice, /I don't know where "Narnia" is/);
  assert.ok(r.data.places.length > 0, "falls back to the list");
});

test("a place with a photo shows it with its credit; a place without one shows none", () => {
  const sc = {
    card: { title: "Places near you", rows: [] },
    data: { places: [
      { id: "vn-a", name: "Tower", nameLocal: "Tháp", area: "Back Beach", desc: "A tower.", distanceKm: 1.2, mapsUrl: "https://www.google.com/maps/search/?api=1&query=x", image: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Tower.jpg?width=640", pageUrl: "https://commons.wikimedia.org/wiki/File:Tower.jpg", author: "A. Photographer", license: "CC BY-SA 4.0" } },
      { id: "vn-b", name: "Beach", area: "Front Beach", desc: "A beach.", distanceKm: 3 },
    ] },
  };
  const html = renderTool("get_highlights", sc, "en");
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /Photo: A\. Photographer · CC BY-SA 4\.0/);
  assert.match(html, /1\.2 km/);
  assert.match(html, /Tháp/);
  const unsafe = renderTool("get_highlights", { card: { title: "x", rows: [] }, data: { places: [{ id: "vn-c", name: "C", area: "a", desc: "d", image: { url: "http://evil.example/x.jpg", pageUrl: "javascript:1", author: "x", license: "y" } }] } }, "en");
  assert.doesNotMatch(unsafe, /<img /);
});

test("a traveler in Vung Tau gets Tháp Tam Thắng first, then the other places of the town, with credited photos where there are any", async () => {
  const r = await call("get_highlights", { destination: "VN", nearPlace: "Vung Tau", radiusKm: 15 });
  const ids = r.data.places.map((p: any) => p.id);
  assert.ok(ids.includes("vn-tam-thang-tower-back-beach"), "Tháp Tam Thắng is listed");
  assert.ok(!ids.includes("vn-hoan-kiem"), "nothing from Hanoi");
  assert.ok(r.data.places.every((p: any) => p.distanceKm <= 15));
  const tower = r.data.places.find((p: any) => p.id === "vn-tam-thang-tower-back-beach");
  assert.equal(tower.nameLocal, "Tháp Tam Thắng – Bãi Sau");
  assert.ok(tower.mapsUrl.startsWith("https://www.google.com/maps/"));
  assert.ok(r.data.places.some((p: any) => p.image?.url?.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/")));
  // Asked by coordinates from the Back Beach, the tower is the closest.
  const here = await call("get_highlights", { destination: "VN", near: { lat: 10.3452, lon: 107.0970 }, radiusKm: 10 });
  assert.equal(here.data.places[0].id, "vn-tam-thang-tower-back-beach");
});

test("by town name the hand-researched places come first, so Tháp Tam Thắng is always in the list for Vung Tau", async () => {
  const r = await call("get_highlights", { destination: "VN", nearPlace: "Vung Tau", limit: 6 });
  assert.ok(r.data.places.some((p: any) => p.id === "vn-tam-thang-tower-back-beach"), "the tower is in the first six");
  assert.match(r.voice, /Tam Thang Tower/);
});
