// Live weather and sun times from Open-Meteo (https://open-meteo.com, CC BY 4.0, no key). Used only when the network answers
// within the timeout and never offline: the answer then says it has no live data. The forecast reaches 16 days ahead; for later
// dates only the sun times are given, from the same dates a year before (they repeat within a minute or two).
export interface WeatherDay { date: string; hi: number | null; lo: number | null; rainChance: number | null; code: number | null; sunrise: string | null; sunset: string | null }
export interface WeatherResult { days: WeatherDay[]; timezone: string; forecast: boolean; asOf: string }
export interface WeatherService { days(lat: number, lon: number, startDate: string, endDate: string): Promise<WeatherResult | null> }

export interface WeatherOptions { offline?: boolean; fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => number }

const DAY = 86_400_000;
export function createWeatherService(opts: WeatherOptions = {}): WeatherService {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const now = opts.now ?? Date.now;
  const get = async (url: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      return res.ok ? ((await res.json()) as any) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const daily = "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset";
  return {
    async days(lat, lon, startDate, endDate) {
      if (opts.offline) return null;
      const today = new Date(now()).toISOString().slice(0, 10);
      const last = new Date(now() + 15 * DAY).toISOString().slice(0, 10);
      const inForecast = endDate >= today && startDate <= last;
      const q = (a: string, b: string) => `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&timezone=auto&start_date=${a}&end_date=${b}`;
      if (inForecast) {
        const a = startDate < today ? today : startDate, b = endDate > last ? last : endDate;
        const j = await get(`https://api.open-meteo.com/v1/forecast?daily=${daily}&${q(a, b)}`);
        if (!j?.daily?.time) return null;
        return {
          timezone: j.timezone, forecast: true, asOf: new Date(now()).toISOString().slice(0, 16) + "Z",
          days: j.daily.time.map((d: string, i: number) => ({ date: d, hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i], rainChance: j.daily.precipitation_probability_max[i], code: j.daily.weathercode[i], sunrise: j.daily.sunrise[i]?.slice(11, 16) ?? null, sunset: j.daily.sunset[i]?.slice(11, 16) ?? null })),
        };
      }
      // Later dates: only sun times, from the same dates one year earlier (the archive).
      const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
      const j = await get(`https://archive-api.open-meteo.com/v1/archive?daily=sunrise,sunset&${q(shift(startDate), shift(endDate))}`);
      if (!j?.daily?.time) return null;
      return {
        timezone: j.timezone, forecast: false, asOf: new Date(now()).toISOString().slice(0, 16) + "Z",
        days: j.daily.time.map((d: string, i: number) => ({ date: `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`, hi: null, lo: null, rainChance: null, code: null, sunrise: j.daily.sunrise[i]?.slice(11, 16) ?? null, sunset: j.daily.sunset[i]?.slice(11, 16) ?? null })),
      };
    },
  };
}

/** A short word for a WMO weather code. */
export function weatherWord(code: number | null, locale: "en" | "es"): string {
  if (code === null) return "";
  const t: [number[], string, string][] = [
    [[0], "Clear", "Despejado"], [[1, 2], "Mostly clear", "Mayormente despejado"], [[3], "Cloudy", "Nublado"], [[45, 48], "Fog", "Niebla"],
    [[51, 53, 55, 56, 57], "Drizzle", "Llovizna"], [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "Lluvia"], [[71, 73, 75, 77, 85, 86], "Snow", "Nieve"], [[95, 96, 99], "Thunderstorms", "Tormentas"],
  ];
  const hit = t.find(([codes]) => codes.includes(code));
  return hit ? (locale === "es" ? hit[2] : hit[1]) : "";
}
