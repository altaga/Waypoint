// Rich cards for the simulated Alexa+ screen: one renderer per Waypoint tool, built from the
// tool's structuredContent (voice, card, data, sources, lastVerified). Anything unknown falls
// back to the generic card the server already describes. All text is escaped.

import { brandsIn, brandChip, brandStrip } from "./brands.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 17.5l11-11" stroke="currentColor" stroke-width="2"/></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 13.5l19-7-5 15-4-6.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 15l9-8.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  plug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5M16 3v5M5.5 8h13v3a6.5 6.5 0 01-13 0zM12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h3l1.5 4.5-2 1.5a11 11 0 006 6l1.5-2 4.5 1.5v3a2 2 0 01-2 2A16.5 16.5 0 014 5.5a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.6.8-2.6 2s1 1.7 2.7 2 2.8.9 2.8 2.1-1.1 2-2.8 2c-1.2 0-2.2-.5-2.8-1.3M12 6.5v11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  talk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7.5" width="16" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 7.5V5.5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 5.6a3 3 0 010 5.8M17.5 14.6c1.8.6 3 2.2 3.4 4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5V3.5M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10.5H6.5A2 2 0 004.5 12.5v6a2 2 0 002 2h11a2 2 0 002-2v-6a2 2 0 00-2-2H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  panel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  temp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4.5a2 2 0 014 0v9.2a4 4 0 11-4 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10.5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" fill="currentColor"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor"/></svg>',
  drop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3 4 6 7.4 6 10.6a6 6 0 01-12 0C6 10.9 9 7.5 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};
export const icon = (name) => `<span class="ico">${ICON[name] || ""}</span>`;

const L = {
  en: {
    source: "Source", verified: "verified", checked: "sources checked", notReviewed: "compiled by us, not yet reviewed by a person", reviewed: "reviewed by a person", confidence: "confidence", level: { low: "low", medium: "medium", high: "high" }, visaFree: "No visa needed", upTo: (d) => `stays up to ${d} days`,
    entry: "Entry", rules: "Local rules", budget: "Budget", ppp: "Goes as far as", essentials: "Essentials",
    currency: "Currency", plugs: "Plugs", emergency: "Emergency", languages: "Language", packing: "Packing list",
    packed: (a, b) => `${a} of ${b} packed`, doNotPack: "Do not pack", plan: "Day plan", free: "Free day",
    morning: "Morning", afternoon: "Afternoon", evening: "Evening", day: "Day", brief: "What's left", ready: "ready",
    daysLeft: (n) => (n === 1 ? "1 day to go" : `${n} days to go`), daysUnit: (n) => (n === 1 ? "day to go" : "days to go"), tapToTick: "Tap to tick off", profile: "Traveler profile",
    planEmpty: "No day plan yet", planEmptyHint: "Tell me what you enjoy and I'll put one together from real places.",
    settleBtn: "Group money", settle: "Settle up", fairness: "Fairness", transfers: "Transfers", squared: "Everyone is square.", unassigned: (n) => `${n} expense(s) have no payer and are not counted.`, noLikes: "no likes saved", avoids: "Avoids",
    nothing: "Nothing pending", calendar: "Add to calendar", share: "Share brief", copied: "Copied", panel: "View panel", autopilot: "Get me ready",
  },
  es: {
    source: "Fuente", verified: "verificado", checked: "fuentes consultadas", notReviewed: "compilado por nosotros, sin revisión humana", reviewed: "revisado por una persona", confidence: "confianza", level: { low: "baja", medium: "media", high: "alta" }, visaFree: "Sin visa", upTo: (d) => `estancias de hasta ${d} días`,
    entry: "Entrada", rules: "Reglas locales", budget: "Presupuesto", ppp: "Rinde como", essentials: "Básicos",
    currency: "Moneda", plugs: "Enchufes", emergency: "Emergencias", languages: "Idioma", packing: "Lista de equipaje",
    packed: (a, b) => `${a} de ${b} empacados`, doNotPack: "No llevar", plan: "Plan de días", free: "Día libre",
    morning: "Mañana", afternoon: "Tarde", evening: "Noche", day: "Día", brief: "Lo que falta", ready: "listo",
    daysLeft: (n) => (n === 1 ? "Falta 1 día" : `Faltan ${n} días`), daysUnit: (n) => (n === 1 ? "día para el viaje" : "días para el viaje"), tapToTick: "Toca para marcar", profile: "Perfil del viajero",
    planEmpty: "Aún no hay plan de días", planEmptyHint: "Dime qué te gusta y armo uno con lugares reales.",
    settleBtn: "Cuentas", settle: "Cuentas del grupo", fairness: "Equidad del plan", transfers: "Transferencias", squared: "Todos están a mano.", unassigned: (n) => `${n} gasto(s) no tienen quién pagó y no cuentan.`, noLikes: "sin gustos guardados", avoids: "Evita",
    nothing: "Sin pendientes", calendar: "Calendario", share: "Compartir", copied: "Copiado", panel: "Ver panel", autopilot: "Prepárame",
  },
};
export const words = (lang) => L[lang] || L.en;

const STATUS_TONE = { visa_free: "ok", same_country: "ok", eta: "warn", e_visa: "warn", visa_on_arrival: "warn", visa_required: "blocked", no_admission: "blocked" };
const toneIcon = (tone) => icon(tone === "ok" ? "check" : tone === "blocked" ? "stop" : "alert");

function shortDate(iso, lang) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

function sourceLine(sc, lang, prefer) {
  const w = words(lang);
  const all = sc.sources || [];
  const src = (prefer && all.find((s) => prefer.test(`${s.id} ${s.title}`))) || all.find((s) => /fcdo|gov|state|canada|cdc|who/i.test(`${s.id} ${s.title}`)) || all[0];
  if (!src) return "";
  const name = String(src.title || "").split(":")[0].split(" (")[0];
  // Say what is known: when the sources were checked, whether a person reviewed the content, and how confident we are.
  const bits = [];
  if (sc.lastVerified) bits.push(`${w.checked} ${sc.lastVerified}`);
  if (sc.review === "curated") bits.push(w.notReviewed);
  if (sc.review === "human") bits.push(w.reviewed);
  if (sc.confidence && w.level[sc.confidence]) bits.push(`${w.confidence}: ${w.level[sc.confidence]}`);
  return `<div class="src">${esc(w.source)}: ${esc(name)}${bits.map((b) => ` · ${esc(b)}`).join("")}</div>`;
}

const PREFER = { budget: /er-api|exchange/i, entry: /fcdo|state|passport/i, profile: /passport/i };
function shell(kind, title, body, sc, lang, extra = "") {
  return `<article class="card k-${kind}" ${extra}><header class="ch"><h2>${esc(title)}</h2></header>${body}${sourceLine(sc, lang, PREFER[kind])}</article>`;
}

// A list longer than this shows its first rows and a count; the rest is one tap away in the conversation.
const MAX_ROWS = 8;
// The cards a tourist acts on show the brands they name as chips: apps by name, payments and transit cards from the text.
const BRAND_TOOLS = new Set(["get_payment_methods", "get_local_apps", "get_transit_payment"]);
export function genericCard(card, sc = {}, lang = "en", tool = "") {
  if (!card) return "";
  const all = card.rows || [];
  const shown = all.slice(0, MAX_ROWS);
  const more = all.length - shown.length;
  const withBrands = BRAND_TOOLS.has(tool);
  const rows = shown
    .map((r) => {
      // A row named after a brand (an app) shows its chip in place of the dot; otherwise the chips for the brands in the text go under the row.
      const own = withBrands ? brandsIn(r.label).find((b) => b.name.toLowerCase() === String(r.label).trim().toLowerCase()) : null;
      const label = own ? brandChip(own) : `<span class="dot"></span>${esc(r.label)}`;
      const strip = withBrands && !own ? brandStrip(`${r.label}. ${r.value ?? ""}`) : "";
      return `<div class="row ${esc(r.status || "")}${String(r.value ?? "").length > 40 ? " long" : ""}${strip ? " has-brands" : ""}"><span class="label">${label}</span><span class="value">${esc(r.value)}</span>${strip}</div>`;
    })
    .join("");
  const count = more > 0 ? `<p class="muted-s more">${esc(lang === "es" ? `y ${more} más` : `and ${more} more`)}</p>` : "";
  const wide = all.length > 4 ? " wide" : "";
  return `<article class="card${wide}"><header class="ch"><h2>${esc(card.title)}</h2>${card.subtitle ? `<div class="sub">${esc(card.subtitle)}</div>` : ""}</header>${rows}${count}${sourceLine(sc, lang)}</article>`;
}

function entryCard(sc, lang) {
  const w = words(lang);
  const results = sc.data?.results || [];
  if (!results.length) return genericCard(sc.card, sc, lang);
  const rowsByName = Object.fromEntries((sc.card?.rows || []).map((r) => [r.label, r.value]));
  const body = results
    .map((r) => {
      const tone = STATUS_TONE[r.status] || "warn";
      const headline = r.status === "visa_free" ? w.visaFree : rowsByName[r.traveler] || r.status;
      const sub = r.status === "visa_free" && r.maxStayDays ? w.upTo(r.maxStayDays) : "";
      return `<div class="verdict ${tone}">${toneIcon(tone)}<div><div class="v-name">${esc(r.traveler)}</div><div class="v-main">${esc(headline)}</div>${sub ? `<div class="v-sub">${esc(sub)}</div>` : ""}</div></div>`;
    })
    .join("");
  return shell("entry", sc.card?.title || w.entry, body, sc, lang);
}

// The usual weather on the trip's dates: the high and low large, a bar on a -10 to 40 °C scale, the rain, and what to pack.
function climateCard(sc, lang) {
  const d = sc.data || {};
  if (typeof d.hi !== "number") return genericCard(sc.card, sc, lang);
  const es = lang === "es";
  const at = (t) => Math.max(0, Math.min(100, ((t + 10) / 50) * 100)).toFixed(1);
  const advice = (d.advice || []).map((a) => `<li>${icon("bag")}<span>${esc(a)}</span></li>`).join("");
  const body = `
    <div class="sub clim-sub">${esc(sc.card?.subtitle || "")}</div>
    <div class="clim">
      <div class="clim-temps"><span class="clim-hi">${esc(d.hi)}°</span><span class="clim-lo">${esc(d.lo)}°</span></div>
      <div class="clim-bar" aria-hidden="true"><span style="left:${at(d.lo)}%;right:${(100 - at(d.hi)).toFixed(1)}%"></span></div>
      <div class="clim-meta">${icon("drop")}<span>${esc(es ? `${d.rain} mm de lluvia al día` : `${d.rain} mm of rain a day`)}</span></div>
    </div>
    ${advice ? `<ul class="pending clim-advice">${advice}</ul>` : ""}`;
  return shell("climate", sc.card?.title || (es ? "Clima" : "Weather"), body, sc, lang);
}

function rulesCard(sc, lang) {
  const rows = sc.card?.rows || [];
  if (!rows.length) return genericCard(sc.card, sc, lang);
  const body = `<ul class="rules">${rows
    .slice(0, 6)
    .map((r) => {
      const [cat, sev] = String(r.label).split(" · ");
      const severe = /arrest|arresto|severe|grave/i.test(sev || "");
      return `<li class="${severe ? "sev" : ""}"><div class="r-top"><span class="r-cat">${esc(cat)}</span>${sev ? `<span class="pill ${severe ? "blocked" : "warn"}">${esc(sev)}</span>` : ""}</div><p>${esc(r.value)}</p></li>`;
    })
    .join("")}</ul>`;
  return shell("rules", sc.card?.title || words(lang).rules, body, sc, lang);
}

function budgetCard(sc, lang) {
  const w = words(lang);
  const rows = sc.card?.rows || [];
  const exchange = rows[0]?.value || "";
  const [from, to] = exchange.split(" = ");
  const ppp = rows.find((r) => /PPP|PPA/.test(r.label));
  const body = `<div class="money"><div class="m-from">${esc(from || "")}</div><div class="m-to">${esc(to || exchange)}</div>${ppp ? `<div class="m-ppp">${esc(w.ppp)} ${esc(String(ppp.value).replace(/^≈\s*/, ""))}</div>` : ""}</div>`;
  return shell("budget", sc.card?.title || w.budget, body, sc, lang);
}

function essentialsCard(sc, lang) {
  const w = words(lang);
  const e = sc.data?.essentials || {};
  const emergency = e.emergency && typeof e.emergency === "object" ? Object.entries(e.emergency).filter(([, v]) => /^\+?[\d\s-]{2,}$/.test(String(v))) : [];
  const langs = e.languageNames?.[lang] || e.languageNames?.en || (Array.isArray(e.languages) ? e.languages : []);
  const tiles = [
    e.currency && [icon("coin"), w.currency, e.currency],
    e.plugTypes?.length && [icon("plug"), w.plugs, e.plugTypes.join(" / ")],
    emergency.length && [icon("phone"), w.emergency, emergency.map(([, v]) => `${v}`).filter((v, i, a) => a.indexOf(v) === i).join(" · ")],
    langs.length && [icon("talk"), w.languages, langs.join(", ")],
  ].filter(Boolean);
  if (!tiles.length) return genericCard(sc.card, sc, lang);
  const body = `<div class="tiles">${tiles.map(([i, k, v]) => `<div class="tile">${i}<div class="t-k">${esc(k)}</div><div class="t-v">${esc(v)}</div></div>`).join("")}</div>`;
  return shell("essentials", sc.card?.title || w.essentials, body, sc, lang);
}

function packingCard(sc, lang) {
  const w = words(lang);
  const items = sc.data?.items || [];
  if (!items.length) return genericCard(sc.card, sc, lang);
  const pack = items.filter((i) => i.group !== "do-not-pack");
  const avoid = items.filter((i) => i.group === "do-not-pack");
  const pct = pack.length ? Math.round((100 * pack.filter((i) => i.done).length) / pack.length) : 0;
  const body = `
    <div class="progress" role="progressbar" aria-label="${esc(w.packed(pack.filter((i) => i.done).length, pack.length))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    <div class="sub">${esc(w.packed(pack.filter((i) => i.done).length, pack.length))} · ${esc(w.tapToTick)}</div>
    <ul class="check">${pack
      .map((i) => `<li><button type="button" class="tick ${i.done ? "on" : ""}" data-pack-id="${esc(i.id)}" aria-pressed="${i.done}">${icon("check")}<span>${esc(i.label)}</span></button></li>`)
      .join("")}</ul>
    ${avoid.length ? `<div class="avoid"><div class="a-h">${icon("stop")}${esc(w.doNotPack)}</div>${avoid.map((i) => `<p>${esc(i.label)}</p>`).join("")}</div>` : ""}`;
  return shell("packing", w.packing, body, sc, lang);
}

function itineraryCards(sc, lang) {
  const w = words(lang);
  // Only the days that have a plan: a day without one is not shown, and the host asks before leaving days free.
  const all = sc.data?.days || [];
  const days = all.filter((d) => (d.stops || []).length);
  if (!days.length) {
    return `<article class="card k-day"><header class="ch"><h2>${esc(w.planEmpty)}</h2></header><p class="muted-s">${esc(w.planEmptyHint)}</p></article>`;
  }
  return days
    .map((d) => {
      const stops = d.stops || [];
      const body = stops.length
        ? `<ol class="slots">${stops
            .map((s) => `<li>${icon(s.category === "food" ? "talk" : s.category === "nature" ? "sun" : "sun")}<div><div class="s-k">${esc(s.area)} · ${esc(s.durationMinutes)} min</div><div class="s-v">${esc(s.name)}</div>${s.admission ? `<div class="s-note">${esc(s.admission)}</div>` : ""}</div></li>`)
            .join("")}</ol>`
        : `<p class="muted-s">${esc(w.free)}</p>`;
      return `<article class="card k-day"><header class="ch"><div class="d-n">${esc(w.day)} ${d.day}${d.date ? ` · ${esc(shortDate(d.date, lang))}` : ""}</div>${d.title ? `<h2>${esc(d.title)}</h2>` : ""}</header>${body}</article>`;
    })
    .join("");
}

function briefCard(sc, lang) {
  const w = words(lang);
  const d = sc.data || {};
  if (d.readiness === undefined) return genericCard(sc.card, sc, lang);
  const items = (d.pending || []).length
    ? `<ul class="pending">${d.pending.map((p) => `<li>${icon("alert")}<span>${esc(p)}</span></li>`).join("")}</ul>`
    : `<p class="ok-line">${icon("check")}${esc(w.nothing)}</p>`;
  return shell("brief", w.brief, items, sc, lang);
}

export function ring(pct, label, from = null) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const start = from === null ? v : Math.max(0, Math.min(100, Number(from) || 0));
  return `<div class="ring" aria-label="${v}% ${esc(label)}"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" class="r-bg"/><circle cx="40" cy="40" r="${r}" class="r-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}" style="--from:${c * (1 - start / 100)}"/></svg><div class="r-v"><b>${v}%</b><span>${esc(label)}</span></div></div>`;
}

function profileCard(sc, lang) {
  return genericCard({ ...sc.card, title: sc.card?.title || words(lang).profile }, sc, lang);
}

// Group money: who is owed and who owes, then the transfers that square everyone up.
function settleCard(sc, lang) {
  const w = words(lang);
  const d = sc.data || {};
  const balances = Object.entries(d.balances || {});
  if (!balances.length) return genericCard(sc.card, sc, lang);
  const max = Math.max(1, ...balances.map(([, v]) => Math.abs(v)));
  const rows = balances
    .map(([name, v]) => {
      const pct = Math.round((Math.abs(v) / max) * 100);
      return `<div class="bal ${v >= 0 ? "pos" : "neg"}"><div class="bal-top"><span>${esc(name)}</span><b>${v >= 0 ? "+" : "−"}${esc(Math.abs(v).toFixed(2))} ${esc(d.home || "")}</b></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
    })
    .join("");
  const transfers = (d.transfers || [])
    .map((t) => `<li>${icon("coin")}<span><b>${esc(t.from)}</b> → <b>${esc(t.to)}</b> · ${esc(Number(t.amount).toFixed(2))} ${esc(d.home || "")}</span></li>`)
    .join("");
  const body = `${rows}${transfers ? `<div class="sub-h">${esc(w.transfers)}</div><ul class="pending">${transfers}</ul>` : `<p class="ok-line">${icon("check")}${esc(w.squared)}</p>`}${d.unassigned ? `<p class="muted-s">${esc(w.unassigned(d.unassigned))}</p>` : ""}`;
  return shell("settle", sc.card?.title || w.settle, body, sc, lang);
}

// Fairness: how much of the plan each traveler actually likes, and what they avoid.
function fairnessCard(sc, lang) {
  const w = words(lang);
  const rows = sc.data?.rows || [];
  if (!rows.length) return genericCard(sc.card, sc, lang);
  const body = rows
    .map((r) => {
      const pct = r.score === null || r.score === undefined ? null : Math.round(r.score * 100);
      const low = pct !== null && pct < 34;
      return `<div class="fair ${r.clash?.length ? "clash" : low ? "low" : ""}">
        <div class="bal-top"><span>${esc(r.traveler)}</span><b>${pct === null ? esc(w.noLikes) : `${r.liked}/${r.stops} · ${pct}%`}</b></div>
        ${pct === null ? "" : `<div class="bar"><span style="width:${pct}%"></span></div>`}
        ${(r.clash || []).length ? `<div class="avoid-chip">${icon("stop")}${esc(w.avoids)}: ${esc(r.clash.join(", "))}</div>` : ""}
      </div>`;
    })
    .join("");
  return shell("fairness", sc.card?.title || w.fairness, body, sc, lang);
}

const RENDER = {
  check_entry_requirements: entryCard,
  get_local_rules: rulesCard,
  get_trip_climate: climateCard,
  convert_budget: budgetCard,
  get_destination_essentials: essentialsCard,
  packing_checklist: packingCard,
  build_itinerary: itineraryCards,
  trip_brief: briefCard,
  update_traveler_profile: profileCard,
  settle_up: settleCard,
  plan_fairness: fairnessCard,
};

/** Cards for one tool result. plan_trip is shown as the trip hero instead. */
export function renderTool(tool, sc, lang) {
  if (!sc) return "";
  const fn = RENDER[tool];
  return fn ? fn(sc, lang) : genericCard(sc.card, sc, lang, tool);
}

/** The trip hero: destination, dates, countdown and readiness, with real-world actions. */
// The ring moves from the readiness the hero last showed for the same trip, so a change is seen.
let heroLast = null;
export function heroHtml(brief, lang, panel = false) {
  const w = words(lang);
  if (!brief || !brief.destination) return "";
  const from = heroLast && heroLast.tripId === brief.tripId ? heroLast.readiness : null;
  heroLast = { tripId: brief.tripId, readiness: brief.readiness };
  const dates = `${shortDate(brief.startDate, lang)} – ${shortDate(brief.endDate, lang)}`;
  const globe = brief.geo
    ? `<div class="h-globe"><canvas class="globe" role="img" aria-label="${esc(lang === "es" ? `Rutas del grupo hacia ${brief.destinationName || brief.destination}` : `The group's routes to ${brief.destinationName || brief.destination}`)}"></canvas></div>`
    : "";
  return `<section class="hero${globe ? " has-globe" : ""}">
    <div class="h-main">
      <div class="h-kicker">${icon("plane")}${esc(dates)} · ${esc(brief.stay)} ${brief.stay === 1 ? (lang === "es" ? "día" : "day") : (lang === "es" ? "días" : "days")}${brief.climate ? `<span class="h-clim">${icon("temp")}${esc(brief.climate.hi)}° / ${esc(brief.climate.lo)}°</span>` : ""}</div>
      <div class="h-dest">${esc(brief.destinationName || brief.destination)}</div>
      <div class="h-stats">
        <div class="h-count"><b>${esc(brief.daysUntil)}</b><span>${esc(w.daysUnit(brief.daysUntil))}</span></div>
        ${ring(brief.readiness, w.ready, from)}
      </div>
    </div>
    ${globe}
    <div class="h-actions">
        <button type="button" class="act primary" data-action="autopilot">${icon("spark")}${esc(w.autopilot)}</button>
        <button type="button" class="act" data-action="ics">${icon("calendar")}${esc(w.calendar)}</button>
        <button type="button" class="act" data-action="settle">${icon("people")}${esc(w.settleBtn)}</button>
        <button type="button" class="act" data-action="share">${icon("share")}${esc(w.share)}</button>
        ${panel ? `<button type="button" class="act" data-action="panel">${icon("panel")}${esc(w.panel)}</button>` : ""}
    </div>
  </section>`;
}

/** An .ics calendar file for the trip (all-day event, end date exclusive). */
export function tripIcs(brief, lang) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const day = (iso) => iso.replace(/-/g, "");
  const end = new Date(Date.parse(`${brief.endDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const title = lang === "es" ? `Viaje a ${brief.destinationName}` : `Trip to ${brief.destinationName}`;
  const notes = (brief.pending || []).join("\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Waypoint//Travel concierge//EN", "BEGIN:VEVENT",
    `UID:${brief.tripId}@waypoint`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(brief.startDate)}`, `DTEND;VALUE=DATE:${day(end)}`,
    `SUMMARY:${title}`, `DESCRIPTION:${notes}`,
    "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", `DESCRIPTION:${title}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
