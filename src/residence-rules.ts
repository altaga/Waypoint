// Residence-permit rules by destination. Each rule comes from the research report that the team
// adopted as the source of truth for now, plus the UAE rule confirmed on the official MOFA page.
// A rule adds a note to the entry answer. It does not change the visa status: the status comes
// from the passport matrix, and these rules often depend on the consulate or the nationality.

export type ResidenceRule = {
  destination: string; // ISO alpha-2 of the destination
  residenceIn: string[]; // ISO alpha-2 of the country that issued the residence; "*" means any
  nationalities?: string[]; // passport countries the rule applies to; absent means any
  note: { en: string; es: string };
  source: string;
  retrieved: string; // date the source was read (YYYY-MM-DD)
};

const SCHENGEN = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH"];

export const RESIDENCE_RULES: ResidenceRule[] = [
  {
    destination: "MX",
    residenceIn: ["US", "CA", "JP", "GB", ...SCHENGEN],
    note: {
      en: "With permanent residence there, Mexico's consulate may waive the visa for stays up to 180 days. Lists differ by consulate; confirm with yours.",
      es: "Con residencia permanente ahí, el consulado de México puede eximir de visa para estancias de hasta 180 días. Las listas cambian según el consulado; confirma con el tuyo.",
    },
    source: "https://embamex.sre.gob.mx/santalucia/index.php/visas/visas-for-foreigners",
    retrieved: "2026-10-12",
  },
  {
    destination: "CA",
    residenceIn: ["US"],
    nationalities: ["*"],
    note: {
      en: "US permanent residents (green card) are exempt from the eTA. Bring your passport and the green card.",
      es: "Los residentes permanentes de EE. UU. (green card) están exentos de la eTA. Lleva tu pasaporte y la green card.",
    },
    source: "https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=105",
    retrieved: "2026-10-12",
  },
  {
    destination: "TR",
    residenceIn: ["*"],
    note: {
      en: "For some nationalities, a valid Schengen, US, UK or Irish visa or residence permit allows a single-entry e-Visa. The official page is dated 2022; check evisa.gov.tr.",
      es: "Para algunas nacionalidades, una visa o permiso de residencia vigente de Schengen, EE. UU., Reino Unido o Irlanda permite una e-Visa de entrada única. La página oficial está fechada en 2022; revisa evisa.gov.tr.",
    },
    source: "https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa",
    retrieved: "2026-10-12",
  },
  {
    destination: "AE",
    residenceIn: ["US", "GB", "SG", "JP", "KR", "AU", "NZ", "CA", ...SCHENGEN],
    nationalities: ["ID", "VN", "TH", "PH", "KE", "ZA"],
    note: {
      en: "Holders of these passports with a valid residence permit from this list can get a visa on arrival. A passport alone is not enough.",
      es: "Los titulares de estos pasaportes con un permiso de residencia vigente de esta lista pueden obtener visa a la llegada. El pasaporte solo no basta.",
    },
    source: "https://www.mofa.gov.ae/en/mediahub/news/2026/6/25/uae-grants-visa-on-arrival",
    retrieved: "2026-10-12",
  },
  {
    destination: "CN",
    residenceIn: ["*"],
    note: {
      en: "Applying outside your country of citizenship requires proof of legal stay or residence status.",
      es: "Si solicitas fuera de tu país de nacionalidad, necesitas prueba de estancia o residencia legal.",
    },
    source: "https://www.visaforchina.cn/PNH4_EN/qianzhengyewu/jichuzhishi/banliliucheng/551675124588351493.html",
    retrieved: "2026-10-12",
  },
  {
    destination: "ES",
    residenceIn: ["*"],
    note: {
      en: "Schengen visas are normally applied for at the consulate where you legally reside.",
      es: "Las visas Schengen normalmente se solicitan en el consulado del lugar donde resides legalmente.",
    },
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R0810",
    retrieved: "2026-10-12",
  },
  {
    destination: "FR",
    residenceIn: ["*"],
    note: {
      en: "Schengen visas are normally applied for at the consulate where you legally reside.",
      es: "Las visas Schengen normalmente se solicitan en el consulado del lugar donde resides legalmente.",
    },
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R0810",
    retrieved: "2026-10-12",
  },
  {
    destination: "IT",
    residenceIn: ["*"],
    note: {
      en: "Schengen visas are normally applied for at the consulate where you legally reside.",
      es: "Las visas Schengen normalmente se solicitan en el consulado del lugar donde resides legalmente.",
    },
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R0810",
    retrieved: "2026-10-12",
  },
];

/** Notes that apply to these travelers for this destination. */
export function residenceNotes(destination: string, travelers: { residenceCountry?: string; passports: { country: string }[] }[], locale: "en" | "es"): string[] {
  const notes = new Set<string>();
  for (const t of travelers) {
    if (!t.residenceCountry) continue;
    for (const r of RESIDENCE_RULES) {
      if (r.destination !== destination) continue;
      if (!r.residenceIn.includes("*") && !r.residenceIn.includes(t.residenceCountry)) continue;
      if (r.nationalities && !r.nationalities.includes("*") && !t.passports.some((p) => r.nationalities!.includes(p.country))) continue;
      notes.add(r.note[locale]);
    }
  }
  return [...notes];
}
