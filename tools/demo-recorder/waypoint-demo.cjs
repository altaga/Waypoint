// Records the Waypoint demo: a scripted visit to the simulated Alexa+ host
// with a human-like mouse, the narration mixed in, one mp4 out.
//   WAYPOINT_OFFLINE=1 npm start            (in the repo root, other terminal)
//   node voice.cjs                          (once; makes out/voice/*.wav)
//   node waypoint-demo.cjs                  (writes out/waypoint-demo.mp4)
const fs = require('fs');
const path = require('path');
const lib = require('./cursor_lib.cjs');
const { clickWithCursor, typeWithCursor, waitIdle, newRecordedContext } = lib;
const { run } = require('./video_pipeline.cjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const VIEWPORT = { width: 1600, height: 900 };
const OUT = path.join(__dirname, 'out');
const VOICE = path.join(OUT, 'voice');
const LEAD_MS = Number(process.env.VOICE_LEAD_MS ?? 350); // the voice starts this long after a scene does
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
const durations = JSON.parse(fs.readFileSync(path.join(VOICE, 'durations.json'), 'utf8'));
const marks = [];
let t0 = 0;

// Runs the actions of one scene while its line is spoken; the scene ends when both are done.
async function scene(id, actions) {
  marks.push({ id, at: Date.now() - t0 + LEAD_MS });
  const voiceDone = sleep(LEAD_MS + durations[id] * 1000 + 450);
  await Promise.all([actions(), voiceDone]);
}

// Scrolls the element to mid-screen first: the host's header is sticky and would
// swallow a click on a button that sits right under it.
async function centered(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return locator;
}

// Brings the reply (headline and card) into view, below the sticky header.
async function showReply(page) {
  await page.evaluate(() => {
    const stage = document.getElementById('stage');
    if (stage) stage.scrollTop = 0;
    const h = document.getElementById('headline');
    if (!h) return;
    const top = h.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
  await page.waitForTimeout(700);
}

async function ask(page, text) {
  const before = await page.locator('.bubble.assistant').count();
  await typeWithCursor(page, page.locator('#text'), text);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (n) => document.querySelectorAll('.bubble.assistant').length > n && document.getElementById('thinking').hidden,
    before,
    { timeout: 90000 },
  );
  await showReply(page);
}

async function titleCard(page, ms) {
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__title__';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#070b14;color:#fff;font-family:system-ui,sans-serif;text-align:center';
    d.innerHTML = '<div style="font-size:64px;font-weight:700;letter-spacing:-1px">Three friends, three passports, one trip.</div><div style="font-size:26px;opacity:.7">Waypoint · travel readiness for Alexa+ (simulated host)</div>';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.getElementById('__title__')?.remove());
}

(async () => {
  fs.rmSync(path.join(OUT, 'raw'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
  const browser = await lib.chromium.launch({ args: ['--no-sandbox'] });
  const context = await newRecordedContext(browser, path.join(OUT, 'raw'), VIEWPORT);
  const page = await context.newPage();
  const video = page.video();
  t0 = Date.now();

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => /conectado|connected/.test(document.getElementById('connState')?.textContent || ''), null, { timeout: 20000 });

  await scene('s1-title', async () => {
    await titleCard(page, Math.round(durations['s1-title'] * 1000 + 300));
  });

  await scene('s2-group', async () => {
    await waitIdle(page, 700);
    await clickWithCursor(page, page.locator('[data-lang="en"]'));
    await clickWithCursor(page, page.locator('#demoGroup'), { pauseAfter: 400 });
    await page.waitForSelector('.bubble.assistant');
  });

  await scene('s3-autopilot', async () => {
    await ask(page, 'Get me ready for Japan, December 3 to 10');
    await page.waitForSelector('#hero .act[data-action="panel"]', { timeout: 90000 });
    await waitIdle(page, 1500);
  });

  await scene('s3b-panel', async () => {
    const btn = page.locator('#hero .act[data-action="panel"]');
    await centered(page, btn);
    await clickWithCursor(page, btn, { pauseAfter: 300 });
    await page.waitForSelector('#apps iframe', { timeout: 15000 });
    await waitIdle(page, 2500);
    const close = page.getByRole('button', { name: 'Close panel' });
    await close.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await clickWithCursor(page, close, { pauseAfter: 500 });
  });

  await scene('s4-visa', async () => {
    await ask(page, 'Do we need a visa for Japan?');
    await waitIdle(page, 1500);
  });

  await scene('s5-rules', async () => {
    await ask(page, "What can't I bring?");
    await waitIdle(page, 2000);
  });

  await scene('s6-money', async () => {
    await ask(page, 'I spent 900 pesos on dinner, paid by Ana');
    const money = page.locator('#hero .act:has-text("Group money")');
    await centered(page, money);
    await clickWithCursor(page, money, { pauseAfter: 300 });
    await waitIdle(page, 2000);
  });

  await scene('s7-protocol', async () => {
    const sum = page.locator('#lblProtocol');
    await centered(page, sum);
    await clickWithCursor(page, sum, { pauseAfter: 500 });
    await page.locator('#log').scrollIntoViewIfNeeded();
    await waitIdle(page, 3000);
  });

  await scene('s8-session', async () => {
    const reset = page.locator('#reset');
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickWithCursor(page, reset, { pauseAfter: 600 });
    await ask(page, "What's left for my trip?");
    await waitIdle(page, 2500);
  });

  const endMs = Date.now() - t0;
  await page.close();
  const webm = path.join(OUT, 'raw', 'demo.webm');
  await video.saveAs(webm);
  await context.close();
  await browser.close();

  // Mix: each line is placed at the moment its scene began.
  const inputs = ['-i', webm];
  const filters = [];
  marks.forEach((m, i) => {
    inputs.push('-i', path.join(VOICE, `${m.id}.wav`));
    filters.push(`[${i + 1}:a]adelay=${m.at}|${m.at},aresample=44100[a${i}]`);
  });
  const mix = marks.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${marks.length}:normalize=0:dropout_transition=0,volume=1.6[aout]`;
  const final = path.join(OUT, 'waypoint-demo.mp4');
  await run('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filters.join(';') + ';' + mix,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
    '-c:a', 'aac', '-b:a', '160k', final,
  ]);
  const dur = parseFloat((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final])).stdout);
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ marks, recordedMs: endMs, finalSec: dur }, null, 2));
  console.log(`DONE ${final}  ${dur.toFixed(1)}s ${dur < 180 ? '(under 3:00)' : 'TOO LONG for the 3 minute limit'}`);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
