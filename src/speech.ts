// Neural speech for the host: the reply is said with an Amazon Polly neural voice, so it does not
// sound like a browser's built-in voice. The browser keeps its own voice as the fallback.
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

export type SpeechLang = "es" | "en";
export type Synthesize = (text: string, lang: SpeechLang) => Promise<Uint8Array>;

// The voice sets the language (Mia: Mexican Spanish, Joanna: US English).
const VOICE = {
  es: { VoiceId: "Mia" },
  en: { VoiceId: "Joanna" },
} as const;
// A reply is a few sentences; a longer text is cut, so one request cannot run up the bill.
const MAX_CHARS = 600;
const CACHE_SIZE = 200;

export function createSpeech(client: Pick<PollyClient, "send"> = new PollyClient({})): Synthesize {
  const cache = new Map<string, Uint8Array>();
  return async (text, lang) => {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    const key = `${lang}:${clean}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const out = await client.send(new SynthesizeSpeechCommand({ Text: clean, Engine: "neural", OutputFormat: "mp3", ...VOICE[lang] }));
    const bytes = await out.AudioStream?.transformToByteArray();
    if (!bytes || bytes.length === 0) throw new Error("empty_audio");
    cache.set(key, bytes);
    // Replies repeat often (the greeting, the same trip answer): keep the newest few hundred.
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return bytes;
  };
}
