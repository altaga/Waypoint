import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeech } from "../src/speech.ts";

// A stand-in for the Polly client: it records each request and returns fixed audio bytes.
function fakePolly(bytes: Uint8Array | undefined) {
  const sent: Record<string, unknown>[] = [];
  const client = {
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { AudioStream: bytes ? { transformToByteArray: async () => bytes } : undefined };
    },
  };
  return { sent, client };
}

test("a Spanish reply is said with the neural Mexican Spanish voice", async () => {
  const { sent, client } = fakePolly(new Uint8Array([1, 2, 3]));
  const speak = createSpeech(client);
  const audio = await speak("  Listo: tu viaje a Japón.  ", "es");
  assert.deepEqual([...audio], [1, 2, 3]);
  assert.equal(sent[0].VoiceId, "Mia");
  assert.equal(sent[0].Engine, "neural");
  assert.equal(sent[0].OutputFormat, "mp3");
  assert.equal(sent[0].Text, "Listo: tu viaje a Japón.");
});

test("an English reply uses the neural US English voice", async () => {
  const { sent, client } = fakePolly(new Uint8Array([9]));
  await createSpeech(client)("Done: your trip to Japan.", "en");
  assert.equal(sent[0].VoiceId, "Joanna");
});

test("a repeated reply is served from the cache, not synthesized again", async () => {
  const { sent, client } = fakePolly(new Uint8Array([7]));
  const speak = createSpeech(client);
  await speak("Hola.", "es");
  await speak("Hola.", "es");
  assert.equal(sent.length, 1);
});

test("a long text is cut so one request cannot run up the bill", async () => {
  const { sent, client } = fakePolly(new Uint8Array([7]));
  await createSpeech(client)("a".repeat(1000), "en");
  assert.equal((sent[0].Text as string).length, 600);
});

test("an empty audio response is an error, not silence", async () => {
  const { client } = fakePolly(undefined);
  await assert.rejects(createSpeech(client)("Hola.", "es"), /empty_audio/);
});
