// Browser smoke test for the simulator (optional; needs Chromium).
// Starts nothing itself: point BASE_URL at a running server (npm start).
// Run: BASE_URL=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/path/to/playwright/index.js npm run smoke:web

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  // Playwright is optional; point PLAYWRIGHT_MODULE at its entry file if it is not in node_modules.
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const chromium = mod.chromium ?? mod.default.chromium;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(`console: ${m.text()}`));

  await page.goto(BASE);
  await page.waitForFunction(() => document.getElementById("connState")?.textContent?.includes("MCP 2025-11-25"), null, { timeout: 15000 });
  console.log("connected");

  await page.click("#demoGroup");
  await page.waitForSelector(".bubble.assistant", { timeout: 10000 });

  const send = async (text: string) => {
    await page.fill("#text", text);
    await page.press("#text", "Enter");
  };

  await send("Can I bring vapes to Singapore?");
  await page.waitForFunction(() => /vape|e-cigarette/i.test(document.getElementById("cards")?.textContent || ""), null, { timeout: 15000 });
  console.log("local rule card shows the vape rule");

  await send("Trip to Japan from December 3 to 10");
  await page.waitForSelector("#apps iframe", { timeout: 15000 });
  console.log("MCP App iframe mounted");

  await page.waitForSelector(".card", { timeout: 5000 });
  console.log("card rendered");

  await browser.close();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("smoke ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
