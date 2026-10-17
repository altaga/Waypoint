// Simulated Alexa+ host: an Echo Show-style screen next to the conversation, voice in/out,
// text fallback, ES/EN (the language follows what the traveler writes), elicitation forms,
// an MCP Apps iframe host, and a protocol log for developers. It talks to the Waypoint MCP
// server through a real MCP client (mcp-client.js).
import { McpClient, PROTOCOL_VERSION } from "./mcp-client.js";
import { routeUtterance } from "./router.js";
import { esc, heroHtml, renderTool, tripIcs, words } from "./cards.js";
import { detectLang } from "./lang.js";
import { speakable } from "./speech.js";
import { mountGlobe } from "./globe.js";
import { isAutopilot, missionHtml, noTripLine, runMission } from "./mission.js";

const $ = (id) => document.getElementById(id);

const UI = {
  en: {
    connecting: "connecting…",
    connected: () => "connected",
    listening: "Listening…",
    noSpeech: "Voice input is not available in this browser. Type instead.",
    lang: "en-US",
    brain: "Assistant: local router, no AWS needed.",
    brainBedrock: "Assistant: Bedrock agent on the server.",
    tagline: "Travel concierge · simulated Alexa+ host",
    chatTitle: "Conversation",
    lblVoice: "Read aloud",
    inputPlaceholder: "Type or speak",
    emptyChat: "Ask about your trip: entry rules, what to pack, what to see, what your group owes.",
    welcomeIntro: "I can help with",
    welcomeTags: ["Entry rules", "Local rules", "Budget", "Packing", "Day plan", "Group money"],
    protocol: "For developers: MCP protocol log",
    thinking: "Waypoint is checking…",
    menu: "Settings",
    ariaLang: "Language", ariaDevice: "Device", optMobile: "Mobile", optVoice: "Voice only",
    moreCue: "Full reply in the chat",
    hello: "Hi, I'm Waypoint, your travel concierge. Tell me where you're going and when.",
    welcomeBack: (name) => `Welcome back${name ? ", " + name : ""}.`,
    chips: [
      "My passport is Mexican",
      "I'm going to Japan from December 3 to 10",
      "What's left for my trip?",
      "Can I bring vapes to Singapore?",
      "How much is 1000 dollars in yen?",
    ],
    chipsTrip: [
      "Get me ready for the trip",
      "What's left for my trip?",
      "Plan my days: food and temples",
      "What should I pack?",
      "What will the weather be like?",
      "What can't I bring?",
      "How much is 20,000 pesos there?",
    ],
    tools: {
      get_traveler_profile: "Profile", update_traveler_profile: "Saved profile", plan_trip: "Trip plan",
      check_entry_requirements: "Entry rules", get_local_rules: "Local rules", get_destination_essentials: "Essentials",
      convert_budget: "Budget", packing_checklist: "Packing", build_itinerary: "Itinerary", trip_brief: "Trip brief",
      log_expense: "Expense", forget_me: "Forget me", get_highlights: "Places", set_trip_constraints: "Trip rules",
      add_booking: "Booking", confirm_booking: "Confirmed", settle_up: "Group money", plan_fairness: "Fairness", export_trip: "Export",
      get_trip_climate: "Climate",
      get_payment_methods: "Payments",
    },
    demoDone: "Example group saved: Ana (Mexico), Sam (United States), Priya (India).",
    notUnderstood: "I didn't catch that. Try: “Can I bring vapes to Singapore?” or “Trip to Japan from December 3 to 10”.",
    send: "Send",
    speak: "Speak",
    aboutText: `A simulated Alexa+ host built for a hackathon entry. It is not affiliated with Amazon and does not integrate with Alexa+. The server is a self-hosted MCP server; this page is a real MCP client (${PROTOCOL_VERSION}).`,
    demo: "Example group",
    reset: "New session",
    nothingSaved: "Nothing to save yet.",
    cancel: "Cancel",
    submit: "Submit",
  },
  es: {
    connecting: "conectando…",
    connected: () => "conectado",
    listening: "Escuchando…",
    noSpeech: "La entrada por voz no está disponible en este navegador. Escribe en su lugar.",
    lang: "es-MX",
    brain: "Asistente: enrutador local, sin AWS.",
    brainBedrock: "Asistente: agente Bedrock en el servidor.",
    tagline: "Concierge de viajes · host simulado de Alexa+",
    chatTitle: "Conversación",
    lblVoice: "Leer en voz alta",
    inputPlaceholder: "Escribe o habla",
    emptyChat: "Pregunta lo que necesites de tu viaje: requisitos de entrada, qué empacar, qué visitar, cuentas del grupo.",
    welcomeIntro: "Puedo ayudarte con",
    welcomeTags: ["Requisitos de entrada", "Reglas locales", "Presupuesto", "Equipaje", "Plan de días", "Cuentas del grupo"],
    protocol: "Para desarrolladores: registro MCP",
    thinking: "Waypoint está revisando…",
    menu: "Ajustes",
    ariaLang: "Idioma", ariaDevice: "Dispositivo", optMobile: "Móvil", optVoice: "Solo voz",
    moreCue: "Respuesta completa en el chat",
    hello: "Hola, soy Waypoint, tu concierge de viajes. Dime a dónde vas y cuándo.",
    welcomeBack: (name) => `Hola de nuevo${name ? ", " + name : ""}.`,
    chips: [
      "Mi pasaporte es mexicano",
      "Voy a Japón del 3 al 10 de diciembre",
      "¿Qué me falta para mi viaje?",
      "¿Puedo llevar vapes a Singapur?",
      "¿Cuánto son 1000 dólares en yenes?",
    ],
    chipsTrip: [
      "Prepárame para el viaje",
      "¿Qué me falta para mi viaje?",
      "Arma mis días: comida y templos",
      "¿Qué empaco?",
      "¿Qué clima hará?",
      "¿Qué no puedo llevar?",
      "¿Cuánto rinden 20 mil pesos allá?",
    ],
    tools: {
      get_traveler_profile: "Perfil", update_traveler_profile: "Perfil guardado", plan_trip: "Plan del viaje",
      check_entry_requirements: "Requisitos de entrada", get_local_rules: "Reglas locales", get_destination_essentials: "Básicos",
      convert_budget: "Presupuesto", packing_checklist: "Maleta", build_itinerary: "Itinerario", trip_brief: "Resumen del viaje",
      log_expense: "Gasto", forget_me: "Olvidar datos", get_highlights: "Lugares", set_trip_constraints: "Reglas del viaje",
      add_booking: "Reserva", confirm_booking: "Confirmada", settle_up: "Cuentas", plan_fairness: "Equidad", export_trip: "Exportar",
      get_trip_climate: "Clima",
      get_payment_methods: "Pagos",
    },
    demoDone: "Grupo de ejemplo guardado: Ana (México), Sam (Estados Unidos), Priya (India).",
    notUnderstood: "No entendí. Prueba: “¿Puedo llevar vapes a Singapur?” o “Viajo a Japón del 3 al 10 de diciembre”.",
    send: "Enviar",
    speak: "Hablar",
    aboutText: `Un host simulado de Alexa+ creado para una entrada de hackathon. No está afiliado a Amazon ni se integra con Alexa+. El servidor es un servidor MCP propio; esta página es un cliente MCP real (${PROTOCOL_VERSION}).`,
    demo: "Grupo de ejemplo",
    reset: "Nueva sesión",
    nothingSaved: "Nada que guardar todavía.",
    cancel: "Cancelar",
    submit: "Enviar",
  },
};

let lang = (() => {
  try {
    const saved = localStorage.getItem("waypoint-lang");
    if (saved) return saved;
  } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
})();
let history = [];
let device = "show";
let client = null;
let mcpUser = (() => {
  try {
    return localStorage.getItem("waypoint-user");
  } catch {
    return null;
  }
})() || `viewer-${crypto.randomUUID ? crypto.randomUUID().slice(0, 18) : Math.random().toString(36).slice(2, 14)}`;
try { localStorage.setItem("waypoint-user", mcpUser); } catch {}
let brainUnavailable = false;
let toolCount = null;
let unmountApp = null;
let lastStructured = null;
let currentBrief = null;
let lastUi = null;
let speechAudio = null;
let panelFrame = null;
let panelStructured = null;
// One request at a time: the text box, the chips and the mic all send through handleUtterance.
let busy = false;

const t = (k) => UI[lang][k];

function applyLang() {
  document.documentElement.lang = lang;
  for (const b of document.querySelectorAll(".seg button[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  $("tagline").textContent = t("tagline");
  $("chatTitle").textContent = t("chatTitle");
  $("send").setAttribute("aria-label", t("send"));
  $("send").title = t("send");
  $("mic").setAttribute("aria-label", t("speak"));
  $("lblVoiceOut").textContent = t("lblVoice");
  $("demoGroup").textContent = t("demo");
  $("reset").textContent = t("reset");
  $("lblProtocol").textContent = t("protocol");
  $("moreCue").textContent = t("moreCue");
  $("menuBtn").textContent = t("menu");
  document.querySelector(".seg").setAttribute("aria-label", t("ariaLang"));
  $("device").setAttribute("aria-label", t("ariaDevice"));
  $("device").options[1].text = t("optMobile");
  $("device").options[2].text = t("optVoice");
  $("aboutText").textContent = t("aboutText");
  $("text").placeholder = t("inputPlaceholder");
  $("brainMode").textContent = brainUnavailable ? t("brain") : t("brainBedrock");
  $("welcomeIntro").textContent = t("welcomeIntro");
  $("welcomeTags").innerHTML = t("welcomeTags").map((x) => `<li>${esc(x)}</li>`).join("");
  if (!$("transcript").children.length) renderEmptyChat();
  // Text that the browser set in the other language: the clock, the connection line and the greeting.
  tickClock();
  if (toolCount !== null) $("connState").textContent = t("connected")(toolCount);
  if (!$("stage").classList.contains("active")) $("headline").textContent = t("hello");
  renderChips();
}

function renderEmptyChat() {
  $("transcript").innerHTML = `<p class="empty-chat">${esc(t("emptyChat"))}</p>`;
}

// The language follows the traveler. A switch re-draws the trip hero (the words on it are localized).
async function setLang(next, { refresh = true } = {}) {
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem("waypoint-lang", lang); } catch {}
  applyLang();
  if (refresh && client && currentBrief) await refreshHero().catch(() => {});
}

function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  for (const text of t(currentBrief ? "chipsTrip" : "chips")) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = text;
    b.onclick = () => handleUtterance(text);
    box.appendChild(b);
  }
}

function tickClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleString(t("lang"), { weekday: "long", hour: "2-digit", minute: "2-digit" });
  // The home screen's large clock: the time in large figures, the day period small beside it.
  const parts = new Intl.DateTimeFormat(t("lang"), { hour: "numeric", minute: "2-digit" }).formatToParts(now);
  const time = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
  const period = parts.find((p) => p.type === "dayPeriod")?.value || "";
  const big = $("homeTime");
  big.textContent = time;
  if (period) {
    const s = document.createElement("span");
    s.className = "ampm";
    s.textContent = period;
    big.appendChild(s);
  }
  $("homeDate").textContent = now.toLocaleDateString(t("lang"), { weekday: "long", day: "numeric", month: "long" });
}

function setLight(state) {
  $("lightbar").dataset.state = state;
}

function setThinking(on) {
  setLight(on ? "thinking" : "idle");
  $("thinking").hidden = !on;
  $("thinkingText").textContent = t("thinking");
  // The visible dots are hidden from assistive tech; this persistent live region announces the state.
  $("announce").textContent = on ? t("thinking") : "";
  $("send").disabled = on;
}

function appendLog(dir, msg) {
  const time = new Date().toISOString().slice(11, 23);
  const summary = msg.method ? msg.method : msg.error ? `error ${msg.error.code}` : "result";
  const body = JSON.stringify(msg).slice(0, 600);
  const line = `${time} ${dir} ${summary}${msg.id !== undefined ? ` #${msg.id}` : ""}\n    ${body}\n`;
  const log = $("log");
  // Keep the protocol log short: a long session must not grow it without limit.
  if (log.textContent.length > 60_000) log.textContent = log.textContent.slice(-40_000);
  log.textContent += line;
  log.scrollTop = log.scrollHeight;
}

function bubble(role, text) {
  const box = $("transcript");
  box.querySelector(".empty-chat")?.remove();
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// A voice for the reply's language, picked explicitly: a fallback voice can read the words with the wrong accent.
function pickVoice(lang) {
  const want = lang.toLowerCase();
  const voices = speechSynthesis.getVoices();
  const same = voices.filter((v) => v.lang.toLowerCase().replace("_", "-") === want);
  const family = voices.filter((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2)));
  return same.find((v) => v.localService) || same[0] || family.find((v) => v.localService) || family[0] || null;
}

// Stops whatever is being said, the neural voice or the browser's.
function stopSpeech() {
  if (speechAudio) { speechAudio.pause(); speechAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// The reply in a neural voice (Amazon Polly, through the server). Throws when the server cannot speak.
async function speakNeural(spoken, lang) {
  const res = await fetch("/api/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: spoken, lang }) });
  if (!res.ok) throw new Error(`speech ${res.status}`);
  const { audio, type } = await res.json();
  const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: type || "audio/mpeg" }));
  const a = new Audio(url);
  speechAudio = a;
  const done = () => { setLight("idle"); URL.revokeObjectURL(url); if (speechAudio === a) speechAudio = null; };
  a.onplay = () => setLight("speaking");
  a.onended = done;
  a.onerror = done;
  await a.play();
}

async function speak(text) {
  if (!$("voiceOut").checked) return;
  stopSpeech();
  const lang = t("lang");
  const spoken = speakable(text, lang);
  try {
    await speakNeural(spoken, lang);
    return;
  } catch {
    // No neural voice (the server cannot synthesize, or autoplay is blocked): the browser's voice says it.
  }
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = lang;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.onstart = () => setLight("speaking");
  u.onend = () => setLight("idle");
  speechSynthesis.speak(u);
}

async function connect() {
  $("connState").textContent = t("connecting");
  const health = await fetch("/healthz").then((r) => r.json()).catch(() => ({}));
  brainUnavailable = !health.brain;
  client = new McpClient({ url: "/mcp", user: mcpUser, locale: () => t("lang"), onLog: appendLog, onElicit: showElicitation });
  await client.initialize();
  const { tools } = await client.listTools();
  toolCount = tools.length;
  $("connState").textContent = t("connected")(toolCount);
  $("brainMode").textContent = brainUnavailable ? t("brain") : t("brainBedrock");
  await greet();
}

// Memory across sessions: a returning viewer is greeted with their saved trip.
async function greet() {
  $("headline").textContent = t("hello");
  const profile = await client.callTool("get_traveler_profile", {}).catch(() => null);
  const travelers = profile?.structuredContent?.data?.profile?.travelers || [];
  if (!profile || profile.isError || !travelers.length) {
    // Nothing saved: a trip shown before (in another language or session) must not stay.
    currentBrief = null;
    $("hero").innerHTML = "";
    return;
  }
  const me = travelers.find((x) => x.role === "self") || travelers[0];
  const name = me?.displayName && !/^(me|yo|self)$/i.test(me.displayName) ? me.displayName : "";
  const sc = await refreshHero();
  // The disclaimer belongs on the cards, not in the greeting.
  const voice = sc ? String(sc.voice).replace(/\s*(Rules change|Las reglas cambian)[^.]*\.\s*$/i, "") : "";
  $("headline").textContent = `${t("welcomeBack")(name)} ${voice}`.trim();
  if (sc && device !== "voice") $("cards").innerHTML = renderTool("trip_brief", sc, lang);
  renderChips();
}

// The trip hero (destination, countdown, readiness) is read straight from the server.
async function refreshHero() {
  const brief = await client.callTool("trip_brief", {}).catch(() => null);
  const sc = brief && !brief.isError && brief.structuredContent?.data?.readiness !== undefined ? brief.structuredContent : null;
  currentBrief = sc ? sc.data : null;
  // A Panel button or an open panel from another trip would open that trip: drop them.
  if (lastUi && lastUi.structured?.data?.trip?.tripId !== currentBrief?.tripId) {
    lastUi = null;
    if (panelFrame) closePanel();
  }
  $("hero").innerHTML = currentBrief && device !== "voice" ? heroHtml(currentBrief, lang, Boolean(lastUi)) : "";
  syncPanel();
  return sc;
}

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  $("announceToast").textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Real-world actions on the hero: the full calendar file (from the server, one event per
// planned day), group money, and a shareable brief.
async function heroAction(action) {
  if (!currentBrief) return;
  const w = words(lang);
  if (action === "panel" && lastUi) {
    await mountApp(lastUi.uri, lastUi.structured);
    return;
  }
  if (action === "autopilot") {
    await handleUtterance(lang === "es" ? "Prepárame para el viaje" : "Get me ready for the trip");
    return;
  }
  if (action === "settle") {
    // The money card replaces the mission card: not while a run is writing into it.
    if (busy) return;
    const r = await client.callTool("settle_up", {});
    if (!r.isError) {
      bubble("assistant", r.structuredContent.voice);
      $("cards").innerHTML = renderTool("settle_up", r.structuredContent, lang);
    } else {
      bubble("assistant", r.content?.[0]?.text || "");
    }
    return;
  }
  if (action === "ics") {
    const r = await client.callTool("export_trip", { format: "ics" }).catch(() => null);
    const content = r && !r.isError ? r.structuredContent?.data?.content : null;
    const body = content || tripIcs(currentBrief, lang);
    const blob = new Blob([body], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `waypoint-${currentBrief.destination.toLowerCase()}-${currentBrief.startDate}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(lang === "es" ? "Calendario descargado" : "Calendar downloaded");
    return;
  }
  if (action === "share") {
    const text = `${currentBrief.destinationName}: ${currentBrief.startDate} → ${currentBrief.endDate}. ${w.daysLeft(currentBrief.daysUntil)}. ${currentBrief.readiness}% ${w.ready}.${(currentBrief.pending || []).length ? " " + currentBrief.pending.join("; ") + "." : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "Waypoint", text });
      else {
        await navigator.clipboard.writeText(text);
        toast(w.copied);
      }
    } catch (err) {
      // Cancelling the share sheet is not a failure.
      if (err?.name !== "AbortError") toast(lang === "es" ? "No pude compartir ni copiar." : "Could not share or copy.");
    }
  }
}

// Tapping an item on the packing card ticks it off on the server (state across sessions).
async function togglePacked(id, on) {
  const result = await client.callTool("packing_checklist", on ? { markPacked: [id] } : { unmarkPacked: [id] });
  if (result.isError) {
    bubble("assistant", result.content?.[0]?.text || "");
    return;
  }
  const card = document.querySelector("#cards .k-packing");
  if (card) {
    card.outerHTML = renderTool("packing_checklist", result.structuredContent, lang);
    // The ticked item gets a short confirmation; the others stay still.
    const tick = document.querySelector(`#cards [data-pack-id="${CSS.escape(id)}"]`);
    tick?.classList.add("just");
    tick?.focus({ preventScroll: true });
  }
  await refreshHero();
}

// tool is the MCP tool that produced the result, so its own card renderer is used (local router).
async function renderResult(result, tool) {
  const sc = result.structuredContent;
  if (result.isError) {
    bubble("assistant", result.content?.[0]?.text || "");
    speak(result.content?.[0]?.text || "");
    return;
  }
  lastStructured = sc;
  $("headline").textContent = sc.voice;
  $("trace").innerHTML = "";
  bubble("assistant", sc.voice);
  speak(sc.voice);
  if (device !== "voice") {
    $("cards").innerHTML = renderTool(tool, sc, lang);
  }
  // The trip hero is read from the server after every action, so a change (a booking, a deleted trip) shows at once.
  await refreshHero();
  renderChips();
  const uri = result._meta?.ui?.resourceUri;
  if (uri && device !== "voice") {
    // The panel opens from the hero's button; it does not cover the trip on arrival.
    lastUi = { uri, structured: sc };
    $("hero").innerHTML = currentBrief ? heroHtml(currentBrief, lang, true) : "";
  }
}

// MCP Apps host: load the ui:// resource into a sandboxed iframe and speak the Apps protocol.
// The panel's numbers come from the same trip_brief read as the hero, and its language is the host's now.
function panelData(structured) {
  if (!structured) return structured;
  const data = { ...structured.data, locale: lang };
  const tripId = structured.data?.trip?.tripId;
  if (tripId !== undefined && tripId === currentBrief?.tripId) {
    data.readiness = currentBrief.readiness;
    data.daysUntil = currentBrief.daysUntil;
  }
  return { ...structured, data };
}

// Re-send the open panel's data, so it follows the hero when the readiness or the day count changes.
function syncPanel() {
  if (!panelFrame || !panelStructured) return;
  panelFrame.contentWindow?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: panelData(panelStructured) } }, "*");
}

function closePanel({ restoreFocus = false } = {}) {
  unmountApp?.();
  $("apps").classList.remove("open");
  $("apps").innerHTML = "";
  if (restoreFocus) document.querySelector('#hero .act[data-action="panel"]')?.focus();
}

async function mountApp(uri, structured) {
  unmountApp?.();
  const read = await client.readResource(uri);
  // The trip or the session changed while the panel was loading: do not open the old one.
  if (lastUi?.uri !== uri) return;
  const html = read.contents?.[0]?.text || "";
  const holder = $("apps");
  holder.innerHTML = "";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = lang === "es" ? "Cerrar panel" : "Close panel";
  close.onclick = () => closePanel({ restoreFocus: true });
  holder.appendChild(close);
  holder.classList.add("open");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "Waypoint readiness dashboard");
  frame.srcdoc = html;
  panelFrame = frame;
  panelStructured = structured;
  close.focus();
  holder.appendChild(frame);
  const onMessage = (ev) => {
    if (ev.source !== frame.contentWindow) return;
    const msg = ev.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.method === "ui/initialize") {
      frame.contentWindow.postMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2026-01-26",
          hostInfo: { name: "waypoint-simulator", version: "0.1.0" },
          hostCapabilities: {},
          hostContext: hostContext(),
        },
      }, "*");
    }
    if (msg.method === "ui/notifications/initialized") {
      frame.contentWindow.postMessage({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { structuredContent: panelData(structured) },
      }, "*");
    }
  };
  window.addEventListener("message", onMessage);
  unmountApp = () => {
    window.removeEventListener("message", onMessage);
    panelFrame = null;
    panelStructured = null;
  };
}

function hostContext() {
  const show = device === "show";
  return {
    deviceClass: show ? "echo-show" : device === "mobile" ? "phone" : "voice-only",
    maxWidth: show ? 1024 : 390,
    maxHeight: show ? 600 : 620,
    isMobile: device === "mobile",
    platform: "web-simulator",
    displayMode: "fullscreen",
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    deviceCapabilities: { touch: device !== "show" },
    theme: "dark",
    locale: t("lang"),
  };
}

// Elicitation: render the server's requestedSchema as a form and return the user's answer.
function showElicitation(params) {
  const form = $("form");
  const props = params?.requestedSchema?.properties || {};
  const required = new Set(params?.requestedSchema?.required || []);
  form.hidden = false;
  form.innerHTML = `<strong>${esc(params?.message || "")}</strong>`;
  const fields = {};
  for (const [key, spec] of Object.entries(props)) {
    const label = document.createElement("label");
    label.textContent = spec.title || key;
    let input;
    if (spec.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
    } else if (Array.isArray(spec.enum)) {
      input = document.createElement("select");
      for (const v of spec.enum) input.add(new Option(v, v));
    } else {
      input = document.createElement("input");
      input.type = "text";
      if (spec.description) input.placeholder = spec.description;
    }
    input.name = key;
    input.required = required.has(key);
    label.appendChild(input);
    form.appendChild(label);
    fields[key] = { input, spec };
  }
  const actions = document.createElement("div");
  actions.className = "actions";
  form.appendChild(actions);
  return new Promise((resolve) => {
    const done = (answer) => {
      form.hidden = true;
      form.innerHTML = "";
      resolve(answer);
    };
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = t("submit");
    ok.onclick = () => {
      const content = {};
      for (const [key, { input, spec }] of Object.entries(fields)) {
        if (spec.type === "boolean") content[key] = input.checked;
        else if (input.value !== "") content[key] = input.value;
      }
      done({ action: "accept", content });
    };
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancel");
    cancel.onclick = () => done({ action: "decline" });
    actions.append(ok, cancel);
  });
}

async function callBrainServer(utterance) {
  if (brainUnavailable) return null;
  appendLog("→", { method: "POST /api/brain (Strands agent → MCP tools/call)", params: { utterance } });
  const res = await fetch("/api/brain", {
    method: "POST",
    headers: { "content-type": "application/json", "x-waypoint-user": mcpUser, "x-waypoint-locale": t("lang") },
    body: JSON.stringify({ utterance, history: history.slice(-8) }),
  });
  if (res.status === 503) {
    brainUnavailable = true;
    return null;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    appendLog("!", { error: { code: res.status, message: `brain ${body.error || "failed"} ${body.kind || ""}`.trim() } });
    return null;
  }
  return res.json();
}

const TRACE_SKIP = new Set(["get_traveler_profile"]);

async function renderBrainReply(reply) {
  bubble("assistant", reply.text);
  speak(reply.text);
  $("headline").textContent = reply.text;
  for (const c of reply.calls) {
    appendLog("⇄", { method: `tools/call ${c.tool} (server-side agent)`, params: c.args, result: { isError: c.isError } });
  }
  const trace = $("trace");
  trace.innerHTML = reply.calls
    .filter((c) => !TRACE_SKIP.has(c.tool))
    .map((c) => `<span class="step ${c.isError ? "err" : ""}">${esc(t("tools")[c.tool] || c.tool)}</span>`)
    .join("");
  if (device === "voice") {
    // Voice-only still reads the trip from the server, so the hero is right when the device changes back.
    await refreshHero();
    return;
  }
  // One card per tool (the latest), in the order the agent called them.
  const latest = new Map();
  for (const c of reply.calls) if (!c.isError && c.structured?.card && !TRACE_SKIP.has(c.tool)) latest.set(c.tool, c);
  // What was just asked comes first; the profile card only when there is nothing else to show.
  const rank = { settle_up: 0, plan_fairness: 1, add_booking: 2, confirm_booking: 2, export_trip: 3, trip_brief: 4, packing_checklist: 5, build_itinerary: 6, get_highlights: 7, convert_budget: 8, check_entry_requirements: 9, get_local_rules: 10, update_traveler_profile: 12 };
  let shown = [...latest.values()].sort((a, b) => (rank[a.tool] ?? 11) - (rank[b.tool] ?? 11));
  if (shown.some((c) => c.tool !== "update_traveler_profile")) shown = shown.filter((c) => c.tool !== "update_traveler_profile");
  const cards = shown.filter((c) => c.tool !== "plan_trip").map((c) => renderTool(c.tool, c.structured, lang)).join("");
  // A reply with no card clears the previous turn's cards: they would sit beside the new answer.
  $("cards").innerHTML = cards;
  await refreshHero();
  renderChips();
  const withUi = [...reply.calls].reverse().find((c) => !c.isError && c.uiResourceUri);
  if (withUi) {
    lastUi = { uri: withUi.uiResourceUri, structured: withUi.structured };
    $("hero").innerHTML = currentBrief && device !== "voice" ? heroHtml(currentBrief, lang, true) : "";
  }
}

// Autopilot: the whole preparation as a visible run of MCP tool calls, chained by the host. It is
// deterministic on purpose, so every step, its time and its source can be shown as it happens.
async function runAutopilot() {
  if (!currentBrief) await refreshHero().catch(() => {});
  if (!currentBrief) {
    setThinking(false);
    const line = noTripLine(lang);
    bubble("assistant", line);
    speak(line);
    return;
  }
  // The send button stays off until the run ends (handleUtterance clears the thinking state).
  $("trace").innerHTML = "";
  $("headline").textContent = lang === "es" ? `Preparando ${currentBrief.destinationName}…` : `Getting ${currentBrief.destinationName} ready…`;
  $("cards").innerHTML = missionHtml(lang, currentBrief.destinationName);
  const root = $("cards").querySelector(".k-mission");
  // The run is the thing to watch: bring it into view (the headline above it stays in sight).
  root.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const res = await runMission({ client, lang, brief: currentBrief, root });
  setLight("idle");
  $("headline").textContent = res.voice;
  bubble("assistant", res.voice);
  speak(res.voice);
  history.push({ role: "assistant", text: res.voice });
  // The hero reads the trip again: the readiness ring rises with the new plan.
  await refreshHero();
  renderChips();
}

async function handleUtterance(text) {
  if (!text.trim() || busy) return;
  busy = true;
  // The host answers in the language the traveler wrote in; the hero is redrawn after the reply.
  const written = detectLang(text);
  if (written) await setLang(written, { refresh: false });
  bubble("user", text);
  $("stage").classList.add("active");
  setThinking(true);
  try {
    if (isAutopilot(text)) {
      history.push({ role: "user", text });
      await runAutopilot();
      return;
    }
    const remote = await callBrainServer(text).catch(() => null);
    setThinking(false);
    if (remote) {
      history.push({ role: "user", text }, { role: "assistant", text: remote.text });
      $("brainMode").textContent = t("brainBedrock");
      await renderBrainReply(remote);
      return;
    }
    // The brain did not answer: the label must not keep claiming it did.
    $("brainMode").textContent = t("brain");
    const intent = routeUtterance(text, { destination: currentBrief?.destination });
    if (!intent) {
      bubble("assistant", t("notUnderstood"));
      speak(t("notUnderstood"));
      return;
    }
    const args = Object.fromEntries(Object.entries(intent.args).filter(([, v]) => v !== undefined));
    const result = await client.callTool(intent.tool, args);
    await renderResult(result, intent.tool);
  } catch (err) {
    const msg = lang === "es" ? "Algo salió mal de mi lado. Intenta otra vez." : "Something went wrong on my side. Try again.";
    bubble("assistant", msg);
    appendLog("!", { error: { code: 0, message: String(err && err.message) } });
  } finally {
    setThinking(false);
    busy = false;
  }
}

async function loadDemoGroup() {
  const travelers = [
    { displayName: "Ana", passports: ["MX"], ageBand: "adult", role: "self" },
    { displayName: "Sam", passports: ["US"], ageBand: "adult", role: "friend" },
    { displayName: "Priya", passports: ["IN"], ageBand: "adult", role: "friend" },
  ];
  const result = await client.callTool("update_traveler_profile", {
    homeCurrency: "MXN",
    locale: lang === "es" ? "es-MX" : "en-US",
    interests: ["food", "museums", "nature"],
    pace: "balanced",
    travelers,
  });
  bubble("assistant", result.isError ? t("nothingSaved") : t("demoDone"));
  if (!result.isError) await renderResult(result, "update_traveler_profile");
}

// Startup and New session both connect; a failure is shown in the status line, not left as "connecting".
function connectReporting() {
  return connect().catch((err) => {
    $("connState").textContent = "offline";
    appendLog("!", { error: { code: 0, message: String(err && err.message) } });
  });
}

function bindUi() {
  // The trip hero's globe: mounted whenever the hero is drawn; it flies in only on a trip's first view.
  let globeTrip = null;
  new MutationObserver(() => {
    const canvas = $("hero").querySelector("canvas.globe");
    if (!canvas || !currentBrief?.geo) return;
    const intro = globeTrip !== currentBrief.tripId;
    globeTrip = currentBrief.tripId;
    mountGlobe(canvas, currentBrief.geo, { intro });
  }).observe($("hero"), { childList: true });
  // Small screens keep the settings behind one button, so the header is a single row.
  const closeMenu = () => {
    $("controlsBox").classList.remove("open");
    $("menuBtn").setAttribute("aria-expanded", "false");
  };
  $("menuBtn").addEventListener("click", () => {
    const open = $("controlsBox").classList.toggle("open");
    $("menuBtn").setAttribute("aria-expanded", String(open));
  });
  $("controlsBox").addEventListener("click", (e) => { if (e.target.closest("button")) closeMenu(); });
  $("device").addEventListener("change", closeMenu);
  // A long spoken reply is clamped on the device: say that the full reply is in the chat.
  const headline = $("headline");
  const markClamp = () => {
    const clamped = getComputedStyle(headline).webkitLineClamp !== "none" && headline.scrollHeight > headline.clientHeight + 1;
    $("moreCue").hidden = !clamped;
  };
  new MutationObserver(markClamp).observe(headline, { childList: true, characterData: true, subtree: true });
  window.addEventListener("resize", markClamp);
  for (const b of document.querySelectorAll(".seg button[data-lang]")) {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  }
  $("device").addEventListener("change", (e) => {
    device = e.target.value;
    $("frame").dataset.device = device;
    // The voice screen has no room for the panel, and voice never opens one.
    if (device === "voice" && panelFrame) closePanel();
    $("hero").innerHTML = currentBrief && device !== "voice" ? heroHtml(currentBrief, lang, Boolean(lastUi)) : "";
  });
  $("inputForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("text").value;
    $("text").value = "";
    handleUtterance(v);
  });
  $("demoGroup").addEventListener("click", () => loadDemoGroup().catch(() => bubble("assistant", t("nothingSaved"))));
  $("reset").addEventListener("click", async () => {
    // Same viewer, new MCP session: remembered trips must still be there.
    await client?.close();
    history = [];
    $("stage").classList.remove("active");
    // The MCP App's message listener belongs to the old session: remove it with the panel.
    unmountApp?.();
    lastUi = null;
    $("cards").innerHTML = "";
    $("hero").innerHTML = "";
    $("apps").innerHTML = "";
    $("trace").innerHTML = "";
    $("headline").textContent = "";
    $("transcript").innerHTML = "";
    renderEmptyChat();
    renderChips();
    await connectReporting();
  });
  $("cards").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pack-id]");
    if (btn) togglePacked(btn.dataset.packId, btn.getAttribute("aria-pressed") !== "true").catch(() => {});
  });
  $("hero").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) heroAction(btn.dataset.action).catch(() => bubble("assistant", lang === "es" ? "No pude completar esa acción. Intenta otra vez." : "I could not finish that. Try again."));
  });
  setupVoice();
}

function setupVoice() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("mic");
  if (!Rec) {
    mic.disabled = true;
    mic.title = t("noSpeech");
    return;
  }
  const rec = new Rec();
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = (e) => handleUtterance(e.results[0][0].transcript);
  rec.onend = () => {
    mic.classList.remove("listening");
    if ($("lightbar").dataset.state === "listening") setLight("idle");
  };
  mic.addEventListener("click", () => {
    rec.lang = t("lang");
    mic.classList.add("listening");
    setLight("listening");
    $("connState").textContent = t("listening");
    rec.start();
  });
}

applyLang();
tickClock();
setInterval(tickClock, 30000);
bindUi();
connectReporting();
