// Accessibility end-to-end: real build, real preview server, phone viewport, English and Chinese.
// Run after `npm run build`:  node e2e/a11y.e2e.mjs
// Fails on (1) any axe-core violation of impact "critical" or "serious" (WCAG 2.2 A/AA + best practice), and
// (2) any visible chip, button, tab or back link that a finger cannot hit across at least 44px tall
//     (probed with elementFromPoint 21px above and below its centre, so the invisible hit area counts, not the drawn pill).
// Screens: home, mark panel, "feels like" sheet, more, timeline, history, the clinician page.
import { preview } from "vite";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const launch = {
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-background-networking", "--no-first-run"],
};
const BACKUP = {
  format: "bodymap-backup", schema_version: "1.0", exported_at: "2026-10-18T12:00:00-07:00",
  records: [
    { schema_version: "1.0", id: "a11y-0000-4000-8000-000000000001", kind: "visit", created_at: "2026-09-14T16:10:00-07:00", started_at: "2026-09-14T15:20:00-07:00",
      visit: { department: "general", said: "Come back if it gets worse." }, tests: [{ name: "X-ray", result: "normal", date: "2026-09-14" }] },
    ...[["09-15", 3], ["09-21", 4], ["10-01", 6], ["10-14", 7]].map(([d, i], k) => ({
      schema_version: "1.0", id: `a11y-0000-4000-8000-00000000001${k}`, kind: "episode", created_at: `2026-${d}T23:40:00-07:00`, started_at: `2026-${d}T22:40:00-07:00`, ended_at: `2026-${d}T23:40:00-07:00`,
      model_version: "z-anatomy-2024-v1",
      marks: [{ location: { part_id: "deltoid", side: "left", local: [0.54, 0.67, 1], depth: "skin", view: "anterior" }, shape: "point", intensity: i, descriptors: ["aching"] }],
      mind: { stress: 5, mood: 4, sleep_hours: 5 } })),
  ],
};

let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4183, host: "127.0.0.1" }, logLevel: "error" });
const browser = await chromium.launch(launch);
const backupPath = new URL("./out/a11y-backup.json", import.meta.url).pathname;
(await import("node:fs")).mkdirSync(new URL("./out/", import.meta.url).pathname, { recursive: true });
(await import("node:fs")).writeFileSync(backupPath, JSON.stringify(BACKUP));

for (const locale of ["en-US", "zh-CN"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(server.resolvedUrls.local[0] + "?e2e");
  await page.waitForSelector("html[data-ready='1']");
  const still = () => page.waitForFunction(() => !window.__bodymap.viewer.tween
    && document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity && a.playState === "running").length === 0, null, { timeout: 60000 });
  await still();
  await page.addScriptTag({ content: AXE });

  const check = async (screen) => {
    const bad = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
      return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}×${v.nodes.length} (${v.nodes[0].target.join(" ")})`);
    });
    ok(`${locale} ${screen}: no critical/serious axe violations`, bad.length === 0, bad.join("; "));
    const small = await page.evaluate(() => {
      const top = [...document.querySelectorAll(".sheet.in")].pop() || null;   // only what is in front can be touched
      return [...document.querySelectorAll(".chip, .btn, .tab, .back")]
        .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top > 22 && b.bottom < innerHeight - 22 && getComputedStyle(e).visibility !== "hidden"
          && (!top || top.contains(e) || e.closest(".tabs")); })
        .filter((e) => {
          const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
          const hits = [cy - 21, cy + 21].map((y) => { const t = document.elementFromPoint(cx, y); return !!t && (t === e || e.contains(t)); });
          return !hits.every(Boolean);
        })
        .map((e) => `${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().height)}px`);
    });
    ok(`${locale} ${screen}: every chip/button/tab hits ≥44px tall`, small.length === 0, small.slice(0, 8).join(", "));
  };

  await check("home");
  await page.locator('[data-t="view.upper"]').click(); await sleep(300); await still();
  const p = await page.evaluate(() => window.__bodymap.screenOf(0.166, 1.367, 0.024));
  await page.touchscreen.tap(p.x, p.y); await sleep(400); await still();
  await check("mark panel");
  await page.locator('.panel [data-t="feels_like"]').click(); await sleep(600); await still();
  await check("feels-like sheet");
  await page.locator(".sheet.in .back").last().click(); await sleep(500);
  await page.locator('.tab[data-t="tab.more"]').click(); await sleep(500);
  await page.locator(".sheet.in .hidden-file").setInputFiles(backupPath); await sleep(3500);
  await check("more");
  await page.locator('.tab[data-t="tab.timeline"]').click(); await sleep(1500); await still();
  await check("timeline");
  await page.locator('.tab[data-t="tab.history"]').click(); await sleep(800); await still();
  await check("history");
  await page.locator('.tab[data-t="tab.more"]').click(); await sleep(500);
  await page.locator('.sheet.in [data-t="export.doctor"]').click(); await sleep(1500); await still();
  await check("clinician page");
  await ctx.close();
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(fails ? `\n${fails} check(s) failed` : "\nall a11y checks passed");
process.exit(fails ? 1 : 0);
