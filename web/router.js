// Deterministic "brain" for the simulator. It maps an utterance (ES or EN) to one
// Waypoint tool call with arguments. It works without any AWS access. When the
// Bedrock brain is enabled on the server (/api/brain), the host prefers that.

const DESTINATIONS = [
  ["JP", "japan", "japon"], ["SG", "singapore", "singapur"], ["TH", "thailand", "tailandia"],
  ["VN", "vietnam", "viet nam"], ["KR", "south korea", "corea del sur"], ["CN", "china", "china"],
  ["AE", "dubai", "emiratos"], ["TR", "turkey", "turquia"], ["ES", "spain", "espana"],
  ["FR", "france", "francia"], ["IT", "italy", "italia"], ["CA", "canada", "canada"], ["MX", "mexico", "mexico"],
];

const MONTHS = {
  january: 1, enero: 1, february: 2, febrero: 2, march: 3, marzo: 3, april: 4, abril: 4, may: 5, mayo: 5,
  june: 6, junio: 6, july: 7, julio: 7, august: 8, agosto: 8, september: 9, septiembre: 9, october: 10, octubre: 10,
  november: 11, noviembre: 11, december: 12, diciembre: 12,
};

const CURRENCIES = [
  [/peso|pesos|mxn/, "MXN"], [/dolar|dolares|dollar|dollars|usd/, "USD"], [/euro|euros|eur/, "EUR"],
  [/yen|yenes|jpy/, "JPY"], [/baht|thb/, "THB"], [/won|wones|krw/, "KRW"], [/dong|dongs|vnd/, "VND"],
  [/dirham|dirhams|aed/, "AED"], [/lira|liras|try/, "TRY"], [/rupia|rupee|rupees|inr/, "INR"],
];

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();

export function findDestination(text) {
  const t = norm(text);
  for (const [iso, en, es] of DESTINATIONS) {
    if (new RegExp(`\\b(${en}|${es})\\b`).test(t)) return iso;
  }
  return null;
}

export function findDates(text, year = 2026) {
  const t = norm(text);
  const iso = t.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (iso) return { startDate: iso[1], endDate: iso[2] };
  const m = t.match(/(\d{1,2})\s*(?:de\s+)?(?:al?|to|-|through)\s*(\d{1,2})\s*(?:de\s+)?(?:of\s+)?([a-z]+)/);
  if (m && MONTHS[m[3]]) {
    const mm = String(MONTHS[m[3]]).padStart(2, "0");
    return { startDate: `${year}-${mm}-${m[1].padStart(2, "0")}`, endDate: `${year}-${mm}-${m[2].padStart(2, "0")}` };
  }
  const m2 = t.match(/([a-z]+)\s+(\d{1,2})\s*(?:to|-|through|al?)\s*(\d{1,2})/);
  if (m2 && MONTHS[m2[1]]) {
    const mm = String(MONTHS[m2[1]]).padStart(2, "0");
    return { startDate: `${year}-${mm}-${m2[2].padStart(2, "0")}`, endDate: `${year}-${mm}-${m2[3].padStart(2, "0")}` };
  }
  return null;
}

// context.destination is the trip on the screen: a question about "what can't I bring" names no country.
export function routeUtterance(text, context = {}) {
  const t = norm(text);
  const dest = findDestination(text);
  // A question that names a place the router does not know ("en Perú") must not fall back to the trip's country.
  const namesOtherPlace = !dest && /\ben\s+[A-ZÁÉÍÓÚÑ]\p{L}+/u.test(text);
  const tripDest = dest ?? (namesOtherPlace ? null : context.destination) ?? null;
  const paymentTopic = /\bqr\b|billetera|wallet/.test(t) ? "qr" : /cripto|crypto|bitcoin/.test(t) ? "crypto" : /cajero|\batm\b/.test(t) ? "atm" : /billete/.test(t) ? "banknotes" : /tarjeta|\bcard\b|contactless/.test(t) ? "cards" : /efectivo|\bcash\b/.test(t) ? "cash" : undefined;
  const amount = t.match(/(\d[\d.,]*)\s*(mil|k|thousand)?/);
  const curr = CURRENCIES.find(([re]) => re.test(t));

  if (/olvida|forget|borra mis datos|delete my data/.test(t)) return { tool: "forget_me", args: {} };
  if (/que me falta|what.?s left|pending|pendiente|resumen del viaje|trip brief/.test(t)) return { tool: "trip_brief", args: {} };
  if (/\b(uber|grab|didi|rappi|mercado\s?libre|mercari|amazon)\b/.test(t) && tripDest) return { tool: "get_local_apps", args: { destination: tripDest } };
  if (/(gaste|spent|registra|log|pagu|pago|paid)/.test(t) && amount && !text.includes("?")) {
    // "pagó Ana" or "paid by Ana" names who paid; without a name the cost is left unassigned, as before.
    const payer = /\bpag[oó]\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)|\bpaid by\s+([A-Za-z]+)/i.exec(text);
    const who = payer ? (payer[1] || payer[2]) : null;
    const category = /cena|comida|almuerzo|desayuno|restaurant|dinner|lunch|breakfast|food/.test(t) ? "food" : "other";
    return { tool: "log_expense", args: { amount: Number(amount[1].replace(/[.,]/g, "")), category, currency: curr?.[1], ...(who ? { payer: who } : {}) } };
  }
  if (/(cuanto rinde|cuanto son|how far|convert|cambio|budget|presupuesto)/.test(t) && amount) {
    const n = Number(amount[1].replace(/[.,]/g, "")) * (amount[2] ? 1000 : 1);
    return { tool: "convert_budget", args: { amount: n, to: curr?.[1], destination: dest ?? undefined } };
  }
  if (/(\bpagar\b|\bpago\b|\bpay\b|tarjeta|efectivo|\bcash\b|\bcard\b|\bqr\b|cajero|\batm\b|billetera|wallet|cripto|crypto|bitcoin|billete)/.test(t) && tripDest) {
    return { tool: "get_payment_methods", args: { destination: tripDest, ...(paymentTopic ? { topic: paymentTopic } : {}) } };
  }
  if (/(clima|weather|temperatura|temperature|frio|calor|lluvia|llueve|\brain\b|\bcold\b|\bhot\b)/.test(t)) return { tool: "get_trip_climate", args: dest ? { destination: dest } : {} };
  if (/(empacar|pack|maleta|equipaje|lista)/.test(t)) return { tool: "packing_checklist", args: {} };
  if (/(itinerario|itinerary|plan del dia|day plan)/.test(t)) return { tool: "build_itinerary", args: {} };
  if (/(enchufe|plug|adaptador|emergenc|moneda|currency|idioma|language)/.test(t) && dest) {
    return { tool: "get_destination_essentials", args: { destination: dest } };
  }
  if (/(no puedo llevar|no puedo|puedo llevar|puedo traer|puedo meter|prohib|can i bring|can.t bring|can.t i bring|can i|reglas|rules|ley|law|multa|fine)/.test(t) && tripDest) {
    const items = /(bring|llevar|import|traer|meter|carry|pack)/.test(t);
    return { tool: "get_local_rules", args: { destination: tripDest, ...(items ? { categories: ["prohibited_items"] } : {}) } };
  }
  if (/(visa|requisito|entrar|entry|necesito|need)/.test(t) && dest) {
    return { tool: "check_entry_requirements", args: { destination: dest } };
  }
  const dates = findDates(text);
  if (dest && dates && /(voy|vamos|viajo|going|trip|viaje|planea|plan)/.test(t)) {
    return { tool: "plan_trip", args: { destination: dest, ...dates } };
  }
  if (/(mi perfil|quien soy|my profile|what do you know)/.test(t)) return { tool: "get_traveler_profile", args: {} };
  return null;
}
