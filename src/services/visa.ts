// Passport -> destination entry status from the vendored passport-index matrix
// (imorte/passport-index-data, MIT). The matrix is a snapshot; the vendored
// file is the source of truth at runtime, so lookups never touch the network.

export type VisaStatus =
  | "visa_free"
  | "visa_on_arrival"
  | "e_visa"
  | "eta"
  | "visa_required"
  | "no_admission"
  | "same_country"
  | "unknown";

export interface VisaEntry {
  status: VisaStatus;
  maxStayDays?: number;
}

export type VisaMatrix = Map<string, VisaEntry>;

const STATUS_BY_TEXT: Record<string, VisaStatus> = {
  "visa free": "visa_free",
  "visa on arrival": "visa_on_arrival",
  "e-visa": "e_visa",
  eta: "eta",
  "visa required": "visa_required",
  "no admission": "no_admission",
};

export function parseVisaCsv(csv: string): VisaMatrix {
  const matrix: VisaMatrix = new Map();
  const lines = csv.split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [passport, destination, raw] = line.split(",").map((s) => s.trim());
    matrix.set(`${passport}>${destination}`, classify(raw));
  }
  return matrix;
}

export function classify(raw: string): VisaEntry {
  if (raw === "-1") return { status: "same_country" };
  if (/^\d+$/.test(raw)) return { status: "visa_free", maxStayDays: Number(raw) };
  return { status: STATUS_BY_TEXT[raw.toLowerCase()] ?? "unknown" };
}

export function lookupVisa(matrix: VisaMatrix, passport: string, destination: string): VisaEntry {
  if (passport === destination) return { status: "same_country" };
  return matrix.get(`${passport}>${destination}`) ?? { status: "unknown" };
}

/** Ranking used when a traveler holds several passports: the most permissive wins. */
const RANK: Record<VisaStatus, number> = {
  visa_free: 6,
  same_country: 6,
  eta: 5,
  e_visa: 4,
  visa_on_arrival: 3,
  visa_required: 2,
  no_admission: 1,
  unknown: 0,
};

export function bestEntry(entries: { passport: string; entry: VisaEntry }[]) {
  return entries.reduce((best, cur) => (RANK[cur.entry.status] > RANK[best.entry.status] ? cur : best));
}

export const STATUS_LABEL: Record<VisaStatus, { en: string; es: string; tone: "ok" | "warn" | "blocked" | "info" }> = {
  visa_free: { en: "Visa-free", es: "Sin visa", tone: "ok" },
  same_country: { en: "Home country", es: "País de origen", tone: "ok" },
  visa_on_arrival: { en: "Visa on arrival", es: "Visa a la llegada", tone: "warn" },
  e_visa: { en: "e-Visa required", es: "Requiere e-visa", tone: "warn" },
  eta: { en: "Electronic travel authorization", es: "Autorización electrónica (ETA)", tone: "warn" },
  visa_required: { en: "Visa required", es: "Requiere visa", tone: "blocked" },
  no_admission: { en: "No admission", es: "Sin ingreso permitido", tone: "blocked" },
  unknown: { en: "Unknown: check the official source", es: "Desconocido: consulta la fuente oficial", tone: "info" },
};
