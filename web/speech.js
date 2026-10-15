// What the host says aloud. A voice spells out codes and acronyms it does not know, so the
// spoken text says them as words: "MXN 1,000" becomes "1,000 pesos mexicanos".

const CURRENCY = {
  es: { MXN: "pesos mexicanos", USD: "dólares estadounidenses", EUR: "euros", JPY: "yenes", GBP: "libras", CAD: "dólares canadienses", AUD: "dólares australianos", CNY: "yuanes", KRW: "wones", INR: "rupias", THB: "bahts" },
  en: { MXN: "Mexican pesos", USD: "US dollars", EUR: "euros", JPY: "yen", GBP: "pounds", CAD: "Canadian dollars", AUD: "Australian dollars", CNY: "yuan", KRW: "won", INR: "rupees", THB: "baht" },
};
const WORDS = {
  es: [
    [/\beTA\b/g, "autorización electrónica de viaje"],
    [/\be-visa\b/gi, "visa electrónica"],
    [/\bTHC\b/g, "te hache ce"],
    [/\bCBD\b/g, "ce be de"],
  ],
  en: [
    [/\beTA\b/g, "electronic travel authorization"],
    [/\bTHC\b/g, "T H C"],
    [/\bCBD\b/g, "C B D"],
  ],
};

/** The text for the voice in the given language ("es" or "en", or a tag such as "es-MX"). */
export function speakable(text, lang) {
  const key = String(lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  let s = String(text || "");
  // A currency code before its amount: the amount first, then the name ("USD 54" -> "54 dólares estadounidenses").
  s = s.replace(/\b([A-Z]{3})\s?(\d(?:[\d.,]*\d)?)/g, (m, code, amount) => (CURRENCY[key][code] ? `${amount} ${CURRENCY[key][code]}` : m));
  for (const [re, say] of WORDS[key]) s = s.replace(re, say);
  // Arrows, middle dots and dashes read as noise; a comma pause reads as a break.
  return s.replace(/\s*[→·–—]\s*/g, ", ").replace(/(\s*,){2,}\s*/g, ", ").replace(/\s+/g, " ").trim();
}
