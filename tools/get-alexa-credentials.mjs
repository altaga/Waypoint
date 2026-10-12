// Prints ASK_REFRESH_TOKEN and ASK_VENDOR_ID for the Waypoint Alexa skill.
// Run it on YOUR computer:   node get-alexa-credentials.mjs
// No global installs: ask-cli is installed into ./.ask-cli-local next to this file.
// You sign in in your browser with the Amazon account your Alexa app uses.
// Requires Node.js 18+. Port 9090 on localhost must be free during sign-in.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASK_CLI_VERSION = "2.30.7";
const LOCAL_DIR = join(dirname(fileURLToPath(import.meta.url)), ".ask-cli-local");
const ASK_BIN = join(LOCAL_DIR, "node_modules", "ask-cli", "dist", "bin", "ask.js");
const isWindows = process.platform === "win32";

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

if (Number(process.versions.node.split(".")[0]) < 18) {
  fail(`Node.js 18 or newer is required (you have ${process.versions.node}). https://nodejs.org/`);
}

// 1. Install ask-cli locally (only the first time).
if (!existsSync(ASK_BIN)) {
  console.log(`Installing ask-cli ${ASK_CLI_VERSION} into ${LOCAL_DIR} ...`);
  const res = spawnSync(
    isWindows ? "npm.cmd" : "npm",
    ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", LOCAL_DIR, `ask-cli@${ASK_CLI_VERSION}`],
    { stdio: "inherit", shell: isWindows },
  );
  if (res.status !== 0 || !existsSync(ASK_BIN)) fail("Could not install ask-cli locally.");
}

// ask-cli refuses to run without ~/.ask/cli_config; create an empty one if missing.
const ASK_CONFIG = join(homedir(), ".ask", "cli_config");
if (!existsSync(ASK_CONFIG)) {
  mkdirSync(dirname(ASK_CONFIG), { recursive: true });
  writeFileSync(ASK_CONFIG, JSON.stringify({ profiles: {} }));
}

// 2. Sign in and get the tokens.
console.log("\nA browser window will open. Sign in with your Amazon account and click Allow.\n");
const MARKER = "The LWA tokens result:";
const tokens = await new Promise((resolve) => {
  const child = spawn(process.execPath, [ASK_BIN, "util", "generate-lwa-tokens"], {
    stdio: ["inherit", "pipe", "inherit"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c.toString()));
  child.on("close", (code) => {
    const at = out.indexOf(MARKER);
    if (code !== 0 || at === -1) fail("Sign-in did not finish. If port 9090 is busy, free it and run again.");
    const rest = out.slice(at + MARKER.length).replace(/\u001b\[[0-9;]*m/g, "");
    try {
      resolve(JSON.parse(rest.slice(rest.indexOf("{"), rest.lastIndexOf("}") + 1)));
    } catch {
      fail("Could not read the tokens from ask-cli's output.");
    }
  });
});

// 3. Get the vendor ID from the Alexa Skill Management API.
const res = await fetch("https://api.amazonalexa.com/v1/vendors", {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
if (!res.ok) fail(`Amazon returned ${res.status}. Open https://developer.amazon.com/alexa/console/ask once, accept the terms, and run again.`);
const { vendors = [] } = await res.json();
if (vendors.length === 0) fail("No developer vendor found. Open https://developer.amazon.com/alexa/console/ask once and run again.");

// 4. Print the values to copy into GitHub secrets.
console.log("\n==================== COPY THESE INTO GITHUB SECRETS ====================");
console.log("https://github.com/altaga/Waypoint/settings/secrets/actions\n");
console.log(`ASK_REFRESH_TOKEN = ${tokens.refresh_token}\n`);
if (vendors.length === 1) {
  console.log(`ASK_VENDOR_ID     = ${vendors[0].id}`);
} else {
  console.log("ASK_VENDOR_ID     = one of these (use the one with ROLE_ADMINISTRATOR):");
  for (const v of vendors) console.log(`  ${v.id}   ${v.name}   ${(v.roles || []).join(", ")}`);
}
console.log("=========================================================================");
console.log("The refresh token is a secret: paste it only into GitHub, then clear this terminal.");
