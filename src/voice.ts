import type { VisaStatus } from "./services/visa.ts";

// Spoken phrasing: dates as people say them, day counts that agree in number, and visa status
// as a sentence ("No necesitas visa ...") instead of a table cell ("Yo: Sin visa").

type L = "en" | "es";

const MONTHS: Record<L, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
};

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return { y, m, d };
}

/** "del 3 al 10 de noviembre", "from November 3 to 10", "el 5 de diciembre". */
export function spokenDates(start: string, end: string, locale: L): string {
  const a = parts(start);
  const b = parts(end);
  const ma = MONTHS[locale][a.m - 1];
  const mb = MONTHS[locale][b.m - 1];
  if (start === end) return locale === "es" ? `el ${a.d} de ${ma}` : `on ${ma} ${a.d}`;
  if (a.y === b.y && a.m === b.m) return locale === "es" ? `del ${a.d} al ${b.d} de ${ma}` : `from ${ma} ${a.d} to ${b.d}`;
  return locale === "es" ? `del ${a.d} de ${ma} al ${b.d} de ${mb}` : `from ${ma} ${a.d} to ${mb} ${b.d}`;
}

/** "Faltan 22 días.", "Falta 1 día.", "Sales hoy." */
export function daysLeftSentence(left: number, locale: L): string {
  if (left <= 0) return locale === "es" ? "Sales hoy." : "You leave today.";
  if (left === 1) return locale === "es" ? "Sales mañana." : "You leave tomorrow.";
  return locale === "es" ? `Faltan ${left} días.` : `${left} days to go.`;
}

/**
 * The visa answer as a sentence. Without a name it is said to the user ("No necesitas visa");
 * with a name it is about that traveler ("Ana no necesita visa").
 */
export function visaSentence(status: VisaStatus, maxStayDays: number | undefined, locale: L, name?: string): string {
  const es = locale === "es";
  const you = !name;
  const upTo = maxStayDays ? (es ? ` para estancias de hasta ${maxStayDays} días` : ` for stays up to ${maxStayDays} days`) : "";
  const S: Record<VisaStatus, () => string> = {
    visa_free: () => (es ? (you ? `No necesitas visa${upTo}.` : `${name} no necesita visa${upTo}.`) : you ? `You don't need a visa${upTo}.` : `${name} doesn't need a visa${upTo}.`),
    same_country: () => (es ? (you ? "Es tu propio país; no necesitas visa." : `Es el país de ${name}; no necesita visa.`) : you ? "It's your own country; no visa needed." : `It's ${name}'s own country; no visa needed.`),
    visa_on_arrival: () => (es ? (you ? `Puedes obtener la visa al llegar${upTo}.` : `${name} puede obtener la visa al llegar${upTo}.`) : you ? `You can get a visa on arrival${upTo}.` : `${name} can get a visa on arrival${upTo}.`),
    e_visa: () => (es ? (you ? "Necesitas una visa electrónica antes de viajar." : `${name} necesita una visa electrónica antes de viajar.`) : you ? "You need an e-visa before you travel." : `${name} needs an e-visa before traveling.`),
    eta: () => (es ? (you ? "Necesitas una autorización electrónica de viaje antes de salir." : `${name} necesita una autorización electrónica de viaje.`) : you ? "You need an electronic travel authorization before you leave." : `${name} needs an electronic travel authorization.`),
    visa_required: () => (es ? (you ? "Necesitas visa; tramítala antes de viajar." : `${name} necesita visa; hay que tramitarla antes de viajar.`) : you ? "You need a visa; apply before you travel." : `${name} needs a visa; apply before traveling.`),
    no_admission: () => (es ? (you ? "Con tu pasaporte no se permite la entrada." : `Con el pasaporte de ${name} no se permite la entrada.`) : you ? "Your passport is not admitted there." : `${name}'s passport is not admitted there.`),
    unknown: () => (es ? (you ? "No tengo datos de visa para tu pasaporte; consulta la fuente oficial." : `No tengo datos de visa para ${name}; consulta la fuente oficial.`) : you ? "I have no visa data for your passport; check the official source." : `I have no visa data for ${name}; check the official source.`),
  };
  return S[status]();
}

/** The stay is longer than the visa-free limit. */
export function stayTooLongSentence(stay: number, locale: L, name?: string): string {
  if (locale === "es") return name ? `Ojo: la estancia de ${name}, de ${stay} días, supera ese límite.` : `Ojo: tu estancia de ${stay} días supera ese límite.`;
  return name ? `Careful: ${name}'s ${stay}-day stay is longer than that limit.` : `Careful: your ${stay}-day stay is longer than that limit.`;
}

/** "Faltan 22 días para tu viaje a Japón.", with today and tomorrow said as such. */
export function daysUntilTripSentence(left: number, country: string, locale: L): string {
  if (locale === "es") return left <= 0 ? `Sales hoy a ${country}.` : left === 1 ? `Sales mañana a ${country}.` : `Faltan ${left} días para tu viaje a ${country}.`;
  return left <= 0 ? `You leave for ${country} today.` : left === 1 ? `You leave for ${country} tomorrow.` : `${left} days until your trip to ${country}.`;
}
