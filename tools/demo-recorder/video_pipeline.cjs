/**
 * @file video_pipeline.js
 * @description Segment-based recording + concatenation.
 *
 * Playwright's video recording is tied to the renderer process. Navigating
 * to a different origin (one site to another) can cross
 * a Chrome site-isolation boundary, which silently starts a SECOND video
 * file for the same page — the first attempt at a cross-origin cutaway lost
 * whatever came after the navigation because only one of the two files got
 * encoded.
 *
 * Fix: never navigate cross-origin inside a single recorded segment. Each
 * segment is one context/page that stays on one origin the whole
 * time; an external "proof" is a separate, non-recorded screenshot turned
 * into its own short clip. Everything is stitched together at the end with
 * ffmpeg's concat demuxer, after normalizing every piece to the same
 * codec/resolution/fps so concat doesn't choke on a mismatch.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${err.message}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * Runs `fn(page)` inside a freshly recorded segment and returns the encoded
 * mp4 path for that segment alone.
 */
async function recordSegment({ chromium, newRecordedContext }, browser, dir, fn, viewport) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const context = await newRecordedContext(browser, dir, viewport);
  const page = await context.newPage();
  const video = page.video();
  await fn(page);
  // page.close() (not just context.close()) before saveAs — saveAs()
  // otherwise can resolve before the encoder has actually finished muxing a
  // longer recording, which produced a truncated/corrupt webm ("EBML header
  // parsing failed") on a ~28s segment while a ~3s one was fine.
  const webmPath = path.join(dir, 'segment.webm');
  await page.close();
  await video.saveAs(webmPath);
  await context.close();
  const mp4Path = path.join(dir, 'segment.mp4');
  await run('ffmpeg', ['-y', '-i', webmPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', mp4Path]);
  return mp4Path;
}

/**
 * Screenshots a real, independent page (not part of any recorded segment)
 * and turns it into a short held-frame clip at the same resolution/fps as
 * the recorded segments, so concatenation is seamless.
 */
async function stillClipFromUrl({ chromium }, browser, url, outDir, { viewport, durationSec = 4.5, waitMs = 1800 } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(waitMs);
  const imgPath = path.join(outDir, 'still.png');
  await page.screenshot({ path: imgPath, fullPage: false });
  await page.close();
  const mp4Path = path.join(outDir, 'still.mp4');
  await run('ffmpeg', [
    '-y', '-loop', '1', '-i', imgPath,
    '-t', String(durationSec),
    '-vf', `scale=${viewport.width}:${viewport.height}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
    mp4Path,
  ]);
  return mp4Path;
}

/** Concatenates already-normalized mp4 clips (same codec/res/fps) in order. */
async function concatClips(mp4Paths, outputPath) {
  const listPath = outputPath + '.list.txt';
  fs.writeFileSync(listPath, mp4Paths.map((p) => `file '${path.resolve(p)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
  fs.unlinkSync(listPath);
}

module.exports = { recordSegment, stillClipFromUrl, concatClips, run };
