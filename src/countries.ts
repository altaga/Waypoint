import { countries as countryData } from "countries-list";
import worldCityFile from "../data/world/cities.json" with { type: "json" };

// Destination and nationality normalizer: ISO 3166-1 alpha-2, English and Spanish
// names, common aliases, and demonyms ("mexicano", "Mexican" -> MX). Accents and punctuation
// are ignored, and a typo is tolerated when exactly one country is close enough.
// Currency and language data come from countries-list (MIT), which replaces the
// REST Countries v3.1 API that has been discontinued.

export const SPANISH_NAMES: Record<string, string> = {
  AE: "Emiratos Árabes Unidos",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BD: "Bangladés",
  BE: "Bélgica",
  BO: "Bolivia",
  BR: "Brasil",
  CA: "Canadá",
  CH: "Suiza",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  CU: "Cuba",
  CZ: "Chequia",
  DE: "Alemania",
  DK: "Dinamarca",
  DO: "República Dominicana",
  EC: "Ecuador",
  EG: "Egipto",
  ES: "España",
  FI: "Finlandia",
  FR: "Francia",
  GB: "Reino Unido",
  GR: "Grecia",
  GT: "Guatemala",
  HK: "Hong Kong",
  HN: "Honduras",
  HU: "Hungría",
  ID: "Indonesia",
  IE: "Irlanda",
  IL: "Israel",
  IN: "India",
  IQ: "Irak",
  IR: "Irán",
  IT: "Italia",
  JP: "Japón",
  KE: "Kenia",
  KH: "Camboya",
  KR: "Corea del Sur",
  MA: "Marruecos",
  MX: "México",
  MY: "Malasia",
  NG: "Nigeria",
  NI: "Nicaragua",
  NL: "Países Bajos",
  NO: "Noruega",
  NP: "Nepal",
  NZ: "Nueva Zelanda",
  PA: "Panamá",
  PE: "Perú",
  PH: "Filipinas",
  PK: "Pakistán",
  PL: "Polonia",
  PR: "Puerto Rico",
  PT: "Portugal",
  PY: "Paraguay",
  QA: "Catar",
  RO: "Rumania",
  RU: "Rusia",
  SA: "Arabia Saudita",
  SE: "Suecia",
  SG: "Singapur",
  SV: "El Salvador",
  TH: "Tailandia",
  TR: "Turquía",
  TW: "Taiwán",
  UA: "Ucrania",
  US: "Estados Unidos",
  UY: "Uruguay",
  VE: "Venezuela",
  VN: "Vietnam",
  ZA: "Sudáfrica",
};

export const GENTILICIOS: Record<string, string> = {
  mexicano: "MX", mexicana: "MX",
  estadounidense: "US", estadounidenses: "US", gringo: "US", gringa: "US",
  canadiense: "CA", britanico: "GB", británico: "GB", británica: "GB", britanica: "GB",
  español: "ES", española: "ES", alemán: "DE", alemana: "DE",
  indio: "IN", india: "IN", chino: "CN", china: "CN", japonés: "JP", japonesa: "JP",
  coreano: "KR", coreana: "KR", tailandés: "TH", tailandesa: "TH",
  vietnamita: "VN", singapurense: "SG", turco: "TR", turca: "TR",
  francés: "FR", francesa: "FR", italiano: "IT", italiana: "IT",
  brasileño: "BR", brasileña: "BR", colombiano: "CO", colombiana: "CO",
  argentino: "AR", argentina: "AR",
};

// More demonyms, English and Spanish. Also used to build the Alexa slot type.
export const EN_DEMONYMS: Record<string, string[]> = {
  MX: ["Mexican"], US: ["American", "US citizen"], CA: ["Canadian"], GB: ["British", "English"], ES: ["Spanish"],
  DE: ["German"], IN: ["Indian"], CN: ["Chinese"], JP: ["Japanese"], BR: ["Brazilian"], FR: ["French"], IT: ["Italian"],
  CO: ["Colombian"], AR: ["Argentinian", "Argentine"], PE: ["Peruvian"], CL: ["Chilean"], KR: ["Korean", "South Korean"],
  TH: ["Thai"], ID: ["Indonesian"], VN: ["Vietnamese"], PH: ["Filipino", "Philippine"], KE: ["Kenyan"], ZA: ["South African"],
  TR: ["Turkish"], AE: ["Emirati"], SG: ["Singaporean"], AU: ["Australian"], NZ: ["New Zealander"], RU: ["Russian"], EG: ["Egyptian"],
};
export const ES_DEMONYMS: Record<string, string[]> = {
  PE: ["peruano", "peruana"], CL: ["chileno", "chilena"], ID: ["indonesio", "indonesia"], VN: ["vietnamita"], PH: ["filipino", "filipina"],
  KE: ["keniano", "keniana"], ZA: ["sudafricano", "sudafricana"], TR: ["turco", "turca"], AE: ["emiratí"], SG: ["singapurense"],
  AU: ["australiano", "australiana"], NZ: ["neozelandés", "neozelandesa"], RU: ["ruso", "rusa"], EG: ["egipcio", "egipcia"],
  US: ["americano", "americana", "norteamericano", "norteamericana"], GB: ["inglés", "inglesa"], PT: ["portugués", "portuguesa"],
  NL: ["holandés", "holandesa", "neerlandés"], CH: ["suizo", "suiza"], SE: ["sueco", "sueca"], PL: ["polaco", "polaca"],
  UY: ["uruguayo", "uruguaya"], EC: ["ecuatoriano", "ecuatoriana"], VE: ["venezolano", "venezolana"], BO: ["boliviano", "boliviana"],
  PY: ["paraguayo", "paraguaya"], CR: ["costarricense"], PA: ["panameño", "panameña"], GT: ["guatemalteco", "guatemalteca"],
  HN: ["hondureño", "hondureña"], SV: ["salvadoreño", "salvadoreña"], NI: ["nicaragüense"], CU: ["cubano", "cubana"],
  DO: ["dominicano", "dominicana"], IE: ["irlandés", "irlandesa"], GR: ["griego", "griega"], BE: ["belga"], DK: ["danés", "danesa"],
};

export const ALIASES: Record<string, string> = {
  usa: "US", eeuu: "US", "ee.uu.": "US", "estados unidos": "US", "united states": "US", "los estados unidos": "US",
  uk: "GB", "gran bretaña": "GB", "gran bretana": "GB", "reino unido": "GB", "great britain": "GB", england: "GB", inglaterra: "GB",
  "viet nam": "VN", vietnam: "VN",
  "corea del sur": "KR", "south korea": "KR", korea: "KR",
  "emiratos": "AE", "emiratos árabes unidos": "AE", uae: "AE", dubai: "AE",
  "tailandia": "TH", singapur: "SG", japón: "JP", japon: "JP", turquía: "TR", turquia: "TR",
  méxico: "MX", mexico: "MX", españa: "ES", espana: "ES", alemania: "DE", francia: "FR", italia: "IT",
  canadá: "CA", canada: "CA", brasil: "BR", india: "IN", china: "CN",
  holanda: "NL", "paises bajos": "NL", "república checa": "CZ", "czech republic": "CZ",
};

// Travelers often name a city instead of a country ("vamos a Ámsterdam"). Capitals come from
// countries-list; these are the other cities people name most, in English and Spanish.
export const CITIES: Record<string, string> = {
  amsterdam: "NL", "ámsterdam": "NL", rotterdam: "NL",
  paris: "FR", "parís": "FR", niza: "FR", nice: "FR", lyon: "FR", marsella: "FR", marseille: "FR",
  london: "GB", londres: "GB", edinburgh: "GB", edimburgo: "GB", manchester: "GB", liverpool: "GB",
  tokyo: "JP", "tokio": "JP", kyoto: "JP", "kioto": "JP", osaka: "JP", hiroshima: "JP", sapporo: "JP",
  barcelona: "ES", madrid: "ES", sevilla: "ES", seville: "ES", valencia: "ES", malaga: "ES", "málaga": "ES", ibiza: "ES", mallorca: "ES", "palma de mallorca": "ES",
  rome: "IT", roma: "IT", milan: "IT", "milán": "IT", venice: "IT", venecia: "IT", florence: "IT", florencia: "IT", naples: "IT", "nápoles": "IT",
  "new york": "US", "nueva york": "US", "los angeles": "US", "los ángeles": "US", "las vegas": "US", miami: "US", orlando: "US", chicago: "US", "san francisco": "US", houston: "US", "washington": "US",
  "cancun": "MX", "cancún": "MX", "ciudad de mexico": "MX", "ciudad de méxico": "MX", cdmx: "MX", guadalajara: "MX", monterrey: "MX", "playa del carmen": "MX", tulum: "MX", oaxaca: "MX", "puerto vallarta": "MX", "los cabos": "MX",
  toronto: "CA", vancouver: "CA", montreal: "CA", "montréal": "CA", quebec: "CA", "quebec city": "CA",
  bangkok: "TH", phuket: "TH", "chiang mai": "TH", pattaya: "TH",
  seoul: "KR", "seúl": "KR", busan: "KR",
  istanbul: "TR", estambul: "TR", antalya: "TR", capadocia: "TR", cappadocia: "TR",
  dubai: "AE", "dubái": "AE", "abu dhabi": "AE", "abu dabi": "AE",
  singapore: "SG",
  beijing: "CN", "pekín": "CN", pekin: "CN", shanghai: "CN", "shanghái": "CN", "hong kong": "HK",
  hanoi: "VN", "hanói": "VN", "ho chi minh": "VN", saigon: "VN", "saigón": "VN",
  bali: "ID", yakarta: "ID", jakarta: "ID",
  berlin: "DE", "berlín": "DE", munich: "DE", "múnich": "DE", frankfurt: "DE", "fráncfort": "DE",
  lisbon: "PT", lisboa: "PT", porto: "PT", oporto: "PT",
  prague: "CZ", praga: "CZ", vienna: "AT", viena: "AT", budapest: "HU", athens: "GR", atenas: "GR", dublin: "IE", "dublín": "IE",
  brussels: "BE", bruselas: "BE", zurich: "CH", "zúrich": "CH", geneva: "CH", ginebra: "CH", copenhagen: "DK", copenhague: "DK", stockholm: "SE", estocolmo: "SE",
  cairo: "EG", "el cairo": "EG", marrakech: "MA", "marrakesh": "MA",
  sydney: "AU", "sídney": "AU", melbourne: "AU",
  lima: "PE", cusco: "PE", cuzco: "PE", bogota: "CO", "bogotá": "CO", cartagena: "CO", medellin: "CO", "medellín": "CO",
  "buenos aires": "AR", "rio de janeiro": "BR", "río de janeiro": "BR", "sao paulo": "BR", "são paulo": "BR", "santiago de chile": "CL",
  havana: "CU", "la habana": "CU", "punta cana": "DO",
};

/** Lowercase, no accents, letters and digits only, single spaces: "Perú" and "ee.uu." compare plainly. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Every known way of writing a country, normalized, mapped to its ISO code. First writer wins.
const index = new Map<string, string>();
function addKey(raw: string, iso: string) {
  const key = normalize(raw);
  if (key && !index.has(key)) index.set(key, iso);
}
for (const [code, info] of Object.entries(countryData)) addKey(info.name, code);
for (const [code, es] of Object.entries(SPANISH_NAMES)) addKey(es, code);
for (const [word, iso] of Object.entries(ALIASES)) addKey(word, iso);
for (const [word, iso] of Object.entries(GENTILICIOS)) addKey(word, iso);
for (const [iso, list] of Object.entries(EN_DEMONYMS)) for (const w of list) addKey(w, iso);
for (const [iso, list] of Object.entries(ES_DEMONYMS)) for (const w of list) addKey(w, iso);
// Cities last, so a country name always wins over a city of the same name.
for (const [city, iso] of Object.entries(CITIES)) addKey(city, iso);
for (const [code, info] of Object.entries(countryData)) {
  if (info.capital) addKey(info.capital, code);
}
// Worldwide cities (population 300,000+ or a capital) match exactly only. They stay out of
// the fuzzy index so that a typo of a country name is never tied with a city name.
const cityIndex = new Map<string, string>();
for (const city of worldCityFile.cities) {
  for (const name of [city.name.en, city.name.es]) {
    const key = normalize(name);
    if (key && !cityIndex.has(key) && !index.has(key)) cityIndex.set(key, city.iso);
  }
}
const keys = [...index.keys()];

/** Edit distance with swaps of neighbouring letters counted as one edit. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export type CountryMatch = { iso: string; exact: boolean };

/**
 * Resolves free text (ISO2, EN/ES name, alias or demonym) to a country. An exact match ignores
 * accents and punctuation. Otherwise a typo is accepted only when one country is clearly the
 * nearest: short words are never guessed, and a tie between two countries returns null.
 */
export function matchCountry(input: string): CountryMatch | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    if (code in countryData) return { iso: code, exact: true };
  }
  const key = normalize(raw);
  if (!key) return null;
  const exact = index.get(key) ?? cityIndex.get(key);
  if (exact) return { iso: exact, exact: true };
  if (key.length < 5) return null;
  const max = key.length >= 9 ? 2 : 1;
  let best = max + 1;
  const found = new Set<string>();
  for (const k of keys) {
    if (Math.abs(k.length - key.length) > max) continue;
    const dist = editDistance(key, k);
    if (dist > max) continue;
    const iso = index.get(k) as string;
    if (dist < best) {
      best = dist;
      found.clear();
    }
    if (dist === best) found.add(iso);
  }
  return found.size === 1 ? { iso: [...found][0], exact: false } : null;
}

/** Resolves a free-text country to ISO2, or null. */
export function resolveCountry(input: string): string | null {
  return matchCountry(input)?.iso ?? null;
}

/** Display name for a country, in Spanish when requested, otherwise English. */
export function countryName(iso: string, locale: "en" | "es" = "en"): string {
  if (locale === "es" && SPANISH_NAMES[iso]) return SPANISH_NAMES[iso];
  return countryData[iso as keyof typeof countryData]?.name ?? iso;
}

export function currencyOf(iso: string): string | null {
  const info = countryData[iso as keyof typeof countryData];
  return info?.currency?.[0] ?? null;
}

export function isKnownCountry(iso: string): boolean {
  return iso in countryData;
}
