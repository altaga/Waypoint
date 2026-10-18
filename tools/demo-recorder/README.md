# Demo recorder

Records the Waypoint demo video from the simulated Alexa+ host: a scripted visit with a human-like mouse (minimum-jerk paths, Fitts timing, visible cursor and click ripple), narrated with a local text-to-speech voice, mixed into one mp4. It only drives the real app. Every answer on screen comes from the running server.

The mouse model and the cursor overlay follow the approach in `DEMO_HUMANO_PLAYWRIGHT.md` (see the top of `mouse_trajectory.cjs` for the references).

## Needs

- Node 22, Chromium and `ffmpeg` with `libx264`.
- Playwright. Set `PLAYWRIGHT_MODULE` to its folder if `require('playwright')` does not resolve.
- [Piper](https://github.com/rhasspy/piper) and one English voice, for the narration only:

```bash
python3 -m venv /tmp/piper && /tmp/piper/bin/pip install piper-tts
mkdir -p /tmp/voices && cd /tmp/voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium
curl -LO $B/en_US-lessac-medium.onnx && curl -LO $B/en_US-lessac-medium.onnx.json
```

## Run

```bash
# 1. the app, offline router (answers are deterministic; no Bedrock)
WAYPOINT_OFFLINE=1 npm start

# 2. the voice: one wav per scene, durations in out/voice/durations.json
cd tools/demo-recorder
PIPER_PY=/tmp/piper/bin/python PIPER_MODEL=/tmp/voices/en_US-lessac-medium.onnx node voice.cjs

# 3. the take: out/waypoint-demo.mp4 (1600x900, 25 fps, voice mixed in)
BASE_URL=http://127.0.0.1:3000 node waypoint-demo.cjs
```

The script prints the final length and says if it is over three minutes. The scenes and the narration lines are in `narration.json` and `waypoint-demo.cjs`; change a line, run step 2 again, then step 3. Each scene lasts at least as long as its line.

## Notes

- Output goes to `out/`, which is git-ignored (video, audio and models are never committed).
- The video shows the simulated host and says so. It does not claim that Alexa+ calls Waypoint.
- Mouse timings are random, so no two takes are identical.
- `VOICE_LEAD_MS` (default 350) sets how long after a scene starts the voice begins. `PIPER_LENGTH` slows (above 1) or speeds up (below 1) the voice.
- The title card and the fake URL bar are drawn on top of the page. The URL bar is off by default (`newRecordedContext(..., { navbar: true })` turns it on).
