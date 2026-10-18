// A dotted globe for the trip hero: the world as dots, and the group's routes as arcs that rise
// from each traveler's home and land on the destination. Plain canvas and an orthographic
// projection; the land dots come from web/globe-dots.json (Natural Earth, public domain).

const D = Math.PI / 180;
let dotsPromise = null;

function toXYZ(lat, lon) {
  const p = lat * D, l = lon * D;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

function loadDots() {
  dotsPromise ??= fetch(new URL("./globe-dots.json", import.meta.url))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`globe dots ${r.status}`))))
    .then((d) => {
      const out = new Float32Array((d.dots.length / 2) * 3);
      for (let i = 0; i < d.dots.length / 2; i++) out.set(toXYZ(d.dots[2 * i] / d.scale, d.dots[2 * i + 1] / d.scale), i * 3);
      return out;
    });
  return dotsPromise;
}

const norm = (v) => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const toLatLon = (v) => [Math.asin(Math.max(-1, Math.min(1, v[1]))) / D, Math.atan2(v[0], v[2]) / D];
const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/** A point on the great circle from a to b at t (0 to 1), as a unit vector. */
function slerp(a, b, t) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(dot);
  if (w < 1e-6) return a;
  const s = Math.sin(w);
  const k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

let current = null;

/**
 * Draws the globe into the canvas. geo: { destination: {lat, lon}, origins: [{lat, lon, names}] }.
 * Replaces any globe already running; stops by itself when the canvas leaves the page.
 * intro: fly in and draw the routes (first view of a trip); otherwise start at rest.
 * you: { lat, lon, label } adds a route from where the traveler is now (only when they asked the page to find them).
 */
export async function mountGlobe(canvas, geo, { intro = true, you = null } = {}) {
  if (current) current.stop();
  if (!canvas || !geo?.destination) return;
  let dots;
  try {
    dots = await loadDots();
  } catch {
    canvas.closest(".h-globe")?.setAttribute("hidden", "");
    return;
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  const dest = toXYZ(geo.destination.lat, geo.destination.lon);
  const origins = (geo.origins || []).map((o) => ({ v: toXYZ(o.lat, o.lon), label: (o.names || []).join(", "), you: Boolean(o.you) }));
  // Where the traveler is now (only when they asked the page to find them): a route in amber from there to the destination.
  if (you && !origins.some((o) => o.you)) origins.push({ v: toXYZ(you.lat, you.lon), label: you.label || "", you: true });
  // Aim between the homes and the destination, leaning to the destination, so every route is seen.
  const sum = origins.reduce((acc, o) => [acc[0] + o.v[0], acc[1] + o.v[1], acc[2] + o.v[2]], [dest[0] * 2.2, dest[1] * 2.2, dest[2] * 2.2]);
  const [lat0, lon0] = toLatLon(norm(sum));
  const aim = { lat: Math.max(-35, Math.min(35, lat0 * 0.8 + 10)), lon: lon0 };
  const start = performance.now() - (intro ? 0 : 4000);
  let raf = 0, alive = true;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 260;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr); }
    return { dpr, px: canvas.width };
  };

  const frame = (now) => {
    if (!alive || !canvas.isConnected) { alive = false; return; }
    const { dpr, px } = size();
    const t = reduced ? 10 : (now - start) / 1000;
    // Fly in from 60 degrees west, then breathe gently around the aim.
    const fly = ease(t / 1.6);
    const lon = aim.lon - 60 * (1 - fly) + (reduced ? 0 : Math.sin(t / 4) * 6 * fly);
    const lat = aim.lat - 12 * (1 - fly);
    const cl = Math.cos(lon * D), sl = Math.sin(lon * D), cp = Math.cos(lat * D), sp = Math.sin(lat * D);
    const R = px * 0.4, cx = px / 2, cy = px / 2;
    const project = (v) => {
      const x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl;
      const y2 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp;
      return [cx + x1 * R, cy - y2 * R, z2, x1, y2];
    };

    ctx.clearRect(0, 0, px, px);
    // Atmosphere and the dark sphere.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
    halo.addColorStop(0, "rgba(41,151,255,0.28)");
    halo.addColorStop(1, "rgba(41,151,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();
    const sphere = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sphere.addColorStop(0, "rgba(28,52,96,0.95)");
    sphere.addColorStop(1, "rgba(6,12,26,0.98)");
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(120,190,255,0.35)";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // Land: front-facing dots, brighter toward the middle.
    const r = 1.05 * dpr;
    for (let i = 0; i < dots.length; i += 3) {
      const p = project([dots[i], dots[i + 1], dots[i + 2]]);
      if (p[2] <= 0.02) continue;
      ctx.globalAlpha = 0.18 + 0.7 * p[2];
      ctx.fillStyle = "#8fc4ff";
      ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // Routes: each rises from home and lands on the destination; then a light runs along it.
    const hidden = (p) => p[2] < 0 && p[3] * p[3] + p[4] * p[4] < 1;
    origins.forEach((o, k) => {
      const w = Math.acos(Math.max(-1, Math.min(1, o.v[0] * dest[0] + o.v[1] * dest[1] + o.v[2] * dest[2])));
      const lift = 0.08 + 0.22 * (w / Math.PI);
      const grow = reduced ? 1 : ease((t - 0.7 - k * 0.25) / 1.4);
      if (grow <= 0) return;
      const steps = 64;
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(100,210,255,0.9)";
      ctx.shadowBlur = 10 * dpr;
      let prev = null;
      for (let s = 0; s <= steps * grow; s++) {
        const u = s / steps;
        const v = slerp(o.v, dest, u);
        const h = 1 + lift * Math.sin(Math.PI * u);
        const p = project([v[0] * h, v[1] * h, v[2] * h]);
        if (prev && !hidden(p) && !hidden(prev)) {
          ctx.strokeStyle = o.you ? `rgba(255,${Math.round(159 + 60 * u)},${Math.round(10 + 150 * u)},${0.55 + 0.45 * u})` : `rgba(${Math.round(100 + 155 * u)},${Math.round(210 + 45 * u)},255,${0.55 + 0.45 * u})`;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        prev = p;
      }
      // The travelling light, once the route is drawn.
      if (grow >= 1 && !reduced) {
        const u = ((t - 2.2 - k * 0.4) / 2.2) % 1;
        if (u > 0) {
          const v = slerp(o.v, dest, u);
          const h = 1 + lift * Math.sin(Math.PI * u);
          const p = project([v[0] * h, v[1] * h, v[2] * h]);
          if (!hidden(p)) {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * dpr, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.shadowBlur = 0;
      // Home: a small dot and the travelers' names.
      const home = project(o.v);
      if (home[2] > 0) {
        ctx.fillStyle = o.you ? "#ff9f0a" : "#64d2ff";
        ctx.beginPath(); ctx.arc(home[0], home[1], (o.you ? 4 : 3) * dpr, 0, Math.PI * 2); ctx.fill();
        if (o.label) {
          ctx.font = `500 ${11 * dpr}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
          ctx.fillStyle = o.you ? "rgba(255,214,140,0.95)" : "rgba(245,245,247,0.9)";
          // The name sits right of the dot, or left of it when it would run off the canvas.
          const tw = ctx.measureText(o.label).width;
          const lx = home[0] + 6 * dpr + tw > px - 2 * dpr ? home[0] - 6 * dpr - tw : home[0] + 6 * dpr;
          ctx.fillText(o.label, Math.max(2 * dpr, lx), Math.max(12 * dpr, home[1] - 6 * dpr));
        }
      }
    });

    // Destination: a bright pin with a pulse.
    const d = project(dest);
    if (d[2] > 0) {
      const pulse = reduced ? 0.5 : (t * 0.8) % 1;
      ctx.strokeStyle = `rgba(48,209,88,${0.8 * (1 - pulse)})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(d[0], d[1], (4 + 14 * pulse) * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = "rgba(48,209,88,0.9)";
      ctx.shadowBlur = 12 * dpr;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(d[0], d[1], 4 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (!reduced) raf = requestAnimationFrame(frame);
  };

  current = { stop: () => { alive = false; cancelAnimationFrame(raf); } };
  raf = requestAnimationFrame(frame);
}
