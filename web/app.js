// Simulated Alexa+ host: Echo Show-style frame, voice in/out, text fallback, ES/EN,
// elicitation forms, an MCP Apps iframe host, and a protocol log. It talks to the
// Waypoint MCP server through a real MCP client (mcp-client.js).
import { McpClient, PROTOCOL_VERSION } from "./mcp-client.js";
import { routeUtterance } from "./router.js";

const $ = (id) => document.getElementById(id);

const UI = {
  en: {
    connecting: "connecting…",
    connected: (n, s) => `connected · MCP ${PROTOCOL_VERSION} · ${n} tools · session ${s}`,
    listening: "Listening…",
    noSpeech: "Voice input is not available in this browser. Type instead.",
    lang: "en-US",
    brain: "Brain: local router (no AWS needed). Bedrock brain: set WAYPOINT_BRAIN=bedrock on the server.",
    brainBedrock: "Brain: Bedrock via Strands (server-side)",
    thinking: "Waypoint is checking…",
    hello: "Hi, I'm Waypoint, your travel concierge. Tell me where you're going and when.",
    welcomeBack: (name) => `Welcome back${name ? ", " + name : ""}.`,
    chips: [
      "My passport is Mexican",
      "I'm going to Japan from December 3 to 10",
      "What's left for my trip?",
      "Can I bring vapes to Singapore?",
      "How much is 1000 dollars in yen?",
    ],
    tools: {
      get_traveler_profile: "Profile", update_traveler_profile: "Saved profile", plan_trip: "Trip plan",
      check_entry_requirements: "Entry rules", get_local_rules: "Local rules", get_destination_essentials: "Essentials",
      convert_budget: "Budget", packing_checklist: "Packing", build_itinerary: "Itinerary", trip_brief: "Trip brief",
      log_expense: "Expense", forget_me: "Forget me",
    },
    demoDone: "Demo group saved: Ana (Mexico), Sam (United States), Priya (India).",
    notUnderstood: "I didn't catch that. Try: “Can I bring vapes to Singapore?” or “Trip to Japan from December 3 to 10”.",
    send: "Send",
    speak: "Speak",
    aboutText: "A simulated Alexa+ host built for a hackathon entry. It is not affiliated with Amazon and does not integrate with Alexa+. The server is a self-hosted MCP server; this page is a real MCP client.",
    protocol: "Protocol log",
    about: "About this host",
    demo: "Demo group",
    reset: "New session",
    nothingSaved: "Nothing to save yet.",
    cancel: "Cancel",
    submit: "Submit",
  },
  es: {
    connecting: "conectando…",
    connected: (n, s) => `conectado · MCP ${PROTOCOL_VERSION} · ${n} herramientas · sesión ${s}`,
    listening: "Escuchando…",
    noSpeech: "La entrada por voz no está disponible en este navegador. Escribe en su lugar.",
    lang: "es-MX",
    brain: "Cerebro: enrutador local (no requiere AWS). Cerebro Bedrock: configura WAYPOINT_BRAIN=bedrock en el servidor.",
    brainBedrock: "Cerebro: Bedrock vía Strands (en el servidor)",
    thinking: "Waypoint está revisando…",
    hello: "Hola, soy Waypoint, tu concierge de viajes. Dime a dónde vas y cuándo.",
    welcomeBack: (name) => `Hola de nuevo${name ? ", " + name : ""}.`,
    chips: [
      "Mi pasaporte es mexicano",
      "Voy a Japón del 3 al 10 de diciembre",
      "¿Qué me falta para mi viaje?",
      "¿Puedo llevar vapes a Singapur?",
      "¿Cuánto son 1000 dólares en yenes?",
    ],
    tools: {
      get_traveler_profile: "Perfil", update_traveler_profile: "Perfil guardado", plan_trip: "Plan del viaje",
      check_entry_requirements: "Requisitos de entrada", get_local_rules: "Reglas locales", get_destination_essentials: "Básicos",
      convert_budget: "Presupuesto", packing_checklist: "Maleta", build_itinerary: "Itinerario", trip_brief: "Resumen del viaje",
      log_expense: "Gasto", forget_me: "Olvidar datos",
    },
    demoDone: "Grupo de ejemplo guardado: Ana (México), Sam (Estados Unidos), Priya (India).",
    notUnderstood: "No entendí. Prueba: “¿Puedo llevar vapes a Singapur?” o “Viajo a Japón del 3 al 10 de diciembre”.",
    send: "Enviar",
    speak: "Hablar",
    aboutText: "Un host simulado de Alexa+ creado para una entrada de hackathon. No está afiliado a Amazon ni se integra con Alexa+. El servidor es un servidor MCP propio; esta página es un cliente MCP real.",
    protocol: "Registro del protocolo",
    about: "Acerca de este host",
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
let unmountApp = null;
let lastStructured = null;

const t = (k) => UI[lang][k];

function applyLang() {
  document.documentElement.lang = lang;
  $("lang").value = lang;
  $("send").textContent = t("send");
  $("mic").setAttribute("aria-label", t("speak"));
  $("lblVoiceOut").textContent = lang === "es" ? "Leer en voz alta" : "Speak";
  $("demoGroup").textContent = t("demo");
  $("reset").textContent = t("reset");
  $("lblProtocol").textContent = t("protocol");
  $("lblAbout").textContent = t("about");
  $("aboutText").textContent = t("aboutText");
  $("text").placeholder = lang === "es" ? "Escribe o habla" : "Type or speak";
  $("brainMode").textContent = brainUnavailable ? t("brain") : t("brainBedrock");
  renderChips();
}

function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  for (const text of t("chips")) {
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
}

function setThinking(on) {
  $("thinking").hidden = !on;
  $("thinkingText").textContent = t("thinking");
  $("send").disabled = on;
}

function appendLog(dir, msg) {
  const time = new Date().toISOString().slice(11, 23);
  const summary = msg.method ? msg.method : msg.error ? `error ${msg.error.code}` : "result";
  const body = JSON.stringify(msg).slice(0, 600);
  const line = `${time} ${dir} ${summary}${msg.id !== undefined ? ` #${msg.id}` : ""}\n    ${body}\n`;
  const log = $("log");
  log.textContent += line;
  log.scrollTop = log.scrollHeight;
}

function bubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  $("transcript").appendChild(div);
  $("transcript").scrollTop = $("transcript").scrollHeight;
}

function speak(text) {
  if (!$("voiceOut").checked || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = t("lang");
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function connect() {
  $("connState").textContent = t("connecting");
  const health = await fetch("/healthz").then((r) => r.json()).catch(() => ({}));
  brainUnavailable = !health.brain;
  client = new McpClient({ url: "/mcp", user: mcpUser, locale: () => t("lang"), onLog: appendLog, onElicit: showElicitation });
  await client.initialize();
  const { tools } = await client.listTools();
  $("connState").textContent = t("connected")(tools.length, (client.sessionId || "—").slice(0, 8));
  $("brainMode").textContent = brainUnavailable ? t("brain") : t("brainBedrock");
  await greet();
}

// Memory across sessions: a returning viewer is greeted with their saved trip.
async function greet() {
  $("headline").textContent = t("hello");
  const profile = await client.callTool("get_traveler_profile", {}).catch(() => null);
  const travelers = profile?.structuredContent?.data?.travelers || profile?.structuredContent?.data?.profile?.travelers || [];
  if (!profile || profile.isError || !travelers.length) return;
  const me = travelers.find((x) => x.role === "self") || travelers[0];
  const name = me?.displayName && !/^(me|yo|self)$/i.test(me.displayName) ? me.displayName : "";
  const brief = await client.callTool("trip_brief", {}).catch(() => null);
  const sc = brief && !brief.isError ? brief.structuredContent : null;
  const hasTrip = sc && sc.card && (sc.card.rows || []).length;
  // The disclaimer belongs on the cards, not in the greeting.
  const voice = hasTrip ? String(sc.voice).replace(/\s*(Rules change|Las reglas cambian)[^.]*\.\s*$/i, "") : "";
  $("headline").textContent = `${t("welcomeBack")(name)} ${voice}`.trim();
  if (hasTrip && device !== "voice") $("cards").innerHTML = cardHtml(sc.card);
}

function cardHtml(card) {
  if (!card) return "";
  const rows = (card.rows || [])
    .map((r) => `<div class="row ${r.status || ""}"><span class="label"><span class="dot"></span>${esc(r.label)}</span><span class="value">${esc(r.value)}</span></div>`)
    .join("");
  return `<article class="card"><h2>${esc(card.title)}</h2>${card.subtitle ? `<div class="sub">${esc(card.subtitle)}</div>` : ""}${rows}${card.footer ? `<div class="foot">${esc(card.footer)}</div>` : ""}</article>`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function renderResult(result) {
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
    $("cards").innerHTML = cardHtml(sc.card);
  }
  const uri = result._meta?.ui?.resourceUri;
  if (uri && device !== "voice") await mountApp(uri, sc);
}

// MCP Apps host: load the ui:// resource into a sandboxed iframe and speak the Apps protocol.
async function mountApp(uri, structured) {
  unmountApp?.();
  const read = await client.readResource(uri);
  const html = read.contents?.[0]?.text || "";
  const holder = $("apps");
  holder.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "Waypoint readiness dashboard");
  frame.srcdoc = html;
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
        params: { structuredContent: structured },
      }, "*");
    }
  };
  window.addEventListener("message", onMessage);
  unmountApp = () => window.removeEventListener("message", onMessage);
}

function hostContext() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const show = device === "show";
  return {
    deviceClass: show ? "echo-show" : device === "mobile" ? "phone" : "voice-only",
    maxWidth: show ? 1024 : 390,
    maxHeight: show ? 600 : 620,
    isMobile: device === "mobile",
    platform: "web-simulator",
    displayMode: "inline",
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    deviceCapabilities: { touch: device !== "show" },
    theme: dark ? "dark" : "light",
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
  if (device === "voice") return;
  // One card per tool (the latest), in the order the agent called them.
  const latest = new Map();
  for (const c of reply.calls) if (!c.isError && c.structured?.card && !TRACE_SKIP.has(c.tool)) latest.set(c.tool, c);
  const shown = [...latest.values()];
  if (shown.length) $("cards").innerHTML = shown.map((c) => cardHtml(c.structured.card)).join("");
  const withUi = [...reply.calls].reverse().find((c) => !c.isError && c.uiResourceUri);
  if (withUi) await mountApp(withUi.uiResourceUri, withUi.structured);
}

async function handleUtterance(text) {
  if (!text.trim()) return;
  bubble("user", text);
  $("chips").innerHTML = "";
  setThinking(true);
  try {
    const remote = await callBrainServer(text).catch(() => null);
    setThinking(false);
    if (remote) {
      history.push({ role: "user", text }, { role: "assistant", text: remote.text });
      $("brainMode").textContent = t("brainBedrock");
      await renderBrainReply(remote);
      return;
    }
    const intent = routeUtterance(text);
    if (!intent) {
      bubble("assistant", t("notUnderstood"));
      speak(t("notUnderstood"));
      return;
    }
    const args = Object.fromEntries(Object.entries(intent.args).filter(([, v]) => v !== undefined));
    const result = await client.callTool(intent.tool, args);
    await renderResult(result);
  } catch (err) {
    const msg = lang === "es" ? "Algo salió mal de mi lado. Intenta otra vez." : "Something went wrong on my side. Try again.";
    bubble("assistant", msg);
    appendLog("!", { error: { code: 0, message: String(err && err.message) } });
  } finally {
    setThinking(false);
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
  if (!result.isError) await renderResult(result);
}

function bindUi() {
  $("lang").addEventListener("change", (e) => {
    lang = e.target.value;
    localStorage.setItem("waypoint-lang", lang);
    applyLang();
  });
  $("device").addEventListener("change", (e) => {
    device = e.target.value;
    $("frame").dataset.device = device;
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
    $("cards").innerHTML = "";
    $("apps").innerHTML = "";
    $("trace").innerHTML = "";
    renderChips();
    await connect();
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
  rec.onend = () => mic.classList.remove("listening");
  mic.addEventListener("click", () => {
    rec.lang = t("lang");
    mic.classList.add("listening");
    $("connState").textContent = t("listening");
    rec.start();
  });
}

applyLang();
tickClock();
setInterval(tickClock, 30000);
bindUi();
connect().catch((err) => {
  $("connState").textContent = "offline";
  appendLog("!", { error: { code: 0, message: String(err && err.message) } });
});
