// Turns narration.json into one wav per scene with Piper, and writes the
// duration of each clip to out/voice/durations.json (the recorder uses it to
// hold every scene at least as long as its line).
//   PIPER_PY=/path/to/venv/bin/python PIPER_MODEL=/path/to/voice.onnx node voice.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PY = process.env.PIPER_PY || 'python3';
const MODEL = process.env.PIPER_MODEL;
if (!MODEL) throw new Error('Set PIPER_MODEL to a Piper .onnx voice (see README.md).');
const LENGTH = process.env.PIPER_LENGTH || '1.0';

const outDir = path.join(__dirname, 'out', 'voice');
fs.mkdirSync(outDir, { recursive: true });
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
const durations = {};
let total = 0;
for (const s of scenes) {
  const wav = path.join(outDir, `${s.id}.wav`);
  const txt = path.join(outDir, `${s.id}.txt`);
  fs.writeFileSync(txt, s.line + '\n');
  execFileSync(PY, ['-m', 'piper', '-m', MODEL, '-i', txt, '-f', wav, '--length-scale', LENGTH, '--sentence-silence', '0.3'], { stdio: 'ignore' });
  const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  durations[s.id] = d;
  total += d;
  console.log(s.id.padEnd(14), d.toFixed(1) + 's');
}
fs.writeFileSync(path.join(outDir, 'durations.json'), JSON.stringify(durations, null, 2));
console.log('total voice', total.toFixed(1) + 's');
