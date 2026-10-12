// Encrypt for someone else's public key: node encrypt.mjs <public.pem> <file-with-secret>
// Prints one line starting with "sbox1." that only the private-key owner can open.
// Scheme: random AES-256-GCM key encrypts the data; RSA-OAEP (SHA-256) encrypts that key.
import { createCipheriv, createPublicKey, publicEncrypt, randomBytes, constants } from "node:crypto";
import { readFileSync } from "node:fs";

const [pubFile, secretFile] = process.argv.slice(2);
if (!pubFile || !secretFile) {
  console.error("usage: node encrypt.mjs <public.pem> <file-with-secret>");
  process.exit(1);
}
const publicKey = createPublicKey(readFileSync(pubFile, "utf8"));
const plain = readFileSync(secretFile);

const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
const ek = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);

const b = (x) => x.toString("base64url");
const msg = { v: 1, alg: "RSA-OAEP-256+A256GCM", ek: b(ek), iv: b(iv), tag: b(cipher.getAuthTag()), ct: b(ct) };
console.log("sbox1." + Buffer.from(JSON.stringify(msg)).toString("base64url"));
