// Downloads the official sources used to build country packs.
// Output: data/raw/** (git-ignored) plus data/raw/manifest.json with retrieval dates,
// and the small vendored snapshots under data/vendor/ (PPP, FX fallback, plugs).
// Run: npm run fetch-sources
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TIER_A_DESTINATIONS, TIER_A_PASSPORTS } from "./config.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "waypoint-pack-builder/0.1 (hackathon research; contact via GitHub repo)";
const today = new Date().toISOString().slice(0, 10);
const manifest: Record<string, { url: string; retrieved: string; license: string; bytes: number }> = {};

async function get(url: string, timeoutMs = 30000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function save(rel: string, body: string, meta: { url: string; license: string }) {
  const file = join(ROOT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  manifest[rel] = { ...meta, retrieved: today, bytes: Buffer.byteLength(body) };
  console.log(`saved ${rel} (${Buffer.byteLength(body)} bytes)`);
}

async function main() {
  // GOV.UK (FCDO): Open Government Licence v3.
  for (const d of TIER_A_DESTINATIONS.filter((x) => x.govuk)) {
    const url = `https://www.gov.uk/api/content/foreign-travel-advice/${d.govuk}/entry-requirements`;
    try {
      await save(`data/raw/gov-uk/${d.govuk}.json`, await get(url), { url, license: "OGL v3.0" });
    } catch (e) {
      console.warn(`skip ${d.iso}: ${(e as Error).message}`);
    }
  }

  // US State Dept: public-domain US government data.
  const stateUrl = "https://cadataapi.state.gov/api/CountryTravelInformation";
  await save("data/raw/state/CountryTravelInformation.json", await get(stateUrl, 60000), {
    url: stateUrl,
    license: "US Government work (public domain)",
  });
  const advUrl = "https://cadataapi.state.gov/api/TravelAdvisories";
  await save("data/raw/state/TravelAdvisories.json", await get(advUrl, 60000), {
    url: advUrl,
    license: "US Government work (public domain)",
  });

  // World Bank PPP conversion factor (private consumption), latest year, CC BY 4.0.
  const isos = [...new Set([...TIER_A_DESTINATIONS.map((d) => d.iso), ...TIER_A_PASSPORTS])].join(";");
  const pppUrl = `https://api.worldbank.org/v2/country/${isos}/indicator/PA.NUS.PRVT.PP?format=json&mrv=1&per_page=100`;
  const ppp = JSON.parse(await get(pppUrl));
  const pppRows = (ppp[1] ?? [])
    .filter((r: { value: number | null }) => r.value !== null)
    .map((r: { countryiso3code: string; country: { id: string }; date: string; value: number }) => ({
      iso2: r.country.id,
      year: Number(r.date),
      value: r.value,
    }));
  await save("data/vendor/ppp.json", JSON.stringify({ source: pppUrl, license: "CC BY 4.0", rows: pppRows }, null, 2), {
    url: pppUrl,
    license: "CC BY 4.0",
  });

  // Wikidata: electrical plug types (P2853) and emergency numbers (P2852), CC0.
  const values = TIER_A_DESTINATIONS.map((d) => `"${d.iso}"`).join(" ");
  const sparql = (body: string) =>
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(body)}`;
  const plugUrl = sparql(
    `SELECT ?iso ?plugLabel WHERE { VALUES ?iso { ${values} } ?c wdt:P297 ?iso ; wdt:P2853 ?plug . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`,
  );
  const emergencyUrl = sparql(
    `SELECT ?iso ?num WHERE { VALUES ?iso { ${values} } ?c wdt:P297 ?iso ; wdt:P2852 ?num . }`,
  );
  try {
    const plugs = JSON.parse(await get(plugUrl));
    const emerg = JSON.parse(await get(emergencyUrl));
    await save(
      "data/vendor/wikidata-plugs-emergency.json",
      JSON.stringify(
        {
          retrieved: today,
          license: "CC0 1.0",
          plugs: plugs.results.bindings.map((b: any) => ({ iso2: b.iso.value, plug: b.plugLabel.value })),
          emergency: emerg.results.bindings.map((b: any) => ({ iso2: b.iso.value, number: b.num.value })),
        },
        null,
        2,
      ),
      { url: plugUrl, license: "CC0 1.0" },
    );
  } catch (e) {
    console.warn(`wikidata skipped: ${(e as Error).message}`);
  }

  // FX snapshot used only as an offline fallback; live rates come from open.er-api.com (attribution required).
  const fxUrl = "https://open.er-api.com/v6/latest/USD";
  await save("data/vendor/fx-fallback.json", await get(fxUrl), {
    url: fxUrl,
    license: "open.er-api.com terms (attribution required)",
  });

  await mkdir(join(ROOT, "data/raw"), { recursive: true });
  await writeFile(join(ROOT, "data/raw/manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`done: ${Object.keys(manifest).length} sources`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
