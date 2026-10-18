// Brand chips for the answers a tourist acts on: how to pay, which apps work, which card opens the metro.
// A chip is a small picture (a flat icon for the kind of service, or the brand's own mark when the Logos
// switch is on) next to the name. Names are found in the text of a card; nothing is guessed from the picture.
// The marks (web/brand-icons.js) are trademarks of their owners and are off by default.
import { BRAND_ICONS } from "./brand-icons.js";

// [name, kind, pattern, icon]. Patterns are case-sensitive where a lowercase word would be something else
// ("visa" in an entry, "grab" a coffee). Order matters only for ties at the same position.
const BRANDS = [
  // rides
  ["Uber", "ride", /\bUber\b/, "uber"], ["Grab", "ride", /\bGrab\b/, "grab"], ["DiDi", "ride", /\bDiDi\b/], ["Cabify", "ride", /\bCabify\b/],
  ["Gojek", "ride", /\bGojek\b/, "gojek"], ["Careem", "ride", /\bCareem\b/], ["inDrive", "ride", /\binDrive\b/], ["Yandex Go", "ride", /\bYandex Go\b/],
  ["Ola", "ride", /\bOla\b/], ["Bolt", "ride", /\bBolt\b/], ["FREENOW", "ride", /\bFREE ?NOW\b/], ["Lyft", "ride", /\bLyft\b/, "lyft"], ["Green SM", "ride", /\bGreen SM\b/],
  // delivery and shopping
  ["Rappi", "delivery", /\bRappi\b/], ["Glovo", "delivery", /\bGlovo\b/, "glovo"], ["foodpanda", "delivery", /\bfoodpanda\b/i, "foodpanda"],
  ["Mercado Libre", "shop", /\bMercado ?Libre\b/i], ["Amazon", "shop", /\bAmazon\b/], ["Mercari", "shop", /\bMercari\b/], ["Lazada", "shop", /\bLazada\b/],
  ["Shopee", "shop", /\bShopee\b/, "shopee"], ["Temu", "shop", /\bTemu\b/], ["Coupang", "shop", /\bCoupang\b/], ["Rakuten", "shop", /\bRakuten\b(?! Pay)/, "rakuten"],
  ["Jumia", "shop", /\bJumia\b/], ["Flipkart", "shop", /\bFlipkart\b/], ["eBay", "shop", /\beBay\b/, "ebay"], ["Trendyol", "shop", /\bTrendyol\b/], ["Allegro", "shop", /\bAllegro\b/, "allegro"],
  // cards
  ["Visa", "card", /\bVisa\b/, "visa"], ["Mastercard", "card", /\bMaster ?[Cc]ard\b/, "mastercard"], ["JCB", "card", /\bJCB\b/, "jcb"],
  ["American Express", "card", /\bAmerican Express\b|\bAmEx\b|\bAMEX\b/, "americanexpress"], ["UnionPay", "card", /\bUnionPay\b/], ["Diners Club", "card", /\bDiners(?: Club)?\b/, "dinersclub"],
  ["Discover", "card", /\bDiscover\b/, "discover"], ["Maestro", "card", /\bMaestro\b/], ["Interac", "card", /\bInterac\b/],
  // wallets and QR
  ["Apple Pay", "wallet", /\bApple Pay\b/, "applepay"], ["Google Pay", "wallet", /\bGoogle Pay\b/, "googlepay"], ["Alipay", "wallet", /\bAlipay\b/, "alipay"],
  ["WeChat Pay", "wallet", /\bWeChat Pay\b/, "wechat"], ["PayPay", "wallet", /\bPayPay\b/], ["LINE Pay", "wallet", /\bLINE Pay\b/, "line"], ["Rakuten Pay", "wallet", /\bRakuten Pay\b/, "rakuten"],
  ["MerPay", "wallet", /\bMerPay\b/], ["KakaoPay", "wallet", /\bKakaoPay\b/, "kakao"], ["PayNow", "wallet", /\bPayNow\b/], ["SGQR", "wallet", /\bSGQR\b/], ["DuitNow", "wallet", /\bDuitNow\b/],
  ["QRIS", "wallet", /\bQRIS\b/], ["PromptPay", "wallet", /\bPromptPay\b/], ["MoMo", "wallet", /\bMoMo\b/], ["ZaloPay", "wallet", /\bZaloPay\b/], ["CoDi", "wallet", /\bCoDi\b/],
  ["NETS", "wallet", /\bNETS\b/], ["PayPal", "wallet", /\bPayPal\b/, "paypal"],
  // transit cards
  ["Suica", "transit", /\bSuica\b/], ["PASMO", "transit", /\bPASMO\b/i], ["ICOCA", "transit", /\bICOCA\b/], ["Oyster", "transit", /\bOyster\b/], ["Octopus", "transit", /\bOctopus\b/],
  ["Navigo", "transit", /\bNavigo\b/], ["OMNY", "transit", /\bOMNY\b/], ["EZ-Link", "transit", /\bEZ-?Link\b/i], ["Opal", "transit", /\bOpal\b/], ["T-money", "transit", /\bT-?money\b/i],
  ["EasyCard", "transit", /\bEasyCard\b/], ["OV-chipkaart", "transit", /\bOV-chipkaart\b/], ["Istanbulkart", "transit", /\bIstanbulkart\b/], ["Nol", "transit", /\bNol\b|\bnolPay\b/],
  ["WOWPASS", "transit", /\bWOWPASS\b/], ["Mpass", "transit", /\bMpass\b/], ["EZL", "transit", /\bEZL\b/], ["Movilidad Integrada", "transit", /\bMovilidad Integrada\b/],
];

const GLYPH = {
  ride: "M5 16v-5l2-5h10l2 5v5M3 16h18M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  delivery: "M6 8h12l-1 12H7L6 8zM9 8a3 3 0 016 0",
  shop: "M3 4h2l2 11h10l2-8H7M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z",
  card: "M3 6h18v12H3zM3 10h18M6 15h4",
  wallet: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4M14 18h2",
  transit: "M7 3h10a2 2 0 012 2v10a3 3 0 01-3 3H8a3 3 0 01-3-3V5a2 2 0 012-2zM5 11h14M9 21l1.5-3M15 21l-1.5-3M9 15h.01M15 15h.01",
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The brands named in a text, once each, in the order they appear. */
export function brandsIn(text) {
  const t = String(text ?? "");
  const found = [];
  for (const [name, kind, re, icon] of BRANDS) {
    const m = re.exec(t);
    if (m) found.push({ at: m.index, name, kind, icon: icon || null });
  }
  return found.sort((a, b) => a.at - b.at).map(({ name, kind, icon }) => ({ name, kind, icon }));
}

/** One chip: the kind's flat icon, or the brand's own mark when the Logos switch is on (CSS decides which shows). */
export function brandChip(b) {
  const glyph = `<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPH[b.kind]}"/></svg>`;
  const mark = b.icon && BRAND_ICONS[b.icon] ? `<svg class="lg" viewBox="${BRAND_ICONS[b.icon].vb}" aria-hidden="true"><path d="${BRAND_ICONS[b.icon].d}"/></svg>` : `<svg class="lg gl" viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPH[b.kind]}"/></svg>`;
  return `<span class="brand b-${b.kind}">${glyph}${mark}<b>${esc(b.name)}</b></span>`;
}

/** A row of chips for every brand named in a text, or "" when none is. */
export function brandStrip(text, max = 8) {
  const list = brandsIn(text).slice(0, max);
  return list.length ? `<div class="brands">${list.map(brandChip).join("")}</div>` : "";
}
