// Builds data/world/apps.json: which international ride, delivery and marketplace apps a visitor can expect
// to use in each country. A company's own list is "oficial"; press coverage and travel guides are
// "reportado". A country that is missing from a list counts as "not listed" only when the list is complete
// (complete: true); otherwise the answer says there is no verified data. Availability is by market, not by
// city: an app listed for a country may not cover every city in it.
//   npx tsx scripts/build-apps.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "data/world/apps.json");
const DATE = "2026-10-17";

type Tier = "oficial" | "reportado";
type Category = "mobility" | "delivery" | "marketplace";
type AppDef = {
  id: string;
  name: string;
  category: Category;
  tier: Tier;
  complete: boolean;
  source: { title: string; url: string };
  description: { en: string; es: string };
  listed: string[];
  notes?: Record<string, string>;
};

// Uber's "Global" list, in the order the page gives it. Hong Kong is listed by Uber but is not a country in
// the catalogue, so it is not mapped.
const UBER = [
  "AD", "AE", "AR", "AT", "AU", "BB", "BD", "BE", "BH", "BO", "BR", "CA", "CH", "CL", "CO", "CR", "CZ", "DE",
  "DK", "DO", "EC", "EE", "EG", "ES", "FI", "FR", "GB", "GH", "GR", "GT", "HN", "HR", "HU", "IE", "IN", "IT",
  "JM", "JO", "JP", "KE", "KR", "KW", "LB", "LC", "LK", "LT", "LU", "MT", "MX", "NG", "NL", "NO", "NP", "NZ",
  "PA", "PE", "PL", "PT", "PY", "QA", "RO", "SA", "SE", "SI", "SK", "SV", "TR", "TW", "UA", "UG", "US", "UY", "ZA",
];

const APPS: AppDef[] = [
  {
    id: "uber",
    name: "Uber",
    category: "mobility",
    tier: "oficial",
    complete: true,
    source: { title: "Uber: global list of cities and markets", url: "https://www.uber.com/global/en/cities/" },
    description: {
      en: "Ride-hailing. Uber lists markets, not cities: service can be limited to part of a listed country.",
      es: "Viajes en auto. Uber publica mercados, no ciudades: el servicio puede cubrir solo parte de un país listado.",
    },
    listed: UBER,
  },
  {
    id: "grab",
    name: "Grab",
    category: "mobility",
    tier: "oficial",
    complete: true,
    source: { title: "Grab: where we are", url: "https://www.grab.com/sg/locations/" },
    description: {
      en: "Ride-hailing, food and delivery in Southeast Asia.",
      es: "Viajes, comida y reparto en el sudeste asiático.",
    },
    listed: ["SG", "MY", "ID", "PH", "TH", "VN", "MM", "KH"],
  },
  {
    id: "didi",
    name: "DiDi",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "EqualOcean: DiDi Global overseas car rental, 2025 (company-attributed press)", url: "https://equalocean.com/news/2025050821535-didi-global-launches-overseas-car-rental-service-26-cities-across-11-countries" },
    description: {
      en: "Ride-hailing. The sources give partial country lists and disagree on the total; a missing country is not confirmed.",
      es: "Viajes en auto. Las fuentes dan listas parciales y no coinciden en el total; un país que falta no está confirmado.",
    },
    listed: ["CN", "KR", "SG", "JP", "MY", "ID", "VN", "AU", "EG"],
    notes: {
      CN: "The 2025 article gives a footprint of over 1,200 cities including Hong Kong (China); no separate country list.",
      AU: "Ride-hailing per a March 2026 travel guide (bento.travel, DiDi Food page).",
      EG: "Ride-hailing in Cairo and Alexandria, per a March 2026 travel guide (bento.travel, DiDi Food page).",
    },
  },
  {
    id: "rappi",
    name: "Rappi",
    category: "delivery",
    tier: "reportado",
    complete: false,
    source: { title: "Bento Travel: Rappi countries (travel guide, not the company)", url: "https://www.bento.travel/blog/rappi-countries" },
    description: {
      en: "Delivery and errands in Latin America. The company's own list was not reachable; the country list comes from a travel guide.",
      es: "Reparto y mandados en América Latina. La lista de la empresa no fue accesible; la lista viene de una guía de viaje.",
    },
    listed: ["AR", "BR", "CL", "CO", "CR", "EC", "MX", "PE", "UY"],
  },
  {
    id: "mercadolibre",
    name: "Mercado Libre",
    category: "marketplace",
    tier: "oficial",
    complete: true,
    source: { title: "MercadoLibre 2026 proxy statement (SEC filing): e-commerce in 18 countries", url: "https://www.sec.gov/Archives/edgar/data/0001099590/000109959026000010/meli-20260423.htm" },
    description: {
      en: "Marketplace in 18 Latin American countries, per the company's 2026 SEC filing.",
      es: "Marketplace en 18 países de América Latina, según la declaración de la empresa ante la SEC (2026).",
    },
    listed: ["AR", "BR", "MX", "CL", "CO", "PE", "UY", "VE", "BO", "CR", "DO", "EC", "GT", "HN", "NI", "PA", "PY", "SV"],
  },
  {
    id: "amazon",
    name: "Amazon",
    category: "marketplace",
    tier: "oficial",
    complete: false,
    source: { title: "Amazon: sell.amazon.com/global-selling (storefront domains listed on the page)", url: "https://sell.amazon.com/global-selling" },
    description: {
      en: "Shopping on the local Amazon storefront. The page lists storefronts without saying it is complete.",
      es: "Compras en la tienda local de Amazon. La página lista tiendas sin decir que la lista está completa.",
    },
    listed: ["US", "CA", "MX", "BR", "GB", "DE", "ES", "FR", "IT", "NL", "PL", "SE", "TR", "JP", "IN", "AU", "SG", "AE", "EG", "SA"],
  },
  {
    id: "mercari",
    name: "Mercari",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Digital Commerce 360: Mercari launches US app (June 2026)", url: "https://www.digitalcommerce360.com/2026/06/19/mercari-launches-us-app/" },
    description: {
      en: "Second-hand marketplace. Core markets are Japan and the US; other places are reached cross-border. Mercari's own site could not be read.",
      es: "Mercado de segunda mano. Los mercados principales son Japón y EE. UU.; otros lugares se alcanzan de forma transfronteriza. No se pudo leer el sitio de Mercari.",
    },
    listed: ["JP", "US", "TW"],
    notes: {
      TW: "Cross-border purchases from Japan through the Mercari Global app (launched 30 Sep 2025), per Value Added Resource.",
    },
  },
];

function main() {
  const countries = (JSON.parse(readFileSync(join(ROOT, "data/world/countries.json"), "utf8")) as { countries: { iso: string }[] }).countries;
  const known = new Set(countries.map((c) => c.iso));
  const expected: Record<string, number> = { uber: 73, grab: 8, didi: 9, rappi: 9, mercadolibre: 18, amazon: 20, mercari: 3 };

  const apps: Record<string, Omit<AppDef, "id" | "listed" | "notes"> & { retrieved: string }> = {};
  const listings: Record<string, string[]> = {};
  const notes: Record<string, Record<string, string>> = {};
  for (const app of APPS) {
    for (const iso of app.listed) if (!known.has(iso)) throw new Error(`${app.id}: ${iso} is not in countries.json`);
    if (new Set(app.listed).size !== app.listed.length) throw new Error(`${app.id}: duplicate country`);
    if (expected[app.id] !== undefined && expected[app.id] !== app.listed.length) {
      throw new Error(`${app.id}: expected ${expected[app.id]} countries, got ${app.listed.length}`);
    }
    for (const note of Object.keys(app.notes ?? {})) if (!app.listed.includes(note)) throw new Error(`${app.id}: note for unlisted ${note}`);
    const { id, listed, notes: appNotes, ...rest } = app;
    apps[id] = { ...rest, retrieved: DATE };
    listings[id] = listed;
    if (appNotes) notes[id] = appNotes;
  }

  const out = {
    source: {
      retrieved: DATE,
      method:
        "Lists per app. 'oficial': the company's own page or SEC filing. 'reportado': press coverage or travel guides, not confirmed by the company. " +
        "A country missing from a list is 'not listed' only when the list is complete; otherwise it has no verified data. Availability is by market, not by city.",
    },
    apps,
    listings,
    notes,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  for (const app of APPS) console.log(`${app.id}: ${app.listed.length} (${app.tier}, complete=${app.complete})`);
}

main();
