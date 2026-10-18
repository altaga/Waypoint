// Playwright is not a dependency of the repo: point PLAYWRIGHT_MODULE at its
// folder (or entry file) if it is not resolvable from here.
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/usr/lib/node_modules/playwright'].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next one */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE to its folder.');
}
const { chromium } = loadPlaywright();
const traj = require('./mouse_trajectory.cjs');

// Injected into every page load in the context: a fake cursor that tracks
// real Playwright mouse.move() events (these dispatch real trusted input,
// so a page-level mousemove listener genuinely sees them) plus a click
// ripple, since headless Chromium never renders an OS cursor on its own.
const CURSOR_SCRIPT = `
(() => {
  const SHOW_NAVBAR = !!window.__WP_NAVBAR__;
  let lastX = -100, lastY = -100;

  function root() {
    return document.body || document.documentElement || null;
  }

  function ensureNavBar() {
    if (!SHOW_NAVBAR) return null;
    const r = root();
    if (!r) return null;
    let bar = document.getElementById('__fake_navbar__');
    if (bar && bar.isConnected) {
      const urlEl = bar.querySelector('#__fake_navbar_url__');
      if (urlEl) urlEl.textContent = location.hostname + (location.pathname !== '/' ? location.pathname : '');
      return bar;
    }
    bar = document.createElement('div');
    bar.id = '__fake_navbar__';
    Object.assign(bar.style, {
      position: 'fixed', top: '0', left: '0', right: '0', height: '34px',
      background: '#2b2b2e', borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px',
      zIndex: 2147483645, fontFamily: '-apple-system,Helvetica,Arial,sans-serif',
      boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    });
    const dots = document.createElement('div');
    dots.style.display = 'flex';
    dots.style.gap = '5px';
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c) => {
      const d = document.createElement('div');
      Object.assign(d.style, { width: '9px', height: '9px', borderRadius: '50%', background: c });
      dots.appendChild(d);
    });
    const pill = document.createElement('div');
    Object.assign(pill.style, {
      flex: '1', display: 'flex', alignItems: 'center', gap: '6px',
      background: '#1b1b1d', borderRadius: '6px', padding: '4px 10px',
      maxWidth: '520px', margin: '0 auto',
    });
    const lock = document.createElement('span');
    lock.textContent = '\\u{1F512}';
    lock.style.fontSize = '10px';
    lock.style.opacity = '0.8';
    const urlEl = document.createElement('span');
    urlEl.id = '__fake_navbar_url__';
    urlEl.textContent = location.hostname + (location.pathname !== '/' ? location.pathname : '');
    Object.assign(urlEl.style, {
      color: '#d8d8db', fontSize: '12px', fontFamily: 'monospace',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    });
    pill.appendChild(lock);
    pill.appendChild(urlEl);
    bar.appendChild(dots);
    bar.appendChild(pill);
    const spacer = document.createElement('div');
    spacer.style.width = '44px';
    bar.appendChild(spacer);
    r.insertBefore(bar, r.firstChild);
    return bar;
  }

  function ensureCursor() {
    const r = root();
    if (!r) return null;
    let cursor = document.getElementById('__fake_cursor__');
    if (cursor && cursor.isConnected) return cursor;
    cursor = document.createElement('div');
    cursor.id = '__fake_cursor__';
    Object.assign(cursor.style, {
      position: 'fixed', top: '0px', left: '0px', width: '24px', height: '24px',
      pointerEvents: 'none', zIndex: 2147483647,
      backgroundImage: "url('data:image/svg+xml;utf8," +
        "<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22>" +
        "<path d=%22M2 2 L2 19 L7 15 L10.5 22 L14 20.3 L10.7 13.5 L18 13.5 Z%22 " +
        "fill=%22white%22 stroke=%22black%22 stroke-width=%221.5%22/></svg>')",
      backgroundRepeat: 'no-repeat',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
      // The arrow tip is drawn at (2,2) inside the 24x24 SVG box, so without
      // this the visible tip sits 2px down-right of the real pointer
      // position — and the click ripple, which is centred on the true
      // position, appears offset from the arrow. That mismatch reads as the
      // cursor twitching at the moment of the click.
      transform: 'translate(-2px, -2px)',
    });
    cursor.style.left = lastX + 'px';
    cursor.style.top = lastY + 'px';
    r.appendChild(cursor);
    return cursor;
  }

  function ensureStyle() {
    if (document.getElementById('__fake_cursor_style__')) return;
    const style = document.createElement('style');
    style.id = '__fake_cursor_style__';
    style.textContent = \`
      @keyframes fake-cursor-ripple-out {
        from { transform: scale(0.2); opacity: 0.9; }
        to   { transform: scale(2.2); opacity: 0; }
      }
      @keyframes fake-cursor-ripple-out-2 {
        from { transform: scale(0.2); opacity: 0.6; }
        to   { transform: scale(1.4); opacity: 0; }
      }
      @keyframes fake-cursor-dot-flash {
        0%   { transform: scale(0.5); opacity: 1; }
        60%  { transform: scale(1.6); opacity: 0.7; }
        100% { transform: scale(0.5); opacity: 0; }
      }
    \`;
    (document.head || document.body || document.documentElement).appendChild(style);
  }

  document.addEventListener('mousemove', (e) => {
    lastX = e.clientX; lastY = e.clientY;
    const cursor = ensureCursor();
    cursor.style.left = lastX + 'px';
    cursor.style.top = lastY + 'px';
  }, true);

  document.addEventListener('mousedown', (e) => {
    const r = root();
    if (!r) return;
    ensureStyle();
    const cx = e.clientX, cy = e.clientY;

    // Two staggered expanding rings, unmistakable in a video even at a glance.
    const ring1 = document.createElement('div');
    Object.assign(ring1.style, {
      position: 'fixed', left: (cx - 20) + 'px', top: (cy - 20) + 'px',
      width: '40px', height: '40px', borderRadius: '50%',
      border: '3px solid rgba(52,199,89,1)', pointerEvents: 'none', zIndex: 2147483646,
      animation: 'fake-cursor-ripple-out 0.6s cubic-bezier(0.2,0.8,0.4,1) forwards',
    });
    r.appendChild(ring1);
    setTimeout(() => ring1.remove(), 650);

    const ring2 = document.createElement('div');
    Object.assign(ring2.style, {
      position: 'fixed', left: (cx - 20) + 'px', top: (cy - 20) + 'px',
      width: '40px', height: '40px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.9)', pointerEvents: 'none', zIndex: 2147483646,
      animation: 'fake-cursor-ripple-out-2 0.45s ease-out 0.08s forwards',
      opacity: '0',
    });
    r.appendChild(ring2);
    setTimeout(() => ring2.remove(), 600);

    // Solid flash dot right at the click point.
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: (cx - 6) + 'px', top: (cy - 6) + 'px',
      width: '12px', height: '12px', borderRadius: '50%',
      background: 'rgba(52,199,89,1)', pointerEvents: 'none', zIndex: 2147483647,
      animation: 'fake-cursor-dot-flash 0.35s ease-out forwards',
    });
    r.appendChild(dot);
    setTimeout(() => dot.remove(), 400);
  }, true);

  // Self-healing: whatever wipes extra DOM nodes on this app (framework
  // hydration re-rendering into document.body, etc.) only needs to be
  // outlasted, not out-smarted — just keep re-attaching. A MutationObserver
  // on document/documentElement was tried here to close the visible gap
  // faster, but it made newPage() hang or crash the renderer outright (this
  // app's own re-renders plus our re-insertions apparently thrash badly
  // together) — reproduced directly, reverted. 40ms is already under two
  // frames at 25fps, i.e. below what a viewer can actually perceive, so a
  // fast plain interval gets the same practical result without that risk.
  setInterval(() => { ensureCursor(); ensureNavBar(); }, 40);
  ensureCursor();
  ensureNavBar();
})();
`;

async function newRecordedContext(browser, dir, viewport = { width: 1600, height: 900 }, { navbar = false } = {}) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir, size: viewport },
  });
  if (navbar) await context.addInitScript({ content: 'window.__WP_NAVBAR__ = true;' });
  await context.addInitScript({ content: CURSOR_SCRIPT });
  return context;
}

// ── Human-like cursor movement ──────────────────────────────────────────────
// Delegated to mouse_trajectory.js, which models reaching the way the motor
// control literature describes it (minimum-jerk submovements + Fitts timing +
// enveloped tremor) instead of stacking easing curves. Two consequences that
// matter for how the recording looks:
//   * every submovement begins and ends at zero velocity, so the cursor can
//     never arrive with speed and snap to a halt — no landing jump;
//   * the path is one continuous sampled function, so there is no point
//     anywhere where the pointer teleports to a corrected position.
const lastPos = new WeakMap();

async function humanMouseMove(page, toX, toY, { targetW = 40, skipReaction = false } = {}) {
  const from = lastPos.get(page) || {
    // No prior position this session: start from a plausible resting spot
    // well away from the target so even the first gesture has real travel.
    x: 520 + Math.random() * 280,
    y: 660 + Math.random() * 140,
  };

  if (Math.hypot(toX - from.x, toY - from.y) < 1.5) {
    await page.mouse.move(toX, toY);
    lastPos.set(page, { x: toX, y: toY });
    return;
  }

  // ~15% of the time skip the reaction pause entirely — the gesture was
  // already "loaded" from watching the screen, not freshly triggered.
  if (!skipReaction && Math.random() > 0.15) await page.waitForTimeout(traj.reactionDelayMs());

  const energy = traj.gestureEnergy();
  const samples = traj.generatePath(from, { x: toX, y: toY }, { targetW, energy });
  await traj.dispatchPath(page, samples);
  lastPos.set(page, { x: toX, y: toY });
}

// Moves the real Playwright mouse to the element along a human trajectory,
// dwells briefly the way a hand does before pressing, then clicks without
// moving between button-down and button-up.
async function clickWithCursor(page, locatorOrText, { exact = true, pauseBefore = null, pauseAfter = 0 } = {}) {
  const locator = typeof locatorOrText === 'string'
    ? page.getByText(locatorOrText, { exact }).first()
    : locatorOrText;
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element not visible: ${locatorOrText}`);
  // Aim point: most clicks land near centre, but real ones don't cluster on
  // the exact centroid every time — aimOffset sometimes deliberately picks a
  // point toward one side instead (see mouse_trajectory.js).
  const { dx, dy } = traj.aimOffset(box);
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2 + dy;

  await humanMouseMove(page, x, y, { targetW: Math.max(box.width, 16) });

  // The dwell before pressing is never a frozen wait — a hand hovering
  // over a target keeps making tiny corrections right up to the press,
  // it doesn't lock perfectly still. Spend the dwell as 1-3 sub-pixel
  // drifts instead of one static pause.
  const dwellTotal = pauseBefore ?? traj.preClickDwellMs();
  await traj.microDrift(page, x, y, dwellTotal);

  // No drift between down and up: React Native Web's Pressable (like most
  // touch-derived tap handlers) cancels the press if the pointer moves more
  // than a small threshold before release, to tell a tap from a drag/scroll.
  // Confirmed by reproducing it directly — drifting during the hold made
  // ~1 in 3 clicks silently fail to navigate. The hold is real but still.
  await page.mouse.down();
  await page.waitForTimeout(traj.clickHoldMs());
  await page.mouse.up();

  if (pauseAfter) await page.waitForTimeout(pauseAfter);
}

// Clicks a locator to focus it, then types `text` with human timing/typos
// (mouse_trajectory.humanType) instead of Playwright's uniform
// pressSequentially — a fixed per-character delay with zero mistakes is one
// of the cleanest "this was scripted" tells in the whole recording.
async function typeWithCursor(page, locator, text) {
  await clickWithCursor(page, locator, { pauseAfter: 150 });
  await traj.humanType(page, text);
}

// A plain page.waitForTimeout(ms) during a "watch this happen" beat leaves
// the cursor perfectly frozen for several real seconds — the cleanest
// possible tell that nobody's actually holding the mouse. This spends the
// same wait as small, slow drift around wherever the cursor currently is,
// like a hand resting on a mouse while reading the screen instead of
// deliberately moving anywhere. Never use this while typing is in flight.
async function waitIdle(page, ms) {
  const at = lastPos.get(page);
  if (!at || ms < 400) {
    await page.waitForTimeout(ms);
    return;
  }
  const end = await traj.idleFidget(page, at.x, at.y, ms);
  lastPos.set(page, end);
}

module.exports = {
  chromium,
  newRecordedContext,
  clickWithCursor,
  humanMouseMove,
  typeWithCursor,
  waitIdle,
};
