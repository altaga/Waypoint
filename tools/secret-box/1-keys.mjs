// Phase 1 (run on YOUR computer): node 1-keys.mjs
// Creates an RSA-4096 key pair, prints both keys and saves them next to this file.
// Share ONLY the public key. The private key never leaves your computer.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const privPath = join(here, "private.pem");
const pubPath = join(here, "public.pem");
if (existsSync(privPath)) {
  console.error(`private.pem already exists in ${here}. Delete it first if you really want new keys.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 4096,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(privPath, privateKey, { mode: 0o600 });
writeFileSync(pubPath, publicKey);

console.log("==================== PRIVATE KEY (NEVER SHARE) ====================");
console.log(privateKey);
console.log("==================== PUBLIC KEY (safe to share) ===================");
console.log(publicKey);
console.log(`Saved: ${privPath}\n       ${pubPath}`);
console.log("Send the PUBLIC key block (from -----BEGIN PUBLIC KEY----- to -----END PUBLIC KEY-----).");
