// Which language the traveler is writing in, from a few common words and accents. The host
// follows the traveler: the device, the cards and the reply all switch with the message.
// Returns "es", "en", or null when the message does not say (for example, a place name alone).

const ES_WORDS = [
  "hola", "quiero", "tengo", "voy", "viajo", "qué", "que", "cuánto", "cuanto", "cuándo", "cuando", "dónde", "donde",
  "llevar", "pasaporte", "mexicano", "mexicana", "días", "dias", "para", "dame", "arma", "ármame", "puedo", "necesito",
  "mis", "mi", "empaqué", "empaque", "gracias", "pesos", "dólares", "yenes", "del", "los", "las", "el", "la", "por", "con",
  "falta", "faltan", "sí", "soy", "hasta", "quedan", "cuesta", "cuánto",
];
const EN_WORDS = [
  "hi", "hello", "i", "i'm", "im", "want", "going", "trip", "passport", "my", "can", "how", "what", "where", "when",
  "the", "is", "am", "to", "from", "plan", "pack", "days", "please", "thanks", "much", "do", "does", "need", "for", "left",
];

const esRe = new RegExp(`(?<!\\p{L})(${ES_WORDS.join("|")})(?!\\p{L})`, "giu");
const enRe = new RegExp(`(?<!\\p{L})(${EN_WORDS.join("|")})(?!\\p{L})`, "giu");
const accentRe = /[¿¡ñáéíóúü]/i;

export function detectLang(text) {
  const s = String(text || "");
  let es = (s.match(esRe) || []).length;
  const en = (s.match(enRe) || []).length;
  if (accentRe.test(s)) es += 1;
  if (es === 0 && en === 0) return null;
  if (es === en) return null;
  return es > en ? "es" : "en";
}
