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
  notes?: Record<string, { en: string; es: string }>;
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
      CN: {
        en: "The 2025 article gives a footprint of over 1,200 cities including Hong Kong (China); no separate country list.",
        es: "El artículo de 2025 da una cobertura de más de 1,200 ciudades, incluida Hong Kong (China); no hay lista de países aparte.",
      },
      AU: {
        en: "Ride-hailing per a March 2026 travel guide (bento.travel, DiDi Food page).",
        es: "Viajes en auto según una guía de viaje de marzo de 2026 (bento.travel, página de DiDi Food).",
      },
      EG: {
        en: "Ride-hailing in Cairo and Alexandria, per a March 2026 travel guide (bento.travel, DiDi Food page).",
        es: "Viajes en auto en El Cairo y Alejandría, según una guía de viaje de marzo de 2026 (bento.travel, página de DiDi Food).",
      },
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
      TW: {
        en: "Cross-border purchases from Japan through the Mercari Global app (launched 30 Sep 2025), per Value Added Resource.",
        es: "Compras transfronterizas desde Japón con la app Mercari Global (lanzada el 30 de septiembre de 2025), según Value Added Resource.",
      },
    },
  },
  {
    id: "greensm",
    name: "Green SM",
    category: "mobility",
    tier: "oficial",
    complete: true,
    source: { title: "Green SM: company release on its markets (Oct 2026, via wire services); greensm.com download page", url: "https://www.greensm.com/vn-en/download" },
    description: {
      en: "Electric car ride-hailing (VinFast) in Vietnam, also bikes, express and food. Known in Vietnam as Xanh SM.",
      es: "Viajes en auto eléctrico (VinFast) en Vietnam, también motos, envíos y comida. En Vietnam se llama Xanh SM.",
    },
    listed: ["VN", "LA", "ID", "PH", "IN", "KZ", "DK", "NL", "US"],
    notes: {
      VN: {
        en: "Hotline 1555. The company's page lists cash, bank cards and e-wallets. A travel blog says sign-up works with WhatsApp verification and no local number (not confirmed by the company).",
        es: "Línea 1555. La página de la empresa lista efectivo, tarjetas bancarias y billeteras electrónicas. Un blog de viajes dice que el registro funciona con verificación por WhatsApp y sin número local (la empresa no lo confirma).",
      },
      US: {
        en: "Los Angeles, launched October 2026; the company's first North American market.",
        es: "Los Ángeles, lanzada en octubre de 2026; su primer mercado en Norteamérica.",
      },
    },
  },
  {
    id: "cabify",
    name: "Cabify",
    category: "mobility",
    tier: "oficial",
    complete: true,
    source: { title: "Cabify help center: In which cities can I find Cabify", url: "https://help.cabify.com/hc/en-us/articles/115000996089-In-which-cities-can-I-find-Cabify" },
    description: {
      en: "Ride-hailing in Spain and Latin America, per the company's help center.",
      es: "Viajes en auto en España y Latinoamérica, según el centro de ayuda de la empresa.",
    },
    listed: ["ES", "AR", "CL", "CO", "PE", "UY"],
  },
  {
    id: "gojek",
    name: "Gojek",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "KrASIA: Gojek unifies its brand across four markets (2020); Wikipedia (five countries)", url: "https://kr-asia.com/gojek-officially-unifies-brand-across-four-markets" },
    description: {
      en: "Ride-hailing, food and delivery in Southeast Asia. The sources are from 2019 to 2021, so the footprint may have changed.",
      es: "Viajes, comida y reparto en el sudeste asiático. Las fuentes son de 2019 a 2021; la cobertura pudo cambiar.",
    },
    listed: ["ID", "SG", "VN", "TH", "PH"],
    notes: {
      VN: { en: "Named GoViet in Vietnam in the 2020 report.", es: "Nombrada GoViet en Vietnam en el informe de 2020." },
      TH: { en: "Named GET in Thailand in the 2020 report.", es: "Nombrada GET en Tailandia en el informe de 2020." },
    },
  },
  {
    id: "careem",
    name: "Careem",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "Bento Travel: Careem (travel guide)", url: "https://bento.travel/apps/careem" },
    description: {
      en: "Ride-hailing in the Middle East, North Africa and Pakistan. The sources do not agree on the total; treat the list as partial.",
      es: "Viajes en Oriente Medio, norte de África y Pakistán. Las fuentes no coinciden en el total; tratar la lista como parcial.",
    },
    listed: ["AE", "EG", "JO", "MA", "PK", "SA"],
  },
  {
    id: "indrive",
    name: "inDrive",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "Wikipedia (inDrive) and Arab News (Saudi Arabia licence)", url: "https://en.wikipedia.org/wiki/InDrive" },
    description: {
      en: "Ride-hailing where rider and driver agree the fare. The sources give about 48 countries; the named list comes from a courier-service list, so ride-hailing may differ.",
      es: "Viajes en auto donde pasajero y conductor acuerdan la tarifa. Las fuentes dan unos 48 países; la lista nombrada viene de un listado de mensajería, así que los viajes pueden diferir.",
    },
    listed: ["BR", "EC", "EG", "IN", "MX", "PE", "PK", "ZA", "CO", "KZ", "NG", "GT", "SA"],
  },
  {
    id: "yandexgo",
    name: "Yandex Go",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "Kun.uz (Uzbekistan, 2024); Yandex Go app release notes (15 countries, not named)", url: "https://kun.uz/en/news/2024/06/27/yandex-go-service-launched-in-urgench-and-khiva" },
    description: {
      en: "Ride-hailing in Russia and neighbouring markets, sold as Yango in some of them. The app says 15 countries but does not name them.",
      es: "Viajes en auto en Rusia y mercados vecinos; se vende como Yango en algunos. La app dice 15 países pero no los nombra.",
    },
    listed: ["UZ", "AM", "GE", "EE", "AE", "RU", "KZ", "BY", "MD", "KG"],
    notes: {
      AE: { en: "A pilot Yango launch in Dubai, per Interfax; not confirmed as current.", es: "Un piloto de Yango en Dubái, según Interfax; no confirmado como vigente." },
    },
  },
  {
    id: "ola",
    name: "Ola",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "Ackodrive: Ola to exit international operations (sources conflict)", url: "https://ackodrive.com/news/ola-cabs-to-exit-international-operations/" },
    description: {
      en: "Ride-hailing in India. Reports say the overseas markets are being exited, and the sources conflict.",
      es: "Viajes en auto en India. Hay informes de que sale de otros mercados, y las fuentes no coinciden.",
    },
    listed: ["IN"],
  },
  {
    id: "glovo",
    name: "Glovo",
    category: "delivery",
    tier: "reportado",
    complete: false,
    source: { title: "Wikipedia (Glovo); Delivery Hero acquisition of Glovo's Latin American operations (2020)", url: "https://en.wikipedia.org/wiki/Glovo" },
    description: {
      en: "Delivery in Europe, Central Asia, Africa and Latin America. The counts and lists are from 2020 to 2022.",
      es: "Reparto en Europa, Asia Central, África y Latinoamérica. Los conteos y listas son de 2020 a 2022.",
    },
    listed: ["ES", "PT", "RO", "AM", "AR", "PE", "EC", "PA", "CR", "HN", "GT", "DO"],
  },
  {
    id: "lazada",
    name: "Lazada",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Statista (citing Semrush): top e-commerce sites, Singapore and the Lazada markets", url: "https://www.statista.com/statistics/869701/singapore-top-10-e-commerce-sites/" },
    description: {
      en: "Marketplace in six Southeast Asian markets, per third-party market data. The company's own list was not read.",
      es: "Marketplace en seis mercados del sudeste asiático, según datos de mercado de terceros. No se leyó la lista de la empresa.",
    },
    listed: ["ID", "MY", "SG", "TH", "VN", "PH"],
  },
  {
    id: "shopee",
    name: "Shopee",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Wikipedia (Shopee); shopappy.com 2026 seller guide", url: "https://en.wikipedia.org/wiki/Shopee" },
    description: {
      en: "Marketplace in Southeast Asia, Taiwan, Brazil, Mexico, Chile, Colombia and Poland. South Korea is seller-only. The company's own list was not read.",
      es: "Marketplace en el sudeste asiático, Taiwán, Brasil, México, Chile, Colombia y Polonia. Corea del Sur es solo para vendedores. No se leyó la lista de la empresa.",
    },
    listed: ["ID", "VN", "TH", "PH", "MY", "SG", "TW", "BR", "MX", "CL", "CO", "PL"],
  },
  {
    id: "temu",
    name: "Temu",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "SCMP: Temu enters Vietnam and Brunei; Momentum Works: Temu in Japan and 22 other countries", url: "https://www.scmp.com/tech/big-tech/article/3282059/discount-shopping-giant-temu-enters-vietnam-and-brunei-app-faces-ban-indonesia" },
    description: {
      en: "Online marketplace shipping from China. Third-party counts range from over 80 to over 90 countries and territories; no company list was read.",
      es: "Marketplace con envíos desde China. Los conteos de terceros van de más de 80 a más de 90 países y territorios; no se leyó una lista de la empresa.",
    },
    listed: ["US", "CA", "AU", "NZ", "JP", "VN", "BN", "FR", "DE", "IT", "NL", "ES", "GB"],
  },
  {
    id: "coupang",
    name: "Coupang",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Taipei Times (2023) and company profile sites", url: "https://www.taipeitimes.com/News/biz/archives/2023/04/28/2003798722" },
    description: {
      en: "E-commerce in South Korea and Taiwan. It left Japan in 2023. The company's SEC filings were not read.",
      es: "Comercio electrónico en Corea del Sur y Taiwán. Salió de Japón en 2023. No se leyeron sus declaraciones ante la SEC.",
    },
    listed: ["KR", "TW"],
  },
  {
    id: "rakuten",
    name: "Rakuten",
    category: "marketplace",
    tier: "oficial",
    complete: false,
    source: { title: "Rakuten Global: Rakuten Global Express (company article, 2023)", url: "https://global.rakuten.com/corp/innovation/rakuten_today/2023/0825-5868/" },
    description: {
      en: "Rakuten Ichiba is a Japanese marketplace. Foreign buyers ship through Rakuten Global Express to more than 80 countries and regions after registering and verifying identity. Each shop chooses its destinations.",
      es: "Rakuten Ichiba es un marketplace japonés. Los compradores extranjeros envían con Rakuten Global Express a más de 80 países y regiones, tras registrarse y verificar su identidad. Cada tienda elige sus destinos.",
    },
    listed: ["JP"],
    notes: {
      JP: {
        en: "Foreign buyers register for Rakuten Global Express and verify identity. A shop notice says forwarding services are not tax-exempt.",
        es: "Los compradores extranjeros se registran en Rakuten Global Express y verifican su identidad. Un aviso de tienda dice que los servicios de reenvío no están exentos de impuestos.",
      },
    },
  },
  {
    id: "bolt",
    name: "Bolt",
    category: "mobility",
    tier: "oficial",
    complete: false,
    source: { title: "Bolt: list of countries (bolt.eu/en/cities; the page is truncated after Portugal)", url: "https://bolt.eu/en/cities/" },
    description: {
      en: "Ride-hailing, delivery and scooters in 850+ cities, per Bolt's page. The fetched list stops after Portugal, so countries after it are not confirmed.",
      es: "Viajes en auto, reparto y scooters en más de 850 ciudades, según la página de Bolt. La lista descargada se corta después de Portugal; los países que siguen no están confirmados.",
    },
    listed: ["GH", "KE", "MA", "NG", "ZA", "TZ", "UG", "ZW", "AZ", "GE", "KZ", "MY", "SA", "TW", "TH", "AE", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "MT", "MD", "NL", "NO", "PL", "PT"],
  },
  {
    id: "jumia",
    name: "Jumia",
    category: "marketplace",
    tier: "oficial",
    complete: true,
    source: { title: "Jumia group site: 'active across 8 countries' and the platforms footer", url: "https://group.jumia.com/" },
    description: {
      en: "Marketplace in eight African countries, per Jumia's own site.",
      es: "Marketplace en ocho países africanos, según el sitio de Jumia.",
    },
    listed: ["EG", "GH", "CI", "KE", "MA", "NG", "SN", "UG"],
  },
  {
    id: "flipkart",
    name: "Flipkart",
    category: "marketplace",
    tier: "oficial",
    complete: true,
    source: { title: "Flipkart homepage: 'India's trusted and beloved e-commerce platform'", url: "https://www.flipkart.com/" },
    description: {
      en: "Marketplace in India only, per Flipkart's own homepage.",
      es: "Marketplace solo en India, según la página principal de Flipkart.",
    },
    listed: ["IN"],
  },
  {
    id: "lyft",
    name: "Lyft",
    category: "mobility",
    tier: "oficial",
    complete: true,
    source: { title: "Lyft cities page: Canada, United States and 'Europe' (early access; FREENOW not mentioned)", url: "https://www.lyft.com/cities" },
    description: {
      en: "Ride-hailing in the US and Canada, per Lyft's cities page. Europe is served through FREENOW, which is listed separately.",
      es: "Viajes en auto en EE. UU. y Canadá, según la página de ciudades de Lyft. Europa se atiende con FREENOW, que aparece aparte.",
    },
    listed: ["US", "CA"],
  },
  {
    id: "freenow",
    name: "FREENOW",
    category: "mobility",
    tier: "reportado",
    complete: false,
    source: { title: "Lyft press release on acquiring FREENOW (April 2025), reported by Nasdaq and others", url: "https://www.nasdaq.com/press-release/lyft-expands-europe-diversifies-acquiring-freenow-2025-04-16" },
    description: {
      en: "Taxi and ride-hailing app in nine European countries, owned by Lyft since the 2025 announcement. Closing and the current list were not confirmed.",
      es: "App de taxis y viajes en auto en nueve países europeos, de Lyft desde el anuncio de 2025. El cierre y la lista actual no están confirmados.",
    },
    listed: ["IE", "GB", "DE", "GR", "ES", "IT", "PL", "FR", "AT"],
  },
  {
    id: "foodpanda",
    name: "foodpanda",
    category: "delivery",
    tier: "reportado",
    complete: false,
    source: { title: "Company profile listing ten Asian markets (undated); Insider Retail and Technode on the 2025 Thailand exit", url: "https://insideretail.asia/2025/04/24/foodpanda-to-exit-thailand-as-delivery-hero-scales-back-in-apac/" },
    description: {
      en: "Food and grocery delivery in Asia, part of Delivery Hero. Thailand was exited in May 2025. The Delivery Hero annual report was not reachable, so the list is partial.",
      es: "Reparto de comida y súper en Asia, parte de Delivery Hero. Salió de Tailandia en mayo de 2025. El informe anual de Delivery Hero no fue accesible; la lista es parcial.",
    },
    listed: ["BD", "KH", "LA", "MY", "MM", "PK", "PH", "SG", "TW"],
  },
  {
    id: "ebay",
    name: "eBay",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Ginee: eBay international sites (dated list of country sites)", url: "https://ginee.com/my/insights/ebay-international-sites/" },
    description: {
      en: "Online marketplace with country sites and worldwide shipping to over 190 countries. The country-site list is dated and the help page was not read, so it is partial.",
      es: "Marketplace en línea con sitios por país y envíos a más de 190 países. La lista de sitios es antigua y no se leyó la página de ayuda; es parcial.",
    },
    listed: ["AU", "CA", "FR", "DE", "IE", "IT", "MY", "NL", "NZ", "PH", "SG", "ES", "SE", "CH", "TW", "GB"],
  },
  {
    id: "trendyol",
    name: "Trendyol",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Daily Sabah (Europe, 2020); trade press (Germany, Azerbaijan, Gulf, around 2022)", url: "https://www.dailysabah.com/business/turkeys-e-commerce-giant-trendyol-enters-european-market" },
    description: {
      en: "Turkish marketplace, with Turkey as its base. The European and Gulf reports are from 2020 to 2022; no current company list was read.",
      es: "Marketplace turco, con base en Turquía. Los informes sobre Europa y el Golfo son de 2020 a 2022; no se leyó una lista actual de la empresa.",
    },
    listed: ["TR", "AZ", "DE", "IT", "ES", "FR", "DK", "FI", "GR", "NL"],
  },
  {
    id: "allegro",
    name: "Allegro",
    category: "marketplace",
    tier: "reportado",
    complete: false,
    source: { title: "Komersant: Allegro's core markets and planned exits (2026)", url: "https://komersant.ua/en/naybilshyy-polskyy-marketpleys-allegro-planuie-vyyty-na-rynok-ukrainy-shcho-vidomo/" },
    description: {
      en: "Polish marketplace, with sites in Poland, Czechia, Slovakia and Hungary. Slovenia and Croatia were planned to be sold off in 2026. The company's own site was not read.",
      es: "Marketplace polaco, con sitios en Polonia, Chequia, Eslovaquia y Hungría. Se planeaba vender Eslovenia y Croacia en 2026. No se leyó el sitio de la empresa.",
    },
    listed: ["PL", "CZ", "SK", "HU"],
  },
];

function main() {
  const countries = (JSON.parse(readFileSync(join(ROOT, "data/world/countries.json"), "utf8")) as { countries: { iso: string }[] }).countries;
  const known = new Set(countries.map((c) => c.iso));
  const expected: Record<string, number> = { uber: 73, grab: 8, didi: 9, rappi: 9, mercadolibre: 18, amazon: 20, mercari: 3 };

  const apps: Record<string, Omit<AppDef, "id" | "listed" | "notes"> & { retrieved: string }> = {};
  const listings: Record<string, string[]> = {};
  const notes: Record<string, Record<string, { en: string; es: string }>> = {};
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
