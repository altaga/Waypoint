// Autopilot: the whole trip preparation as one visible run of real MCP tool calls. Each step is a
// tools/call on the Waypoint server, chained by the host (the result of one feeds the next); the
// screen shows each step running, its result, its time and its source, then says a short summary.
import { esc, icon } from "./cards.js";

const WORDS = {
  en: {
    title: (d) => `Getting you ready for ${d}`,
    sub: "Autopilot · live MCP tool calls",
    steps: { profile: "Travelers", entry: "Entry, per passport", rules: "Local rules", climate: "Climate on your dates", places: "Real places to see", plan: "Day plan", packing: "Packing list", essentials: "Essentials", brief: "Readiness" },
    calls: (n, par, ms) => `${n} MCP calls · ${par} in parallel · ${ms} ms`,
    sources: "Sources",
    ready: (names) => `${names} ready`,
    needs: (names) => `${names}: paperwork needed`,
    rules: (n, serious) => `${n} rules${serious ? `, ${serious} serious` : ""}`,
    rain: (r) => (r >= 4 ? "frequent rain" : r >= 1.5 ? "some rain" : "little rain"),
    places: (n) => `${n} verified places`,
    planned: (n) => `${n} day${n === 1 ? "" : "s"} planned`,
    kept: (n) => `${n} day${n === 1 ? "" : "s"} already planned, kept`,
    fixed: (n) => `${n} fix${n === 1 ? "" : "es"} from the verifier`,
    items: (n, coat) => `${n} items${coat ? ", coat included" : ""}`,
    readiness: (p, d) => `${p}% ready · ${d} days to go`,
    failed: "could not finish",
    noTrip: "First tell me where and when you're going, and I'll get everything ready.",
    // The weather is left out when that step failed: a missing number must not be read out.
    summary: (s) => {
      const weather = s.hi == null ? "" : ` I also checked the weather: around ${s.hi} and ${s.lo} degrees.`;
      return `Done. I checked entry for ${s.travelers} passports and ${s.rules} local rules.${weather} ${s.days ? `I planned ${s.days} days and packed` : "I packed"} a list of ${s.items} items. You're ${s.readiness}% ready.${s.needs ? ` ${s.needs} still needs paperwork.` : ""}`;
    },
  },
  es: {
    title: (d) => `Preparando tu viaje a ${d}`,
    sub: "Piloto automático · llamadas MCP en vivo",
    steps: { profile: "Viajeros", entry: "Entrada por pasaporte", rules: "Reglas locales", climate: "Clima en tus fechas", places: "Lugares reales para ver", plan: "Plan de días", packing: "Lista de equipaje", essentials: "Básicos", brief: "Preparación" },
    calls: (n, par, ms) => `${n} llamadas MCP · ${par} en paralelo · ${ms} ms`,
    sources: "Fuentes",
    ready: (names) => `${names} sin trámite`,
    needs: (names) => `${names}: trámite pendiente`,
    rules: (n, serious) => `${n} reglas${serious ? `, ${serious} graves` : ""}`,
    rain: (r) => (r >= 4 ? "lluvia frecuente" : r >= 1.5 ? "algo de lluvia" : "poca lluvia"),
    places: (n) => `${n} lugares verificados`,
    planned: (n) => `${n} día${n === 1 ? "" : "s"} planeado${n === 1 ? "" : "s"}`,
    kept: (n) => `${n} día${n === 1 ? "" : "s"} ya planeado${n === 1 ? "" : "s"}, se conservan`,
    fixed: (n) => `${n} corrección${n === 1 ? "" : "es"} del verificador`,
    items: (n, coat) => `${n} cosas${coat ? ", con abrigo" : ""}`,
    readiness: (p, d) => `${p}% listo · faltan ${d} días`,
    failed: "no se pudo completar",
    noTrip: "Primero dime a dónde y cuándo viajas, y yo preparo todo.",
    summary: (s) => {
      const weather = s.hi == null ? "" : ` También revisé el clima: unos ${s.hi} y ${s.lo} grados.`;
      return `Listo. Revisé la entrada de ${s.travelers} pasaportes y ${s.rules} reglas locales.${weather} ${s.days ? `Planeé ${s.days} días y armé` : "Armé"} una maleta de ${s.items} cosas. Vas ${s.readiness}% listo.${s.needs ? ` A ${s.needs} le falta un trámite de entrada.` : ""}`;
    },
  },
};

const words = (lang) => WORDS[lang === "es" ? "es" : "en"];
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const listOf = (names, lang) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${names[names.length - 1]}`);

/** True when the traveler asks the host to get the whole trip ready. */
export function isAutopilot(text) {
  return /\b(preparame|prepara(r)? (todo|mi viaje|el viaje)|piloto automatico|autopilot|get me ready|get (everything|it all) ready|organiza(r)? todo|hazlo todo)\b/.test(fold(text));
}

export function noTripLine(lang) {
  return words(lang).noTrip;
}

// The run is a small dependency graph: the profile first; then everything that only needs the
// destination, at once; then what needs those results; the readiness last.
const PHASES = [["profile"], ["entry", "rules", "climate", "essentials", "places"], ["plan", "packing"], ["brief"]];
const STEP_KEYS = PHASES.flat();
const TOOL_OF = { profile: "get_traveler_profile", entry: "check_entry_requirements", rules: "get_local_rules", climate: "get_trip_climate", places: "get_highlights", plan: "build_itinerary", packing: "packing_checklist", essentials: "get_destination_essentials", brief: "trip_brief" };
// Each step stays on screen long enough to read; the times shown are the calls' own.
const MIN_STEP_MS = 520;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** The mission card, every step waiting. Steps that run at the same time share a rail. */
export function missionHtml(lang, destName) {
  const w = words(lang);
  const steps = PHASES.flatMap((keys, phase) =>
    keys.map((k) => {
      const i = STEP_KEYS.indexOf(k);
      const par = keys.length > 1 ? ` data-par="${keys.indexOf(k) === 0 ? "first" : keys.indexOf(k) === keys.length - 1 ? "last" : "mid"}"` : "";
      return `<li class="m-step" data-key="${k}" data-phase="${phase + 1}" data-state="pending"${par} style="--i:${i}">
      <span class="m-ico" aria-hidden="true">${icon("check")}</span>
      <span class="m-text"><span class="m-name">${esc(w.steps[k])}</span><span class="m-res"></span></span>
      <code class="m-tool">${esc(TOOL_OF[k])}</code>
      <span class="m-ms"></span>
    </li>`;
    }),
  );
  return `<article class="card wide k-mission" aria-busy="true">
    <header class="ch"><h2>${esc(w.title(destName))}</h2><div class="sub">${esc(w.sub)}</div></header>
    <div class="m-progress" aria-hidden="true"><span></span></div>
    <ol class="mission">${steps.join("")}</ol>
    <div class="m-foot"></div>
  </article>`;
}

function mark(root, key, state, text = "", ms = null) {
  const li = root.querySelector(`.m-step[data-key="${key}"]`);
  if (!li) return;
  li.dataset.state = state;
  li.querySelector(".m-res").textContent = text;
  li.querySelector(".m-ms").textContent = ms === null ? "" : `${ms} ms`;
  const done = root.querySelectorAll('.m-step[data-state="done"], .m-step[data-state="skip"], .m-step[data-state="err"]').length;
  root.querySelector(".m-progress span").style.width = `${Math.round((100 * done) / STEP_KEYS.length)}%`;
}

/** A source's publisher, short: "FCDO travel advice: Japan - Health" is "FCDO travel advice". */
const publisher = (title) => String(title).split(/:| \(|,/)[0].trim();

const INTERESTS = new Set(["food", "museums", "nature", "temples", "history", "shopping", "nightlife", "beaches", "family", "architecture", "markets", "art", "sights"]);
const MAX_MINUTES = 600;

/** Days from the catalog's places: one city a day where possible, within the pace's stop limit and the day's hours. */
function planFrom(places, stay, pace) {
  const perDay = pace === "relaxed" ? 2 : pace === "packed" ? 4 : 3;
  const days = Math.min(3, Math.max(1, stay || 1));
  const byCity = new Map();
  for (const p of places) {
    const key = p.city || p.area || "";
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(p);
  }
  const plan = [];
  for (const group of [...byCity.values()].sort((a, b) => b.length - a.length)) {
    let stops = [], minutes = 0;
    const flush = () => {
      if (stops.length && plan.length < days) plan.push({ day: plan.length + 1, title: stops[0].city || undefined, stops: stops.map((p) => p.id) });
      stops = [];
      minutes = 0;
    };
    for (const p of group) {
      if (plan.length >= days) break;
      const m = p.durationMinutes || 90;
      if (stops.length >= perDay || minutes + m > MAX_MINUTES) flush();
      if (plan.length >= days) break;
      stops.push(p);
      minutes += m;
    }
    flush();
    if (plan.length >= days) break;
  }
  return plan;
}

/** The plan without what the verifier rejected: the named places, or a day's last stop when the day ran long. */
function repair(plan, violations) {
  const drop = new Set(violations.map((v) => v.placeId).filter(Boolean));
  const long = new Set(violations.filter((v) => !v.placeId).map((v) => v.day));
  return plan
    .map((d) => ({ ...d, stops: d.stops.filter((id) => !drop.has(id)).slice(0, long.has(d.day) ? -1 : undefined) }))
    .filter((d) => d.stops.length)
    .map((d, i) => ({ ...d, day: i + 1 }));
}

/**
 * Runs the mission against the MCP client. root is the mission card; brief is the current trip
 * brief (it must have a destination). Returns the spoken summary and the run's totals.
 */
export { planFrom, repair };

export async function runMission({ client, lang, brief, root, minStepMs = MIN_STEP_MS }) {
  const w = words(lang);
  const dest = brief.destination;
  const sources = new Set();
  const facts = { travelers: 0, rules: 0, hi: null, lo: null, days: 0, items: 0, readiness: brief.readiness, needs: "" };
  let calls = 0;
  let profile = null;

  // One tools/call: the step spins while it runs and shows its own time when it lands.
  const call = async (key, tool, args) => {
    mark(root, key, "run");
    const t0 = performance.now();
    calls++;
    const r = await client.callTool(tool, args).catch((e) => ({ isError: true, content: [{ text: String(e?.message || e) }] }));
    const ms = Math.round(performance.now() - t0);
    if (minStepMs > ms) await wait(minStepMs - ms);
    if (r.isError) {
      mark(root, key, "err", w.failed, ms);
      return null;
    }
    for (const s of r.structuredContent?.sources || []) if (s?.title) sources.add(publisher(s.title));
    return { sc: r.structuredContent, ms };
  };
  // A phase's steps run together; the phase takes as long as its slowest call.
  let callMs = 0;
  const phase = async (...steps) => {
    const t0 = performance.now();
    const times = await Promise.all(steps.map((f) => f().catch(() => 0)));
    callMs += Math.min(Math.max(0, ...times.map((x) => x || 0)), performance.now() - t0);
  };

  // 1. Who travels, with their pace and interests.
  await phase(async () => {
    const r = await call("profile", "get_traveler_profile", {});
    if (!r) return 0;
    profile = r.sc.data?.profile || null;
    const names = (profile?.travelers || []).map((t) => t.displayName);
    facts.travelers = names.length;
    mark(root, "profile", "done", listOf(names, lang), r.ms);
    return r.ms;
  });

  // 2. Everything that needs only the destination, at once.
  let places = [];
  const keepPlan = (brief.planned || 0) > 0;
  await phase(
    async () => {
      const r = await call("entry", "check_entry_requirements", { destination: dest });
      if (!r) return 0;
      const rows = r.sc.card?.rows || [];
      const ok = rows.filter((x) => x.status === "ok").map((x) => x.label);
      const need = rows.filter((x) => x.status !== "ok").map((x) => x.label);
      facts.needs = listOf(need, lang);
      const parts = [ok.length ? w.ready(listOf(ok, lang)) : "", need.length ? w.needs(listOf(need, lang)) : ""].filter(Boolean);
      mark(root, "entry", "done", parts.join(" · "), r.ms);
      return r.ms;
    },
    async () => {
      const r = await call("rules", "get_local_rules", { destination: dest });
      if (!r) return 0;
      const rules = r.sc.data?.rules || [];
      facts.rules = rules.length;
      const serious = rules.filter((x) => x.severity === "severe" || x.severity === "arrest").length;
      mark(root, "rules", "done", w.rules(rules.length, serious), r.ms);
      return r.ms;
    },
    async () => {
      const r = await call("climate", "get_trip_climate", {});
      if (!r) return 0;
      const d = r.sc.data || {};
      facts.hi = d.hi;
      facts.lo = d.lo;
      mark(root, "climate", "done", typeof d.hi === "number" ? `${d.hi}° / ${d.lo}° · ${w.rain(d.rain)}` : "", r.ms);
      return r.ms;
    },
    async () => {
      const r = await call("essentials", "get_destination_essentials", { destination: dest });
      if (!r) return 0;
      const e = r.sc.data?.essentials || {};
      const parts = [e.currency, e.plugTypes?.length ? (lang === "es" ? `enchufe ${e.plugTypes.join("/")}` : `plug ${e.plugTypes.join("/")}`) : ""].filter(Boolean);
      mark(root, "essentials", "done", parts.join(" · "), r.ms);
      return r.ms;
    },
    async () => {
      // A saved plan is kept: the places are only needed to build a new one.
      if (keepPlan) {
        mark(root, "places", "skip", "", null);
        return 0;
      }
      const known = (profile?.interests || []).filter((i) => INTERESTS.has(i));
      const interests = known.length ? known : ["food", "temples", "sights"];
      const r = await call("places", "get_highlights", { destination: dest, interests, limit: 12 });
      if (!r) return 0;
      places = r.sc.data?.places || [];
      mark(root, "places", "done", w.places(places.length), r.ms);
      return r.ms;
    },
  );

  // 3. A verified day plan from those places, and the packing list (which reads the climate and the rules).
  await phase(
    async () => {
      if (keepPlan) {
        mark(root, "plan", "skip", w.kept(brief.planned), null);
        return 0;
      }
      let plan = planFrom(places, brief.stay, profile?.pace);
      if (!plan.length) {
        mark(root, "plan", "skip", "", null);
        return 0;
      }
      // The server verifies every plan before saving it; what it rejects is dropped and the plan is sent again once.
      const rejected = (x) => x?.sc.data?.violations || [];
      let r = await call("plan", "build_itinerary", { plan });
      let fixes = 0;
      let ms = r?.ms || 0;
      if (r && rejected(r).length) {
        fixes = rejected(r).length;
        plan = repair(plan, rejected(r));
        if (plan.length) {
          r = await call("plan", "build_itinerary", { plan });
          ms += r?.ms || 0;
        }
      }
      if (!r) return ms;
      const saved = rejected(r).length || !plan.length ? 0 : plan.length;
      facts.days = saved;
      mark(root, "plan", saved ? "done" : "err", saved ? `${w.planned(saved)}${fixes ? ` · ${w.fixed(fixes)}` : ""}` : w.failed, ms);
      return ms;
    },
    async () => {
      const r = await call("packing", "packing_checklist", {});
      if (!r) return 0;
      const items = (r.sc.data?.items || []).filter((i) => i.group !== "do-not-pack");
      facts.items = items.length;
      mark(root, "packing", "done", w.items(items.length, items.some((i) => i.id === "warm")), r.ms);
      return r.ms;
    },
  );

  // 4. Readiness after all of it.
  await phase(async () => {
    const r = await call("brief", "trip_brief", {});
    if (!r) return 0;
    facts.readiness = r.sc.data?.readiness ?? facts.readiness;
    mark(root, "brief", "done", w.readiness(facts.readiness, r.sc.data?.daysUntil ?? brief.daysUntil), r.ms);
    return r.ms;
  });

  const widest = Math.max(...PHASES.map((p) => p.length));
  const pills = [...sources].map((s) => `<span class="m-src">${esc(s)}</span>`).join("");
  root.querySelector(".m-foot").innerHTML = `<span class="m-stats">${esc(w.calls(calls, widest, Math.round(callMs)))}</span>${pills ? `<span class="m-srcs"><span class="m-srcs-h">${esc(w.sources)}</span>${pills}</span>` : ""}`;
  root.classList.add("m-done");
  root.removeAttribute("aria-busy");
  return { voice: w.summary(facts), calls, ms: Math.round(callMs) };
}
