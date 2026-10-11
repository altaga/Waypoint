import { countries as countryData } from "countries-list";

// Destination and nationality normalizer: ISO 3166-1 alpha-2, English and Spanish
// names, common aliases, and Spanish gentilicios ("mexicano" -> MX).
// Currency and language data come from countries-list (MIT), which replaces the
// REST Countries v3.1 API that has been discontinued.

export const SPANISH_NAMES: Record<string, string> = {
  AE: "Emiratos Árabes Unidos",
  AR: "Argentina",
  AT: "Austria",
  BR: "Brasil",
  CA: "Canadá",
  CN: "China",
  CO: "Colombia",
  DE: "Alemania",
  ES: "España",
  FR: "Francia",
  GB: "Reino Unido",
  IN: "India",
  IT: "Italia",
  JP: "Japón",
  KR: "Corea del Sur",
  MX: "México",
  SG: "Singapur",
  TH: "Tailandia",
  TR: "Turquía",
  US: "Estados Unidos",
  VN: "Vietnam",
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

const ALIASES: Record<string, string> = {
  usa: "US", eeuu: "US", "ee.uu.": "US", "estados unidos": "US", "united states": "US",
  uk: "GB", "gran bretaña": "GB", "gran bretana": "GB", "reino unido": "GB", "great britain": "GB", england: "GB",
  "viet nam": "VN", vietnam: "VN",
  "corea del sur": "KR", "south korea": "KR", korea: "KR",
  "emiratos": "AE", "emiratos árabes unidos": "AE", uae: "AE", dubai: "AE",
  "tailandia": "TH", singapur: "SG", japón: "JP", japon: "JP", turquía: "TR", turquia: "TR",
  méxico: "MX", mexico: "MX", españa: "ES", espana: "ES", alemania: "DE", francia: "FR", italia: "IT",
  canadá: "CA", canada: "CA", brasil: "BR", india: "IN", china: "CN",
};

const nameToIso = new Map<string, string>();
for (const [code, info] of Object.entries(countryData)) {
  nameToIso.set(info.name.toLowerCase(), code);
}

function strip(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolves a free-text country (ISO2, EN/ES name, alias or gentilicio) to ISO2, or null. */
export function resolveCountry(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    return code in countryData ? code : null;
  }
  const key = strip(raw);
  if (ALIASES[key]) return ALIASES[key];
  if (GENTILICIOS[key]) return GENTILICIOS[key];
  const fromEnglish = nameToIso.get(key);
  if (fromEnglish) return fromEnglish;
  for (const [code, es] of Object.entries(SPANISH_NAMES)) {
    if (strip(es) === key) return code;
  }
  return null;
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
