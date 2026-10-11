// Currency conversion. Live rates come from open.er-api.com (attribution required)
// with a short timeout and an in-memory cache. When live rates are unavailable,
// or when WAYPOINT_OFFLINE=1, the vendored snapshot is used and labelled as such.
// Frankfurter (ECB) is not used because it does not cover VND.

export interface FxRates {
  base: string;
  rates: Record<string, number>;
  asOf: string;
  source: "live" | "snapshot";
}

export interface FxService {
  rates(): Promise<FxRates>;
  convert(amount: number, from: string, to: string): Promise<{ value: number; rate: number; source: FxRates["source"]; asOf: string } | null>;
}

interface FxOptions {
  offline: boolean;
  snapshot: { base: string; rates: Record<string, number>; time_last_update_utc?: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  ttlMs?: number;
  now?: () => number;
}

export function createFxService(opts: FxOptions): FxService {
  const timeoutMs = opts.timeoutMs ?? 1500;
  const ttlMs = opts.ttlMs ?? 6 * 3600_000;
  const now = opts.now ?? Date.now;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let cache: { at: number; data: FxRates } | null = null;

  const snapshotRates = (): FxRates => ({
    base: opts.snapshot.base,
    rates: opts.snapshot.rates,
    asOf: (opts.snapshot.time_last_update_utc ?? "unknown").slice(0, 16),
    source: "snapshot",
  });

  async function fetchLive(): Promise<FxRates> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal });
      if (!res.ok) throw new Error(`fx ${res.status}`);
      const body = (await res.json()) as { result: string; base_code: string; rates: Record<string, number>; time_last_update_utc: string };
      if (body.result !== "success") throw new Error("fx result");
      return { base: body.base_code, rates: body.rates, asOf: body.time_last_update_utc.slice(0, 16), source: "live" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function rates(): Promise<FxRates> {
    if (opts.offline) return snapshotRates();
    if (cache && now() - cache.at < ttlMs) return cache.data;
    try {
      const data = await fetchLive();
      cache = { at: now(), data };
      return data;
    } catch {
      return snapshotRates();
    }
  }

  return {
    rates,
    async convert(amount, from, to) {
      const r = await rates();
      const fromRate = r.rates[from];
      const toRate = r.rates[to];
      if (!fromRate || !toRate) return null;
      const rate = toRate / fromRate;
      return { value: amount * rate, rate, source: r.source, asOf: r.asOf };
    },
  };
}
