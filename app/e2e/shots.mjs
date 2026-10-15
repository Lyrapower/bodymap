// README screenshots from the built app with the core fixtures loaded. Run after `npm run build`: node e2e/shots.mjs
import { preview } from "vite";
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const OUT = new URL("../../docs/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
// English by default (GitHub readers); SHOTS_LOCALE=zh-CN for Chinese.
const LOCALE = process.env.SHOTS_LOCALE || "en-US";
const fixtures = JSON.parse(readFileSync(new URL("../../core/fixtures/sample_records.json", import.meta.url)));
const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4175, host: "127.0.0.1" }, logLevel: "error" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LOCALE })).newPage();
await page.goto(server.resolvedUrls.local[0] + "?e2e"); await page.waitForSelector("html[data-ready='1']");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The real model in software GL can take 100+ ms a frame, so fixed sleeps catch sheets and the camera mid-animation.
// Wait until the camera has stopped and no finite CSS transition or animation is running, then two more frames.
const still = async () => {
  await page.waitForFunction(() => !window.__bodymap.viewer.tween
    && document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity && a.playState === "running").length === 0,
    null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const tmp = new URL("./out/_shots.json", import.meta.url).pathname; writeFileSync(tmp, JSON.stringify({ format: "bodymap-backup", schema_version: "1.0", exported_at: "x", records: fixtures }));
await page.locator('.tab[data-t="tab.more"]').click(); await sleep(300);
await page.locator(".sheet.in .hidden-file").setInputFiles(tmp); await sleep(500);
await page.locator('.tab[data-t="tab.history"]').click(); await sleep(400);
await page.locator('.sheet.in .card[data-kind="episode"]').nth(1).click(); await sleep(400);
await page.locator('.sheet.in [data-t="on_body"]').last().click(); await sleep(900); await still();
// this record's mark is on the muscle layer: show that layer so the mark is visible
await page.locator('[data-layer="muscle"]').click(); await page.locator('[data-layer="skin"]').click(); await sleep(300); await still();
await page.screenshot({ path: OUT + "01_body.png" });
await page.locator('.tab[data-t="tab.timeline"]').click(); await sleep(600); await still();
await page.screenshot({ path: OUT + "02_timeline.png" });
await page.locator('.tab[data-t="tab.more"]').click(); await sleep(300);
await page.locator('.sheet.in [data-t="export.doctor"]').click(); await sleep(1500); await still();
await page.screenshot({ path: OUT + "03_doctor_export.png" });
await browser.close(); await new Promise((r) => server.httpServer.close(r));
console.log("wrote docs/01_body.png 02_timeline.png 03_doctor_export.png");
