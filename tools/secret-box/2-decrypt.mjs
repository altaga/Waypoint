// Phase 2 (run on YOUR computer): node 2-decrypt.mjs
// Paste the encrypted text you received (one line starting with "sbox1."), press Enter.
// Needs private.pem from phase 1 in this same folder.
import { createDecipheriv, createPrivateKey, privateDecrypt, constants } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const here = dirname(fileURLToPath(import.meta.url));
const privateKey = createPrivateKey(readFileSync(join(here, "private.pem"), "utf8"));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const blob = (process.argv[2] ?? (await rl.question("Paste the encrypted text: "))).trim();
rl.close();

if (!blob.startsWith("sbox1.")) {
  console.error('That does not look like an encrypted message (it should start with "sbox1.").');
  process.exit(1);
}
const msg = JSON.parse(Buffer.from(blob.slice(6), "base64url").toString("utf8"));
const key = privateDecrypt(
  { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  Buffer.from(msg.ek, "base64url"),
);
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(msg.iv, "base64url"));
decipher.setAuthTag(Buffer.from(msg.tag, "base64url"));
const plain = Buffer.concat([decipher.update(Buffer.from(msg.ct, "base64url")), decipher.final()]).toString("utf8");

console.log("\n==================== DECRYPTED ====================");
console.log(plain);
console.log("===================================================");
