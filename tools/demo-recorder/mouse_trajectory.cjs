/**
 * @file mouse_trajectory.js
 * @description Human mouse trajectory generation for screen-recorded demos.
 *
 * Rather than stacking ad-hoc easing curves and random jitter (which reads as
 * "algorithm with noise added"), this models what the motor-control
 * literature actually says about human reaching:
 *
 *  - Minimum-jerk profile (Flash & Hogan, 1985): a single human reaching
 *    movement follows x(t) = 10t³ − 15t⁴ + 6t⁵. Velocity and acceleration are
 *    both zero at each endpoint, so a movement can never "arrive with speed"
 *    and snap to a stop — which is exactly the visible jump this replaces.
 *
 *  - Optimized submovement model (Meyer et al., 1988): a reach is not one
 *    motion. It's a fast ballistic primary submovement that deliberately
 *    lands imprecisely, followed by 0–2 smaller corrective submovements. The
 *    corrections overlap the tail of the primary rather than starting after
 *    it, so the result is one continuous gesture with a characteristic
 *    asymmetric velocity profile — fast rise, long ragged tail.
 *
 *  - Fitts's law: movement time scales with log2(2D/W), so travelling far to
 *    a small target takes longer than travelling far to a big one.
 *
 *  - Physiological tremor: ~8–12 Hz, sub-pixel amplitude, enveloped so it
 *    vanishes at rest (a cursor that keeps twitching after it lands looks
 *    like noise injection, not a hand).
 *
 * Everything is generated as one continuous position(t) function and sampled
 * on a real clock, so there is never a discrete teleport anywhere in the
 * path — including the final correction, which was the source of the visible
 * "brinco" in the previous implementation.
 */

const DEFAULTS = {
  sampleHz: 120,        // trajectory sampling rate
  minDurationMs: 190,
  maxDurationMs: 1500,
  tremorHz: [8, 12],    // physiological tremor band
  tremorPx: 0.16,       // peak tremor amplitude, sub-pixel — was 0.55, read as
                        // a seizure once combined with wander/speed-noise
};

function minJerk(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 10 * t * t * t - 15 * t * t * t * t + 6 * t * t * t * t * t;
}

function gauss(sigma = 1) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Fitts's law duration for a reach, with per-movement variability.
 * targetW is the effective target width along the movement axis.
 *
 * energy multiplies the whole thing down (faster/sloppier) or up
 * (slower/careful) — real people don't execute every click at the same
 * overall tempo. Consecutive clicks in the same recording should NOT all
 * take a similar-feeling duration.
 */
function fittsDurationMs(distance, targetW = 40, energy = 1) {
  const w = Math.max(8, targetW);
  const id = Math.log2((2 * distance) / w + 1); // index of difficulty
  const base = 105 + 165 * id;
  const varied = (base * (0.62 + Math.random() * 0.85)) / energy;
  return clamp(varied, DEFAULTS.minDurationMs, DEFAULTS.maxDurationMs);
}

/**
 * Smooth-ish pseudo-noise: a handful of summed sine waves at incommensurate
 * frequencies, so the result wanders unpredictably rather than repeating,
 * without the harsh discontinuity of pure Math.random() at every sample.
 * Returns roughly in [-1, 1].
 */
function makeNoiseFn(seed) {
  const terms = [
    { f: 0.9 + seed * 0.37, a: 0.5, p: seed * 6.1 },
    { f: 2.3 + seed * 0.71, a: 0.3, p: seed * 2.9 + 1.7 },
    { f: 5.1 + seed * 1.13, a: 0.2, p: seed * 4.4 + 0.4 },
  ];
  return (t) => terms.reduce((s, term) => s + term.a * Math.sin(t * term.f + term.p), 0);
}

/**
 * Builds the submovement decomposition for one reach.
 *
 * Each submovement contributes a displacement that is applied through a
 * minimum-jerk time profile. Because every profile starts and ends with zero
 * velocity, and contributions are summed, the composite path is smooth
 * everywhere and lands exactly on the target at rest.
 */
function buildSubmovements(from, to, opts = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const energy = opts.energy ?? 1;
  const totalMs = opts.durationMs ?? fittsDurationMs(distance, opts.targetW, energy);

  const subs = [];

  // Primary ballistic submovement: covers most of the distance and lands
  // with a deliberate error. Undershoot is more common than overshoot in
  // real reaching (subjects bias toward not blowing past the target).
  const overshooting = Math.random() < 0.38;
  const errorFrac = overshooting
    ? 0.02 + Math.random() * 0.11        // 2–13% past the target
    : -(0.04 + Math.random() * 0.19);    // 4–23% short of it
  const primaryFrac = 1 + errorFrac;

  const primaryMs = totalMs * (0.55 + Math.random() * 0.25);
  subs.push({
    t0: 0,
    dur: primaryMs,
    dx: dx * primaryFrac,
    dy: dy * primaryFrac,
    primary: true,
  });

  // Corrective submovements: each closes most of the remaining gap, is
  // slower, and starts before the previous one has fully settled.
  let remainingX = dx - dx * primaryFrac;
  let remainingY = dy - dy * primaryFrac;
  let cursorTime = primaryMs;

  const nCorrections = distance < 60
    ? (Math.random() < 0.55 ? 1 : 0)
    : distance < 260
      ? (Math.random() < 0.65 ? 1 : 2)
      : (Math.random() < 0.15 ? 0 : 1) + (Math.random() < 0.65 ? 1 : 0);

  for (let i = 0; i < nCorrections; i++) {
    const isLast = i === nCorrections - 1;
    // Overlap: the correction begins while the previous submovement is
    // still decelerating (70–92% through it).
    const prev = subs[subs.length - 1];
    const overlapStart = prev.t0 + prev.dur * (0.70 + Math.random() * 0.22);
    // Last correction must close the gap exactly; earlier ones close most.
    const closeFrac = isLast ? 1 : 0.6 + Math.random() * 0.25;
    const cdx = remainingX * closeFrac;
    const cdy = remainingY * closeFrac;
    const cdur = Math.max(70, totalMs * (0.16 + Math.random() * 0.14));

    subs.push({ t0: overlapStart, dur: cdur, dx: cdx, dy: cdy, primary: false });

    remainingX -= cdx;
    remainingY -= cdy;
    cursorTime = Math.max(cursorTime, overlapStart + cdur);
  }

  // If no corrections were generated, the primary must land exactly.
  if (nCorrections === 0) {
    subs[0].dx = dx;
    subs[0].dy = dy;
  }

  const endMs = subs.reduce((m, s) => Math.max(m, s.t0 + s.dur), 0);
  return { subs, endMs, distance };
}

/**
 * Perpendicular path curvature. Real trajectories bow off the straight line;
 * the bow is zero at both endpoints so it never displaces the landing point.
 */
function curvatureOffset(progress, amplitude) {
  return Math.sin(Math.PI * clamp(progress, 0, 1)) * amplitude;
}

/**
 * Produces the full sampled path for a reach: an array of
 * { x, y, tMs } samples from the start point to exactly the target.
 */
function generatePath(from, to, opts = {}) {
  const { subs, endMs, distance } = buildSubmovements(from, to, opts);

  const axisAngle = Math.atan2(to.y - from.y, to.x - from.x);
  const perpAngle = axisAngle + Math.PI / 2;
  // Curvature scales with distance but saturates; direction is random. This
  // whole family of offsets (bow + wander + excursion below) is applied
  // along perpAngle — perpendicular to the direction of travel. Most clicks
  // in this UI are on a wide, mostly-horizontal layout (top tabs, side
  // panels), so for a horizontal move perpAngle is ~vertical: with the
  // original coefficients here (up to 64px bow, capped low relative to a
  // gauss(1.3) multiplier) that reads as the cursor bouncing up and down
  // rather than curving naturally. Cut roughly in half across the board.
  // A pure distance-scaled cap collapses toward 0 for short hops (close
  // buttons/tabs — most of what a compact panel like Treasury has), which
  // read as dead-straight lines with zero organic wobble. A small floor
  // keeps even short moves visibly non-straight.
  // The earlier "bounces up and down" complaint was about frequency (wander
  // oscillating ~4x per move), not magnitude — that's fixed below (wander is
  // ~1 wave now). A single bigger sweep still reads as one natural arc, so
  // amplitude can go back up without reintroducing the bounce.
  // The short-hop case (no cap ever kicks in below ~230px) is what read as
  // "right" — the cap at 42 was flattening the same proportion out of medium
  // and especially long moves (520px would want ~94px of bow but got capped
  // to 42, less than half). Raised so the ratio stays consistent across the
  // realistic demo distance range instead of only holding for short hops.
  const bowAmplitude = gauss(1.0) * Math.min(110, Math.max(8, distance * 0.18));

  const tremorFreq = DEFAULTS.tremorHz[0] + Math.random() * (DEFAULTS.tremorHz[1] - DEFAULTS.tremorHz[0]);
  const tremorPhase = Math.random() * Math.PI * 2;
  const tremorAmp = DEFAULTS.tremorPx * (0.4 + Math.random() * 0.5);

  // Path "wander": a smoothly-varying but unpredictable perpendicular
  // offset, on top of the clean bow. A single sine bow always looks like a
  // drawn arc; summing a few incommensurate ones wanders instead — closer
  // to how an unsteadied hand actually drifts off the direct line.
  const wanderNoise = makeNoiseFn(Math.random() * 100);
  const wanderAmp = Math.min(26, Math.max(4, distance * 0.05)) * (0.4 + Math.random() * 0.6);

  // Local speed noise: perturbs how fast time "feels" to move through the
  // profile, so the velocity curve isn't one textbook-clean bell — it has
  // several small unpredictable surges and hesitations, the way real
  // continuous mouse tracking data actually looks when you plot it.
  const speedNoise = makeNoiseFn(Math.random() * 100 + 50);
  const speedNoiseStrength = 0.32 + Math.random() * 0.35;

  // Excursions are more frequent, can happen on medium moves too, and vary
  // more in size — a real misdirection-and-correct, not just curvature.
  const hasExcursion = distance > 160 && Math.random() < 0.22;
  const excursionAt = 0.2 + Math.random() * 0.45;
  const excursionWidth = 0.06 + Math.random() * 0.09;
  const excursionMag = Math.min(14, distance * 0.06) * (0.4 + Math.random() * 0.7);
  const excursionSign = Math.random() < 0.5 ? 1 : -1;
  // A second, smaller excursion sometimes rides along with the first —
  // consecutive over-corrections, not just one clean bump.
  const hasSecondExcursion = hasExcursion && distance > 300 && Math.random() < 0.35;
  const excursion2At = clamp(excursionAt + (0.18 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1), 0.08, 0.9);
  const excursion2Mag = excursionMag * (0.3 + Math.random() * 0.4);
  const excursion2Sign = Math.random() < 0.5 ? 1 : -1;

  const dt = 1000 / (opts.sampleHz ?? DEFAULTS.sampleHz);
  const samples = [];
  let warpedT = 0;

  for (let rawT = 0; rawT <= endMs; rawT += dt) {
    // Warp time locally by the speed-noise field instead of advancing
    // uniformly — this is what actually breaks up the clean bell curve.
    const noiseVal = speedNoise(rawT / 90);
    const localRate = clamp(1 + noiseVal * speedNoiseStrength, 0.22, 2.3);
    warpedT += dt * localRate;
    const t = Math.min(warpedT, endMs);

    let x = from.x;
    let y = from.y;
    for (const s of subs) {
      const local = (t - s.t0) / s.dur;
      const p = minJerk(local);
      x += s.dx * p;
      y += s.dy * p;
    }

    const progress = clamp(t / endMs, 0, 1);

    // Path bow, tapering to exactly zero at both ends.
    const bow = curvatureOffset(progress, bowAmplitude);
    x += Math.cos(perpAngle) * bow;
    y += Math.sin(perpAngle) * bow;

    // Wander, also tapering to zero at both ends so it never displaces the
    // landing point. makeNoiseFn's fastest term is ~5-6 rad per unit input,
    // so feeding it progress*5 packed ~4 full oscillations into one
    // movement — on a mostly-horizontal move (perpAngle ~vertical) that's
    // exactly what read as the cursor bouncing up and down repeatedly
    // instead of drifting once. progress*1.6 keeps it to about one visible
    // wave.
    const wanderEnv = Math.sin(Math.PI * progress);
    const wander = wanderNoise(progress * 1.0) * wanderAmp * wanderEnv;
    x += Math.cos(perpAngle) * wander;
    y += Math.sin(perpAngle) * wander;

    // A real misdirection, not just curvature — a distinct bump localized
    // around excursionAt, gone well before the landing.
    if (hasExcursion) {
      const d = (progress - excursionAt) / excursionWidth;
      const bump = Math.exp(-d * d) * excursionMag * excursionSign;
      x += Math.cos(perpAngle) * bump;
      y += Math.sin(perpAngle) * bump;
    }
    if (hasSecondExcursion) {
      const d2 = (progress - excursion2At) / excursionWidth;
      const bump2 = Math.exp(-d2 * d2) * excursion2Mag * excursion2Sign;
      x += Math.cos(perpAngle) * bump2;
      y += Math.sin(perpAngle) * bump2;
    }

    // Tremor, enveloped so it fades out as the hand settles.
    const tremorEnv = Math.sin(Math.PI * progress) * (1 - progress * 0.65);
    const tremor = Math.sin((t / 1000) * tremorFreq * 2 * Math.PI + tremorPhase) * tremorAmp * tremorEnv;
    x += Math.cos(perpAngle) * tremor;
    y += Math.sin(perpAngle) * tremor;

    samples.push({ x, y, tMs: rawT });
  }

  // Guarantee the path terminates exactly on target, at rest. If the last
  // computed sample is still a short way off (tremor envelope residue, or the
  // loop stepping past endMs), ease into the target across a few extra
  // samples rather than snapping — a 1–2px snap on the final frame is small
  // but it is exactly the kind of thing that reads as a twitch on video.
  const tail = samples[samples.length - 1];
  const residual = Math.hypot(to.x - tail.x, to.y - tail.y);
  if (residual > 0.4) {
    const settleSteps = Math.min(6, Math.max(3, Math.round(residual)));
    const settleMs = 55 + residual * 7;
    for (let i = 1; i <= settleSteps; i++) {
      const p = minJerk(i / settleSteps);
      samples.push({
        x: tail.x + (to.x - tail.x) * p,
        y: tail.y + (to.y - tail.y) * p,
        tMs: endMs + (settleMs * i) / settleSteps,
      });
    }
  } else {
    samples.push({ x: to.x, y: to.y, tMs: endMs + 12 });
  }
  return samples;
}

/**
 * Dispatches a generated path through Playwright's mouse on a real clock.
 *
 * Timing is driven by elapsed wall time rather than by summing per-step
 * sleeps: dispatch overhead would otherwise stretch every movement and make
 * fast gestures impossible. Samples that fall behind schedule are skipped,
 * so the gesture always takes the intended duration.
 */
async function dispatchPath(page, samples) {
  const startedAt = Date.now();
  let lastDispatched = null;
  // Skipping several behind-schedule samples in a row can otherwise land a
  // single mouse.move() many pixels from the last dispatched one — a real
  // teleport ("brinco") on video the instant something (video encoding,
  // system load) makes dispatch fall behind. Capping how far a skip is
  // allowed to jump means a late frame costs timing accuracy, never
  // smoothness — always dispatch anyway once behind samples imply a big jump.
  const MAX_SKIP_JUMP_PX = 14;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const elapsed = Date.now() - startedAt;
    const behind = elapsed - s.tMs;

    if (behind > 6 && i < samples.length - 1) {
      if (lastDispatched) {
        const jump = Math.hypot(s.x - lastDispatched.x, s.y - lastDispatched.y);
        if (jump < MAX_SKIP_JUMP_PX) continue;
      } else {
        continue;
      }
    }

    const wait = s.tMs - (Date.now() - startedAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.mouse.move(s.x, s.y);
    lastDispatched = s;
  }

  return lastDispatched;
}

/**
 * Pre-movement latency: the gap between deciding to act and the hand
 * starting to move. Heavy-tailed — usually short, occasionally a real beat
 * of hesitation.
 */
function reactionDelayMs() {
  const r = Math.random();
  if (r < 0.5) return 25 + Math.random() * 130;
  if (r < 0.85) return 130 + Math.random() * 300;
  return 350 + Math.random() * 600;
}

/**
 * Dwell between the cursor arriving and the button going down. Heavy-tailed
 * like reaction time: often near-instant (the click was already "loaded"
 * as part of the same motion), occasionally a real pause.
 */
function preClickDwellMs() {
  const r = Math.random();
  if (r < 0.35) return 5 + Math.random() * 40;
  if (r < 0.75) return 40 + Math.random() * 130;
  return 160 + Math.random() * 320;
}

/** How long the button is held. */
function clickHoldMs() {
  return 40 + Math.abs(gauss(42));
}

/**
 * Spends `durationMs` NOT frozen at (x, y) but making 1-3 sub-pixel drifts
 * around it — used both for the pre-click dwell and the down/up hold. A
 * hand hovering or lightly pressing is never perfectly still; a cursor that
 * holds an exact pixel for the whole dwell is one of the cleanest "this was
 * scripted" tells on video.
 */
/**
 * Interpolates a single short hop with a minimum-jerk profile instead of one
 * instant page.mouse.move() call — a bare move() to a new point is a
 * one-frame teleport, which for a SMALL hop (a few px) reads as a jump/snap
 * rather than a drift. Used for the tiny sub-movements inside microDrift and
 * idleFidget; real travel between elements goes through generatePath.
 */
async function smoothHop(page, fromX, fromY, toX, toY, durationMs) {
  if (durationMs < 20) {
    await page.mouse.move(toX, toY);
    await page.waitForTimeout(durationMs);
    return;
  }
  const steps = Math.max(3, Math.round(durationMs / 16));
  const startedAt = Date.now();
  for (let i = 1; i <= steps; i++) {
    const p = minJerk(i / steps);
    const targetT = (durationMs * i) / steps;
    const wait = targetT - (Date.now() - startedAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.mouse.move(fromX + (toX - fromX) * p, fromY + (toY - fromY) * p);
  }
}

async function microDrift(page, x, y, durationMs) {
  if (durationMs < 15) {
    await page.waitForTimeout(durationMs);
    return;
  }
  const legs = durationMs < 60 ? 1 : 1 + Math.floor(Math.random() * 3);
  let remaining = durationMs;
  let cx = x, cy = y;
  for (let i = 0; i < legs; i++) {
    const legMs = i === legs - 1 ? remaining : Math.max(10, remaining * (0.3 + Math.random() * 0.4));
    remaining -= legMs;
    const nx = x + gauss(1.3);
    const ny = y + gauss(1.3);
    await smoothHop(page, cx, cy, nx, ny, legMs);
    cx = nx; cy = ny;
  }
  await smoothHop(page, cx, cy, x, y, 40);
}

/**
 * Where inside a target to actually aim, as an {x, y} offset from its
 * center. Real clicks don't cluster tightly on the centroid — most land
 * somewhere in the middle third, but plenty land closer to one edge. Mostly
 * a tight center-biased gaussian (matches how it looked before); the rest
 * of the time, aim deliberately toward one side/corner within the box
 * instead, scaled to its actual size rather than a fixed few pixels.
 */
function aimOffset(box) {
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  if (Math.random() < 0.4) {
    // Off-center: pick a side and land noticeably toward it, but staying
    // safely inside the box (never within ~12% of the edge).
    const marginX = halfW * 0.12;
    const marginY = halfH * 0.12;
    const dx = (Math.random() < 0.5 ? -1 : 1) * (marginX + Math.random() * (halfW * 0.6 - marginX));
    const dy = (Math.random() < 0.5 ? -1 : 1) * (marginY + Math.random() * (halfH * 0.6 - marginY));
    return { dx, dy };
  }
  return { dx: gauss(Math.min(halfW * 0.22, 9)), dy: gauss(Math.min(halfH * 0.22, 5)) };
}

/**
 * Small, slow drift around a resting point — not travel toward anything,
 * just what a hand resting on a mouse does while reading/watching the
 * screen instead of acting. Meant for long idle waits, never for the
 * click-dwell (that's microDrift, tighter and faster) or while typing.
 */
async function idleFidget(page, x, y, durationMs) {
  let elapsed = 0;
  let cx = x, cy = y;
  while (elapsed < durationMs) {
    const legMs = Math.min(durationMs - elapsed, 350 + Math.random() * 900);
    const nx = x + gauss(4.5);
    const ny = y + gauss(3);
    await smoothHop(page, cx, cy, nx, ny, legMs);
    cx = nx; cy = ny;
    elapsed += legMs;
  }
  return { x: cx, y: cy };
}

/**
 * Energy multiplier for a whole gesture — how brisk vs. careful this
 * particular movement feels. Drawing this once per call (not per-parameter)
 * is what keeps consecutive clicks from all sharing the same tempo.
 */
function gestureEnergy() {
  const r = Math.random();
  if (r < 0.22) return 0.4 + Math.random() * 0.35;   // unusually slow/careful
  if (r < 0.7) return 0.75 + Math.random() * 0.55;   // typical range
  return 1.3 + Math.random() * 1.4;                  // quick, almost brusque
}

/**
 * Per-character keystroke delay. Heavy-tailed like the other timings: most
 * keystrokes are quick and roughly even, some are a beat slower (word
 * boundaries, thinking), and occasionally there's a real pause.
 */
function charDelayMs() {
  const r = Math.random();
  if (r < 0.7) return 35 + Math.random() * 90;
  if (r < 0.93) return 120 + Math.random() * 180;
  return 300 + Math.random() * 420;
}

/**
 * Types `text` into whatever currently has focus with per-character variable
 * timing and occasional fat-finger typos (a wrong adjacent-ish character,
 * a beat of "notice it", backspace, correct) — a uniform per-character delay
 * with no mistakes is one of the cleanest "this was scripted" tells.
 */
async function humanType(page, text, { typoRate = 0.035 } = {}) {
  for (const ch of text) {
    if (/[a-z0-9]/i.test(ch) && Math.random() < typoRate) {
      const wrong = String.fromCharCode(ch.charCodeAt(0) + (Math.random() < 0.5 ? 1 : -1));
      await page.keyboard.type(wrong);
      await page.waitForTimeout(90 + Math.random() * 180);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(70 + Math.random() * 110);
    }
    await page.keyboard.type(ch);
    await page.waitForTimeout(charDelayMs());
  }
}

module.exports = {
  minJerk,
  fittsDurationMs,
  buildSubmovements,
  generatePath,
  dispatchPath,
  reactionDelayMs,
  preClickDwellMs,
  clickHoldMs,
  microDrift,
  gestureEnergy,
  gauss,
  humanType,
  aimOffset,
  idleFidget,
};
