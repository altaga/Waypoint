// Opening hours for people: OpenStreetMap's opening_hours text ("Mo-Fr 09:00-17:00; Sa off") as a short line.
// A text that is not one of the common forms is shown as it is, never guessed at.
const DAYS = {
  en: { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" },
  es: { Mo: "lun", Tu: "mar", We: "mié", Th: "jue", Fr: "vie", Sa: "sáb", Su: "dom" },
};

export function humanizeHours(text, lang = "en") {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const l = lang === "es" ? "es" : "en";
  if (raw === "24/7") return l === "es" ? "Abierto las 24 horas" : "Open 24 hours";
  const words = { off: l === "es" ? "cerrado" : "closed", all: l === "es" ? "todos los días" : "every day" };
  const parts = [];
  for (const rule of raw.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(off|closed|\d{2}:\d{2}-\d{2}:\d{2}(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/.exec(rule);
    if (!m) return raw;
    const days = m[1]
      ? m[1].split(",").map((d) => d.trim().split("-").map((x) => DAYS[l][x]).join("–")).join(", ")
      : words.all;
    if (m[1] && /undefined/.test(days)) return raw;
    const times = m[2] === "off" || m[2] === "closed" ? words.off : m[2].replace(/\s*,\s*/g, ", ").replace(/-/g, "–");
    parts.push(`${days} ${times}`);
  }
  return parts.join(" · ");
}
