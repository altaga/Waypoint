// The concierge sometimes calls a tool again for something an earlier turn already answered (it re-checks Singapore
// after the traveler moved on to Japan). The screen shows what this turn adds: a call with the same tool and
// arguments as one from an earlier turn is not drawn again. It stays in the trace.
// JSON with the keys of every object in order, so the same arguments written in another order are the same call.
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export function callKey(c) {
  return `${c.tool}:${canonical(c.args ?? {})}`;
}

/** The calls of this turn that no earlier turn made. `seen` is updated with all of them. */
export function freshCalls(calls, seen) {
  const earlier = new Set(seen);
  const keys = calls.map(callKey);
  const fresh = calls.filter((_, i) => !earlier.has(keys[i]));
  for (const k of keys) seen.add(k);
  return fresh;
}
