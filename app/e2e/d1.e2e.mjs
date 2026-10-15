// D1 + D2 end-to-end: records, forms, storage, timeline, history, exports, routing, backup, and the adversarial set
// (empty data, open episodes, long text, 1000 records, bad imports, 12-mark cap). Real build, real browser, touch input.
// Run after `npm run build`:  node e2e/d1.e2e.mjs
import { preview } from "vite";
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FORBIDDEN } from "../../core/export/export.mjs";

const OUT = new URL("./out/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const SCRATCH = new URL("./out/_tmp/", import.meta.url).pathname; mkdirSync(SCRATCH, { recursive: true });
const ui = JSON.parse(readFileSync(new URL("../../core/i18n/ui.json", import.meta.url)));
const fixtures = JSON.parse(readFileSync(new URL("../../core/fixtures/sample_records.json", import.meta.url)));
const launch = { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-background-networking", "--no-first-run"] };
let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { console.log("FAIL watchdog: e2e did not finish in 240 s"); process.exit(2); }, 240000); watchdog.unref();

const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4174, strictPort: false, host: "127.0.0.1" }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ ...launch, timeout: 30000 });
const forbidden = (txt) => FORBIDDEN.filter((re) => re.test(txt)).map(String);

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "zh-CN", acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "?e2e");
  await page.waitForSelector("html[data-ready='1']", { timeout: 60000 });
  const bm = (fn) => page.evaluate(fn);
  const all = () => bm(() => window.__bodymap.records());
  const eff = () => bm(() => window.__bodymap.effective());
  const cur = () => bm(() => window.__bodymap.current());
  const tab = async (k) => { await page.locator(`.tab[data-t="${k}"]`).click(); await sleep(350); };

  // 1. empty state
  ok("1 starts with no records", (await all()).length === 0);
  await tab("tab.history");
  ok("1 history empty text", (await page.locator(".sheet.in").innerText()).includes(ui["history.empty"].zh));
  await tab("tab.timeline");
  ok("1 timeline empty text", (await page.locator(".sheet.in").innerText()).includes(ui["timeline.empty"].zh));
  await tab("tab.map");

  // 2. tap -> record with one mark, saved
  const tapWorld = async (x, y, z) => { const p = await page.evaluate(([x, y, z]) => window.__bodymap.screenOf(x, y, z), [x, y, z]); await page.touchscreen.tap(p.x, p.y); await sleep(500); await page.waitForFunction(() => !window.__bodymap.viewer.tween, null, { timeout: 3000 }).catch(() => {}); await sleep(80); };
  await tapWorld(0.08, 1.35, 0.12);
  let c = await cur();
  ok("2 tap starts an episode with one mark", c && c.kind === "episode" && c.marks.length === 1 && c.ended_at === null, JSON.stringify(c?.marks?.[0]?.location));
  ok("2 record has model_version", typeof c.model_version === "string");
  ok("2 started_at carries a UTC offset", /[+-]\d\d:\d\d$/.test(c.started_at), c.started_at);
  ok("2 readout visible", await page.locator(".readout").isVisible());
  // intensity slider -> new version with supersedes
  await page.locator('.readout input[type="range"]').fill("8"); await sleep(600);
  c = await cur();
  ok("2 intensity 8 saved", c.marks[0].intensity === 8, String(c.marks[0].intensity));
  ok("2 edit is a new version that supersedes", (await all()).length === 2 && c.supersedes, c.supersedes);
  ok("2 effective is still one record", (await eff()).length === 1);
  // shape patch
  await page.locator('.shape-row [data-t="shape.patch"]').click(); await sleep(500);
  c = await cur();
  ok("2 shape patch with radius", c.marks[0].shape === "patch" && c.marks[0].radius > 0, JSON.stringify([c.marks[0].shape, c.marks[0].radius]));
  // second mark on the same record
  await tapWorld(-0.09, 0.62, 0.08);
  c = await cur();
  ok("2 second tap adds to the same record", c.marks.length === 2);
  // line -> "to" via next tap
  await page.locator('.shape-row [data-t="shape.line"]').click(); await sleep(400);
  ok("2 hint asks where it goes", (await page.locator(".hint").innerText()) === ui["mark.to_hint"].zh);
  await tapWorld(0.09, 0.62, 0.08);
  c = await cur();
  ok("2 next tap sets `to`, no third mark", c.marks.length === 2 && c.marks[1].to && c.marks[1].to.part_id, JSON.stringify(c.marks[1].to));
  ok("2 markers on body = marks", (await bm(() => window.__bodymap.viewer.markers.length)) === 2);
  // a drag that starts while a re-frame animation (panel grew, view preset) is running must not be undone by it
  {
    await page.evaluate(() => window.__bodymap.viewer.frameView("full", true)); // same tween the panel re-fit uses
    const c = await page.evaluate(() => window.__bodymap.screenOf(0, 1.0, 0.1));
    const cdp = await page.context().newCDPSession(page);
    const tp = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(c.x, c.y) });
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(c.x + i * 14, c.y) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const az = () => page.evaluate(() => { const v = window.__bodymap.viewer; const d = v.camera.position.clone().sub(v.controls.target); return Math.atan2(d.x, d.z); });
    // the controls have inertia: let the turn finish (two readings 100 ms apart agree) before taking it as "turned".
    // If the re-frame undid the turn, it is back near 0 by then and the first condition fails.
    let turned = await az();
    for (let i = 0; i < 40; i++) { await sleep(100); const a = await az(); if (Math.abs(a - turned) < 0.002) break; turned = a; }
    await sleep(1200); const later = await az();
    ok("2 a turn during the re-frame animation is kept", Math.abs(turned) > 0.05 && Math.abs(later - turned) < 0.2, `turned=${turned.toFixed(3)} later=${later.toFixed(3)}`);
    await page.evaluate(() => window.__bodymap.viewer.faceAzimuth(0));
  }

  // 3. feels like sheet: descriptors + note
  await page.locator('.readout [data-t="feels_like"]').click(); await sleep(400);
  const chips = page.locator(".sheet.in .group .chip");
  await chips.nth(0).click(); await chips.nth(5).click();
  await page.locator(".sheet.in textarea").fill("x".repeat(600));
  await page.locator('.sheet.in [data-t="save"]').click(); await sleep(500);
  c = await cur();
  ok("3 descriptors saved (2)", c.marks[1].descriptors?.length === 2, JSON.stringify(c.marks[1].descriptors));
  ok("3 note capped at 500", c.marks[1].note?.length === 500, String(c.marks[1].note?.length));

  // 4. it passed -> ended_at; details form -> context + mind
  await page.locator('.record-row [data-t="ended"]').click(); await sleep(500);
  c = await cur();
  ok("4 ended_at set", typeof c.ended_at === "string" && c.ended_at >= c.started_at);
  ok("4 record row shows duration, no 'ended' button", (await page.locator('.record-row [data-t="ended"]').count()) === 0);
  await page.locator('.record-row [data-t="details"]').click(); await sleep(400);
  await page.locator('.sheet.in [aria-label="' + ui["context.activity"].zh + '"]').fill("walking");
  await page.locator('.sheet.in [data-t="onset.sudden"]').click();
  await page.locator('.sheet.in [aria-label="' + ui["context.triggers"].zh + '"]').fill("a, b、c");
  await page.locator('.sheet.in [aria-label="' + ui["mind.stress"].zh + '"]').fill("7");
  await page.locator('.sheet.in [data-t="save"]').click(); await sleep(500);
  c = await cur();
  ok("4 context saved", c.context?.activity === "walking" && c.context?.onset === "sudden" && c.context?.triggers?.length === 3, JSON.stringify(c.context));
  ok("4 mind.stress saved, others absent", c.mind?.stress === 7 && c.mind?.mood === undefined, JSON.stringify(c.mind));
  const versions = (await all()).length;
  ok("4 every edit appended, nothing overwritten", versions >= 7 && (await eff()).length === 1, String(versions));

  // 5. new record via "Now": no marks; then visit form
  await page.locator('.record-row [data-t="new_record"]').click(); await sleep(300);
  ok("5 new record clears the body", (await bm(() => window.__bodymap.viewer.markers.length)) === 0 && (await cur()) === null);
  await page.locator('.record-row [data-t="quick"]').click(); await sleep(500);
  c = await cur();
  ok("5 Now = episode with no marks, still open", c && c.marks.length === 0 && c.ended_at === null);
  await page.locator('.record-row [data-t="new_record"]').click(); await sleep(300);
  await page.locator('.record-row [data-t="visit"]').click(); await sleep(400);
  await page.locator('.sheet.in [data-t="save"]').click(); await sleep(300);
  ok("5 visit without department is not saved", (await eff()).filter((r) => r.kind === "visit").length === 0);
  await page.locator(".sheet.in .chips .chip").nth(0).click();
  await page.locator('.sheet.in [aria-label="' + ui["visit.said"].zh + '"]').fill("rest");
  await page.locator('.sheet.in [data-t="tests.add"]').click(); await sleep(200);
  await page.locator('.sheet.in .test input[type="text"]').fill("ECG");
  await page.locator('.sheet.in .test [data-t="result.normal"]').click();
  await page.locator('.sheet.in [data-t="save"]').click(); await sleep(500);
  const visits = (await eff()).filter((r) => r.kind === "visit");
  ok("5 visit saved with department, said, one normal test", visits.length === 1 && visits[0].visit.department === "general" && visits[0].visit.said === "rest" && visits[0].tests?.[0]?.result === "normal", JSON.stringify(visits[0]?.tests));

  // 6. persistence across reload
  await page.reload(); await page.waitForSelector("html[data-ready='1']");
  ok("6 records survive reload", (await eff()).length === 3, String((await eff()).length));
  ok("6 current record not restored after new_record", (await cur()) === null);

  // 7. history + detail + show on body + delete
  await tab("tab.history");
  ok("7 history lists 3 cards", (await page.locator(".sheet.in .card").count()) === 3);
  await page.locator('.sheet.in .card[data-kind="episode"]').last().click(); await sleep(400);
  const detailText = await page.locator(".sheet.in").last().innerText();
  ok("7 detail shows marks and context", detailText.includes("walking") && detailText.includes(ui["context.activity"].zh));
  await page.locator('.sheet.in [data-t="on_body"]').last().click(); await sleep(600);
  ok("7 show on body loads 2 markers", (await bm(() => window.__bodymap.viewer.markers.length)) === 2 && (await cur())?.marks?.length === 2);
  await tab("tab.history");
  await page.locator('.sheet.in .card[data-kind="episode"]').first().click(); await sleep(400);
  const before = (await all()).length;
  await page.locator('.sheet.in [data-t="delete"]').last().click(); await sleep(500);
  ok("7 delete removes every version of that record", (await eff()).length === 2 && (await all()).length < before, `${before} -> ${(await all()).length}`);
  await tab("tab.map");

  // 8. import fixtures as a backup (two episodes 14 days apart -> a gap), then timeline + exports + routing
  const bk = { format: "bodymap-backup", schema_version: "1.0", exported_at: "2026-10-01T00:00:00-07:00", records: fixtures };
  const bkPath = SCRATCH + "fixtures.json"; writeFileSync(bkPath, JSON.stringify(bk));
  await tab("tab.more");
  await page.locator(".sheet.in .hidden-file").setInputFiles(bkPath); await sleep(700);
  ok("8 fixtures imported (6 incl. a superseded one)", (await all()).filter((r) => r.id.startsWith("a1b2c3d4")).length === 6);
  ok("8 toast says imported", (await page.locator(".toast").innerText()).includes(ui["backup.imported"].zh));
  await page.locator(".sheet.in .hidden-file").setInputFiles(bkPath); await sleep(500);
  ok("8 importing again skips duplicates", (await all()).filter((r) => r.id.startsWith("a1b2c3d4")).length === 6 && (await page.locator(".toast").innerText()).includes(ui["backup.skipped"].zh));
  await tab("tab.timeline");
  const dots = await page.locator(".sheet.in .tl .dot").count();
  ok("8 timeline draws one dot per mark", dots >= 6, String(dots));
  ok("8 timeline shows a gap label", (await page.locator(".sheet.in").innerText()).includes(ui["timeline.gap"].zh));
  ok("8 timeline has no connecting lines (dots only)", (await page.locator(".sheet.in .tl path, .sheet.in .tl polyline").count()) === 0);
  await page.locator(".sheet.in .tl .dot").first().click(); await sleep(400);
  ok("8 tapping a dot opens the record", (await page.locator(".sheet.in").count()) === 2);
  await page.screenshot({ path: OUT + "d1_timeline.png" });
  await tab("tab.more");
  await page.locator('.sheet.in [data-t="export.doctor"]').click(); await sleep(1500);
  const doc = page.locator(".sheet.in .print-doc").last();
  ok("8 doctor export has 10 SOCRATES sections", (await doc.locator(".sec").count()) === 10);
  ok("8 doctor export has front and back body figures", (await doc.locator(".figures img").count()) === 2);
  ok("8 doctor figures are real PNGs", (await doc.locator(".figures img").first().getAttribute("src")).startsWith("data:image/png"));
  const docText = await doc.innerText();
  ok("8 doctor export lists ECG under already checked", docText.includes("ECG"));
  ok("8 doctor export has no verdict words", forbidden(docText).length === 0, forbidden(docText).join(","));
  ok("8 doctor export footer: record not diagnosis", docText.includes(ui["footer.record_only"].zh));
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed = document.querySelectorAll("#print-root .print-doc").length; window.dispatchEvent(new Event("afterprint")); }; });
  await page.locator('.sheet.in [data-t="print"]').last().click(); await sleep(300);
  ok("8 print puts the document in #print-root and cleans up", (await bm(() => window.__printed)) === 1 && (await page.locator("#print-root").count()) === 0);
  await page.screenshot({ path: OUT + "d1_doctor_export.png", fullPage: false });
  await tab("tab.more");
  await page.locator('.sheet.in [data-t="export.self"]').click(); await sleep(1500);
  const self = page.locator(".sheet.in .print-doc").last();
  const selfText = await self.innerText();
  ok("8 self export has timeline + gap + visits", (await self.locator(".tl").count()) === 1 && selfText.includes(ui["timeline.gap"].zh) && selfText.includes(ui["export.visits"].zh));
  ok("8 self export has no verdict words", forbidden(selfText).length === 0, forbidden(selfText).join(","));
  await tab("tab.more");
  await page.locator('.sheet.in [data-t="routing.open"]').click(); await sleep(500);
  const rt = await page.locator(".sheet.in").last().innerText();
  ok("8 routing lists entries with a basis", (await page.locator(".sheet.in .entry").count()) >= 1 && rt.includes(ui["routing.basis"].zh));
  ok("8 routing shows the hint and no verdict words", rt.includes(ui["routing.hint"].zh) && forbidden(rt).length === 0, forbidden(rt).join(","));
  ok("8 routing has no red flag line for closed episodes", !rt.includes(ui["footer.emergency"].zh) || (await eff()).some((r) => r.kind === "episode" && !r.ended_at));

  // 9. backup export round-trip
  await tab("tab.more");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator('.sheet.in button[data-t="export.backup"]').click()]);
  const path = await dl.path();
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  ok("9 backup file has format + schema_version + records", parsed.format === "bodymap-backup" && parsed.schema_version === "1.0" && Array.isArray(parsed.records));
  ok("9 backup contains every version (append-only)", parsed.records.length === (await all()).length, `${parsed.records.length} vs ${(await all()).length}`);
  ok("9 backup filename has a date", /bodymap-backup-\d{4}-\d{2}-\d{2}\.json/.test(dl.suggestedFilename()), dl.suggestedFilename());

  // 10. adversarial imports
  const bad = SCRATCH + "bad.json"; writeFileSync(bad, "{not json");
  const n0 = (await all()).length;
  await page.locator(".sheet.in .hidden-file").setInputFiles(bad); await sleep(400);
  ok("10 malformed file: toast, nothing added", (await page.locator(".toast").innerText()) === ui["backup.bad"].zh && (await all()).length === n0);
  const wrong = SCRATCH + "wrong.json"; writeFileSync(wrong, JSON.stringify({ format: "other", records: [{ id: "zzzzzzzz-1", kind: "episode" }] }));
  await page.locator(".sheet.in .hidden-file").setInputFiles(wrong); await sleep(400);
  ok("10 wrong format: nothing added", (await all()).length === n0);
  const dirty = SCRATCH + "dirty.json";
  writeFileSync(dirty, JSON.stringify({ format: "bodymap-backup", schema_version: "1.0", exported_at: "x", records: [
    { schema_version: "1.0", id: "dirty-0001-ok", kind: "episode", created_at: "2026-09-01T10:00:00-07:00", started_at: "2026-09-01T10:00:00-07:00", ended_at: null, marks: [{ location: { part_id: "deltoid", side: "left", local: [0.5, 0.5, 0.5], depth: "skin" }, shape: "point", intensity: 3 }] },
    { schema_version: "1.0", id: "dirty-0002-badlocal", kind: "episode", created_at: "2026-09-01T10:00:00-07:00", started_at: "2026-09-01T10:00:00-07:00", marks: [{ location: { part_id: "deltoid", side: "left", local: [2, 0.5], depth: "skin" }, shape: "point", intensity: 3 }] },
    { schema_version: "1.0", id: "dirty-0003-intensity", kind: "episode", created_at: "2026-09-01T10:00:00-07:00", started_at: "2026-09-01T10:00:00-07:00", marks: [{ location: { part_id: "deltoid", side: "left", local: [0.5, 0.5, 0.5], depth: "skin" }, shape: "point", intensity: 11 }] },
    { schema_version: "1.0", id: "dirty-0004-visit-nodept", kind: "visit", created_at: "2026-09-01T10:00:00-07:00", started_at: "2026-09-01T10:00:00-07:00", visit: {} },
    { schema_version: "2.0", id: "dirty-0005-version", kind: "note", created_at: "2026-09-01T10:00:00-07:00", started_at: "2026-09-01T10:00:00-07:00" },
    "not an object", null, 42,
  ] }));
  await page.locator(".sheet.in .hidden-file").setInputFiles(dirty); await sleep(500);
  ok("10 dirty backup: only the valid record is kept", (await all()).length === n0 + 1 && (await all()).some((r) => r.id === "dirty-0001-ok"));

  // 11. 1000 records, long text, all open, 12-mark cap
  const many = SCRATCH + "many.json";
  const mk = (i) => ({ schema_version: "1.0", id: `many-${String(i).padStart(6, "0")}-xx`, kind: "episode", created_at: new Date(2025, 0, 1 + (i % 300), i % 24).toISOString(), started_at: new Date(2025, 0, 1 + (i % 300), i % 24).toISOString(), ended_at: null, note: "n".repeat(2000), marks: Array.from({ length: 12 }, (_, k) => ({ location: { part_id: k % 2 ? "deltoid" : "rectus_femoris", side: k % 3 ? "left" : "right", local: [0.5, 0.5, 0.5], depth: "skin" }, shape: "point", intensity: i % 11, note: "m".repeat(500) })), mind: { stress: i % 11, mood: null, sleep_hours: (i % 29) / 2 } });
  writeFileSync(many, JSON.stringify({ format: "bodymap-backup", schema_version: "1.0", exported_at: "x", records: Array.from({ length: 1000 }, (_, i) => mk(i)) }));
  const tImp = Date.now();
  await page.locator(".sheet.in .hidden-file").setInputFiles(many); await sleep(800);
  ok("11 1000 records imported", (await all()).filter((r) => r.id.startsWith("many-")).length === 1000, `${Date.now() - tImp} ms`);
  let t1 = Date.now(); await tab("tab.history"); const nCards = await page.locator(".sheet.in .card").count();
  ok("11 history renders 1000+ cards", nCards >= 1000, `${nCards} cards in ${Date.now() - t1} ms`);
  t1 = Date.now(); await tab("tab.timeline"); const nDots = await page.locator(".sheet.in .tl .dot").count();
  ok("11 timeline renders 12k dots", nDots >= 12000, `${nDots} dots in ${Date.now() - t1} ms`);
  t1 = Date.now(); await tab("tab.more"); await page.locator('.sheet.in [data-t="export.doctor"]').click(); await sleep(2500);
  const bigDoc = await page.locator(".sheet.in .print-doc").last().innerText();
  ok("11 doctor export: nothing after the last visit -> falls back to all, 1000+ episodes, no verdict words", bigDoc.includes(ui["export.all"].zh) && /100\d /.test(bigDoc) && forbidden(bigDoc).length === 0, `${Date.now() - t1} ms`);
  t1 = Date.now(); await tab("tab.more"); await page.locator('.sheet.in [data-t="export.self"]').click(); await sleep(3000);
  const bigSelf = await page.locator(".sheet.in .print-doc").last().innerText();
  const stillN = Number((bigSelf.match(new RegExp(ui["export.still"].zh + " (\\d+)")) || [])[1]);
  ok("11 self export on 1000 open episodes counts them as still here", stillN >= 1000 && forbidden(bigSelf).length === 0, `still=${stillN} in ${Date.now() - t1} ms`);
  await tab("tab.more"); await page.locator('.sheet.in [data-t="routing.open"]').click(); await sleep(800);
  const rt2 = await page.locator(".sheet.in").last().innerText();
  ok("11 routing with 1000 open episodes shows the emergency line only with a red flag", !rt2.includes(ui["footer.emergency"].zh) || (await page.locator(".sheet.in .flag li").count()) > 0);
  await tab("tab.map");
  // 12-mark cap on a fresh record
  if (await page.locator('.record-row [data-t="new_record"]').count()) { await page.locator('.record-row [data-t="new_record"]').click(); await sleep(300); }
  await page.locator('.record-row [data-t="quick"]').click(); await sleep(400);
  for (let i = 0; i < 13; i++) { await tapWorld(-0.06 + (i % 5) * 0.03, 1.2 + Math.floor(i / 5) * 0.08, 0.12); }
  await sleep(600);
  c = await cur();
  ok("11 a record holds at most 12 marks", c.marks.length <= 12 && (await bm(() => window.__bodymap.viewer.markers.length)) <= 12, `${c.marks.length} marks`);

  // 12. language: whole sheets switch to en, no CJK left, no verdict words
  await page.locator('.record-row [data-t="new_record"]').click(); await sleep(200);
  await page.locator(".lang").click(); await sleep(300);
  await tab("tab.more");
  const moreEn = await page.locator(".sheet.in").innerText();
  ok("12 More sheet in English, no CJK", !/[㐀-鿿]/.test(moreEn.replace("中文", "")) && moreEn.includes(ui["export.backup"].en), (moreEn.match(/[㐀-鿿]+/g) || []).join(","));
  ok("12 no verdict words anywhere in the More sheet", forbidden(moreEn).length === 0, forbidden(moreEn).join(","));
  await page.screenshot({ path: OUT + "d1_more_en.png" });
  await tab("tab.map");
  ok("12 no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  ok("e2e run without exception", false, String(e?.stack || e));
} finally {
  await browser.close().catch(() => {});
  await new Promise((r) => server.httpServer.close(r));
}
console.log(`\n${fails === 0 ? "all passed" : fails + " failed"}`);
process.exit(fails ? 1 : 0);
