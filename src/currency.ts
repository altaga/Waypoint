// Currency names people say, as ISO 4217 codes. The tools take the code; a name such as "Mexican peso" or
// "Singapore dollar" is accepted too and turned into its code. A bare "peso" means MXN, a bare "dollar" USD.
const NAMES: Record<string, string> = {
  "mexican peso": "MXN", "peso mexicano": "MXN", "pesos mexicanos": "MXN", peso: "MXN", pesos: "MXN",
  "us dollar": "USD", "u s dollar": "USD", "united states dollar": "USD", "american dollar": "USD", "dolar estadounidense": "USD", "dolar americano": "USD", dollar: "USD", dollars: "USD", dolar: "USD", dolares: "USD",
  "singapore dollar": "SGD", "dolar de singapur": "SGD", "dolar singapurense": "SGD",
  "canadian dollar": "CAD", "dolar canadiense": "CAD", "australian dollar": "AUD", "dolar australiano": "AUD",
  euro: "EUR", euros: "EUR", yen: "JPY", yenes: "JPY", "japanese yen": "JPY", "yen japones": "JPY",
  "pound sterling": "GBP", "british pound": "GBP", pound: "GBP", pounds: "GBP", libra: "GBP", libras: "GBP", "libra esterlina": "GBP",
  baht: "THB", "thai baht": "THB", won: "KRW", "korean won": "KRW", dong: "VND", "vietnamese dong": "VND",
  yuan: "CNY", renminbi: "CNY", rupee: "INR", rupees: "INR", rupia: "INR", rupias: "INR", "indian rupee": "INR",
  lira: "TRY", "turkish lira": "TRY", dirham: "AED", dirhams: "AED", "uae dirham": "AED",
  "colombian peso": "COP", "peso colombiano": "COP", "argentine peso": "ARS", "peso argentino": "ARS", "chilean peso": "CLP", "peso chileno": "CLP",
  "swiss franc": "CHF", "franco suizo": "CHF", "brazilian real": "BRL", real: "BRL", "peruvian sol": "PEN", sol: "PEN",
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** The ISO 4217 code for a code or a currency name, or null when it is neither. */
export function currencyCode(input: string, known: Set<string>): string | null {
  const t = input.trim();
  if (/^[A-Za-z]{3}$/.test(t) && known.has(t.toUpperCase())) return t.toUpperCase();
  return NAMES[fold(t)] ?? null;
}
