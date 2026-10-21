// One color per MCP tool, stable so a call in the protocol log matches the chip on screen.
// Colors stay light enough to read on the dark device card, and far enough apart that
// neighboring tools do not share a hue.

export const TOOL_COLOR = {
  get_traveler_profile: "#e25a5a",
  update_traveler_profile: "#3dffff",
  plan_trip: "#71ff3d",
  check_entry_requirements: "#925cff",
  get_local_rules: "#fff9a3",
  get_destination_essentials: "#ffa3ff",
  convert_budget: "#ff3dcb",
  packing_checklist: "#8eebad",
  get_highlights: "#ffcb3d",
  get_travel_guide: "#3d98ff",
  get_trip_calendar: "#ff99a0",
  set_trip_constraints: "#a3bcff",
  build_itinerary: "#3dff8b",
  get_payment_methods: "#c2ff66",
  get_local_apps: "#85fff7",
  get_transit_payment: "#d768f3",
  get_what_works: "#63cae3",
  get_trip_climate: "#e39f63",
  trip_brief: "#e25a9a",
  log_expense: "#52ffc5",
  add_booking: "#7d92e8",
  confirm_booking: "#ffff66",
  settle_up: "#8ce56c",
  plan_fairness: "#c2ffa3",
  export_trip: "#ffca7a",
  forget_me: "#b1f1d8",
};

const BRAIN = "#ffe14a";
const NEUTRAL = "#d1d1d6";
const ERROR = "#ff6961";

export function toolColor(name) {
  return TOOL_COLOR[name] || NEUTRAL;
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// Ink for text sitting on the tool color: whichever of near-black or white reads more clearly.
export function inkOn(hex) {
  const L = luminance(hex);
  const dark = "#14120a";
  return contrast(L, luminance(dark)) >= contrast(L, 1) ? dark : "#ffffff";
}

const PROTOCOL_CALLS = new Set(["initialize", "tools/list", "resources/read"]);

/**
 * What one protocol-log line is. `pending` remembers which tool an id belongs to,
 * so the server's answer is painted with the same color as the call.
 * @param {string} dir
 * @param {object} msg
 * @param {Map<string, {tool: string|null, key: string}>} pending
 */
export function describeEntry(dir, msg, pending) {
  const method = typeof msg?.method === "string" ? msg.method : "";
  const id = msg?.id === undefined || msg?.id === null ? null : String(msg.id);

  if (method.startsWith("POST /api/brain")) {
    return { kind: "call", key: "brain", name: "POST /api/brain", tool: null };
  }

  if (method === "tools/call") {
    const tool = msg.params?.name || null;
    if (id) pending.set(id, { tool, key: "tool" });
    return { kind: "call", key: "tool", name: tool || "tools/call", tool };
  }

  const agent = method.match(/^tools\/call ([a-z0-9_]+)/);
  if (agent) {
    const tool = agent[1];
    return { kind: msg.result?.isError ? "error" : "call", key: "agent-tool", name: tool, tool };
  }

  if (PROTOCOL_CALLS.has(method) || method === "notifications/initialized" || method === "elicitation/create") {
    const kind = PROTOCOL_CALLS.has(method) ? "call" : "note";
    if (id) pending.set(id, { tool: null, key: method });
    return { kind, key: method, name: method, tool: null };
  }

  if (id && pending.has(id) && !method) {
    const prev = pending.get(id);
    pending.delete(id);
    const failed = Boolean(msg?.error);
    return {
      kind: failed ? "error" : "answer",
      key: prev.tool ? "tool-answer" : `${prev.key}-answer`,
      name: prev.tool || prev.key,
      tool: prev.tool,
    };
  }

  if (msg?.error) return { kind: "error", key: "error", name: "error", tool: null };
  if (dir === "←" || (dir === "→" && msg?.result && !method)) {
    return { kind: "answer", key: "result", name: "result", tool: null };
  }
  return { kind: "note", key: "other", name: method || "message", tool: null };
}

export function colorFor(entry) {
  if (entry.tool && TOOL_COLOR[entry.tool]) return TOOL_COLOR[entry.tool];
  if (entry.key === "brain") return BRAIN;
  if (entry.kind === "error") return ERROR;
  return NEUTRAL;
}
