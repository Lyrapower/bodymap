// D1 + D2 end-to-end on WebKit (Safari's engine) through WebKitWebDriver, touch input, 390×844.
// Sections 1–9 of d1.e2e.mjs (record flow, forms, persistence, history, timeline, both exports, routing, backup).
// Sections 10–11 (bad imports, 1000 records) are Chromium-only.
//   npm run build
//   e2e/run-webkit.sh 390x844 d1          (runs this file inside a phone-sized X screen)
// Where WebDriver differs from Playwright:
//   file import  -> a real File is built in the page and handed to the hidden <input type=file> (DataTransfer)
//   download     -> the page's <a download> click is captured and the blob is read back
//   confirm()    -> answered yes in the page (WebDriver alerts would block the run)
import { preview } from "vite";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FORBIDDEN } from "../../core/export/export.mjs";

const OUT = new URL("./out/webkit/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const ui = JSON.parse(readFileSync(new URL("../../core/i18n/ui.json", import.meta.url)));
const fixtures = JSON.parse(readFileSync(new URL("../../core/fixtures/sample_records.json", import.meta.url)));
const BROWSER = process.env.WEBKIT_BROWSER || "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser";
const PORT = 4445;
let fails = 0, passes = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); cond ? passes++ : fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("FAIL watchdog: did not finish in 600 s"); process.exit(2); }, 600000).unref();
const forbidden = (txt) => FORBIDDEN.filter((re) => re.test(txt)).map(String);

const driver = spawn("WebKitWebDriver", [`--port=${PORT}`], { stdio: "ignore" });
const wd = async (method, path, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${method} ${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
};
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/status`); break; } catch { await sleep(100); } }
const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4175, strictPort: false, host: "127.0.0.1" }, logLevel: "error" });
const base = server.resolvedUrls.local[0];

let S, id;
const exec = (fn, ...args) => wd("POST", S("/execute/sync"), { script: `return (${fn}).apply(null, arguments)`, args });
const execAsync = (fn, ...args) => wd("POST", S("/execute/async"), { script: `const done = arguments[arguments.length-1]; Promise.resolve((${fn}).apply(null, Array.from(arguments).slice(0,-1))).then(done, (e)=>done({__err:String(e)}))`, args });
// n: index, negative counts from the end (-1 = last), like Playwright's .last()
const rect = (css, n = 0) => exec((css, n) => {
  const els = [...document.querySelectorAll(css)]; const el = els[n < 0 ? els.length + n : n];
  if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, css, n);
async function touch(x, y) {
  await wd("POST", S("/actions"), { actions: [{ type: "pointer", id: "t1", parameters: { pointerType: "touch" }, actions: [
    { type: "pointerMove", x: Math.round(x), y: Math.round(y), duration: 0 }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 50 }, { type: "pointerUp", button: 0 }] }] });
  await wd("DELETE", S("/actions"));
}
async function tapEl(css, n = 0) { const r = await rect(css, n); if (!r) throw new Error("no element " + css + " #" + n); await touch(r.x, r.y); await sleep(200); }
async function typeIn(css, text, n = 0) {
  const ids = await wd("POST", S("/elements"), { using: "css selector", value: css });
  const e = Object.values(ids[n < 0 ? ids.length + n : n])[0];
  await wd("POST", S(`/element/${e}/clear`), {});
  await wd("POST", S(`/element/${e}/value`), { text });
}
const setRange = (css, v) => exec((css, v) => { const el = document.querySelector(css); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, css, v);
const count = (css) => exec((css) => document.querySelectorAll(css).length, css);
const text = (css, n = 0) => exec((css, n) => { const els = [...document.querySelectorAll(css)]; return els[n < 0 ? els.length + n : n]?.innerText ?? ""; }, css, n);
const bm = (expr) => exec(new Function(`return (${expr})`));
const all = () => bm("window.__bodymap.records()");
const eff = () => bm("window.__bodymap.effective()");
const cur = () => bm("window.__bodymap.current()");
const idle = async () => { for (let i = 0; i < 200; i++) { if (await exec(() => !window.__bodymap.viewer.tween)) return; await sleep(100); } };
const tab = async (k) => { await tapEl(`.tab[data-t="${k}"]`); await sleep(350); };
const tapWorld = async (x, y, z) => { await idle(); const p = await exec((x, y, z) => window.__bodymap.screenOf(x, y, z), x, y, z); await touch(p.x, p.y); await sleep(500); await idle(); await sleep(80); };
const importJson = (obj, name) => exec((txt, name) => {
  const input = [...document.querySelectorAll(".sheet.in .hidden-file")].pop();
  const dt = new DataTransfer(); dt.items.add(new File([txt], name, { type: "application/json" }));
  input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); return input.files.length;
}, typeof obj === "string" ? obj : JSON.stringify(obj), name);
const ready = async () => { for (let i = 0; i < 600; i++) { if ((await exec(() => document.documentElement.dataset.ready)) === "1") return true; await sleep(100); } return false; };
const hooks = () => exec(() => {
  window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));
  window.confirm = () => true;
  window.__downloads = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push({ href: this.href, name: this.download }); return; } return orig.call(this); };
});

try {
  const s = await wd("POST", "/session", { capabilities: { alwaysMatch: { "webkitgtk:browserOptions": { binary: BROWSER, args: ["--automation", "--full-screen", "--enable-webgl=true"] } } } });
  id = s.sessionId; S = (p) => `/session/${id}${p}`;
  await wd("POST", S("/url"), { url: base + "?e2e" });
  await exec(() => { localStorage.clear(); localStorage.setItem("bodymap.locale", "zh"); });
  await wd("POST", S("/refresh"), {});
  ok("0 model loaded on WebKit", await ready());
  const vp = await exec(() => [innerWidth, innerHeight]);
  ok("0 viewport 390×844", vp[0] === 390 && vp[1] === 844, vp.join("×"));
  await hooks();

  // 1. empty state
  ok("1 starts with no records", (await all()).length === 0, String((await all()).length));
  await tab("tab.history");
  ok("1 history empty text", (await text(".sheet.in")).includes(ui["history.empty"].zh));
  await tab("tab.timeline");
  ok("1 timeline empty text", (await text(".sheet.in")).includes(ui["timeline.empty"].zh));
  await tab("tab.map");

  // 2. tap -> record with one mark, saved
  await tapWorld(0.08, 1.35, 0.12);
  let c = await cur();
  ok("2 tap starts an episode with one mark", c && c.kind === "episode" && c.marks.length === 1 && c.ended_at === null, JSON.stringify(c?.marks?.[0]?.location));
  ok("2 record has model_version", typeof c?.model_version === "string", c?.model_version);
  ok("2 started_at carries a UTC offset", /[+-]\d\d:\d\d$/.test(c?.started_at ?? ""), c?.started_at);
  ok("2 readout visible", await exec(() => { const r = document.querySelector(".readout"); return !!r && r.offsetParent !== null && !r.hidden; }));
  await setRange('.readout input[type="range"]', 8); await sleep(600);
  c = await cur();
  ok("2 intensity 8 saved", c.marks[0].intensity === 8, String(c.marks[0].intensity));
  ok("2 edit is a new version that supersedes", (await all()).length === 2 && !!c.supersedes, c.supersedes);
  ok("2 effective is still one record", (await eff()).length === 1);
  await tapEl('.shape-row [data-t="shape.patch"]'); await sleep(500);
  c = await cur();
  ok("2 shape patch with radius", c.marks[0].shape === "patch" && c.marks[0].radius > 0, JSON.stringify([c.marks[0].shape, c.marks[0].radius]));
  await tapWorld(-0.09, 0.62, 0.08);
  c = await cur();
  ok("2 second tap adds to the same record", c.marks.length === 2);
  await tapEl('.shape-row [data-t="shape.line"]'); await sleep(400);
  ok("2 hint asks where it goes", (await text(".hint")) === ui["mark.to_hint"].zh, await text(".hint"));
  await tapWorld(0.09, 0.62, 0.08);
  c = await cur();
  ok("2 next tap sets `to`, no third mark", c.marks.length === 2 && !!c.marks[1].to?.part_id, JSON.stringify(c.marks[1].to));
  ok("2 markers on body = marks", (await bm("window.__bodymap.viewer.markers.length")) === 2);
  await wd("GET", S("/screenshot")).then((b) => writeFileSync(OUT + "d1_01_marks.png", Buffer.from(b, "base64")));

  // 3. feels like sheet: descriptors + note
  await tapEl('.readout [data-t="feels_like"]'); await sleep(400);
  await tapEl(".sheet.in .group .chip", 0); await tapEl(".sheet.in .group .chip", 5);
  await typeIn(".sheet.in textarea", "x".repeat(600));
  await tapEl('.sheet.in [data-t="save"]', -1); await sleep(500);
  c = await cur();
  ok("3 descriptors saved (2)", c.marks[1].descriptors?.length === 2, JSON.stringify(c.marks[1].descriptors));
  ok("3 note capped at 500", c.marks[1].note?.length === 500, String(c.marks[1].note?.length));

  // 4. it passed -> ended_at; details form -> context + mind
  await tapEl('.record-row [data-t="ended"]'); await sleep(500);
  c = await cur();
  ok("4 ended_at set", typeof c.ended_at === "string" && c.ended_at >= c.started_at);
  ok("4 record row shows duration, no 'ended' button", (await count('.record-row [data-t="ended"]')) === 0);
  await tapEl('.record-row [data-t="details"]'); await sleep(400);
  await typeIn(`.sheet.in [aria-label="${ui["context.activity"].zh}"]`, "walking");
  await tapEl('.sheet.in [data-t="onset.sudden"]');
  await typeIn(`.sheet.in [aria-label="${ui["context.triggers"].zh}"]`, "a, b、c");
  await setRange(`.sheet.in [aria-label="${ui["mind.stress"].zh}"]`, 7);
  await tapEl('.sheet.in [data-t="save"]', -1); await sleep(500);
  c = await cur();
  ok("4 context saved", c.context?.activity === "walking" && c.context?.onset === "sudden" && c.context?.triggers?.length === 3, JSON.stringify(c.context));
  ok("4 mind.stress saved, others absent", c.mind?.stress === 7 && c.mind?.mood === undefined, JSON.stringify(c.mind));
  const versions = (await all()).length;
  ok("4 every edit appended, nothing overwritten", versions >= 7 && (await eff()).length === 1, String(versions));

  // 5. new record via "Now": no marks; then visit form
  await tapEl('.record-row [data-t="new_record"]'); await sleep(300);
  ok("5 new record clears the body", (await bm("window.__bodymap.viewer.markers.length")) === 0 && (await cur()) === null);
  await tapEl('.record-row [data-t="quick"]'); await sleep(500);
  c = await cur();
  ok("5 Now = episode with no marks, still open", c && c.marks.length === 0 && c.ended_at === null);
  await tapEl('.record-row [data-t="new_record"]'); await sleep(300);
  await tapEl('.record-row [data-t="visit"]'); await sleep(400);
  await tapEl('.sheet.in [data-t="save"]', -1); await sleep(300);
  ok("5 visit without department is not saved", (await eff()).filter((r) => r.kind === "visit").length === 0);
  await tapEl(".sheet.in .chips .chip", 0);
  await typeIn(`.sheet.in [aria-label="${ui["visit.said"].zh}"]`, "rest");
  await tapEl('.sheet.in [data-t="tests.add"]'); await sleep(200);
  await typeIn('.sheet.in .test input[type="text"]', "ECG");
  await tapEl('.sheet.in .test [data-t="result.normal"]');
  await tapEl('.sheet.in [data-t="save"]', -1); await sleep(500);
  const visits = (await eff()).filter((r) => r.kind === "visit");
  ok("5 visit saved with department, said, one normal test", visits.length === 1 && visits[0].visit.department === "general" && visits[0].visit.said === "rest" && visits[0].tests?.[0]?.result === "normal", JSON.stringify(visits[0]?.tests));

  // 6. persistence across reload (IndexedDB in WebKit)
  await wd("POST", S("/refresh"), {}); await ready(); await hooks();
  ok("6 records survive reload", (await eff()).length === 3, String((await eff()).length));
  ok("6 current record not restored after new_record", (await cur()) === null);

  // 7. history + detail + show on body + delete
  await tab("tab.history");
  ok("7 history lists 3 cards", (await count(".sheet.in .card")) === 3);
  await tapEl('.sheet.in .card[data-kind="episode"]', -1); await sleep(400);
  const detailText = await text(".sheet.in", -1);
  ok("7 detail shows marks and context", detailText.includes("walking") && detailText.includes(ui["context.activity"].zh));
  await tapEl('.sheet.in [data-t="on_body"]', -1); await sleep(600); await idle();
  ok("7 show on body loads 2 markers", (await bm("window.__bodymap.viewer.markers.length")) === 2 && (await cur())?.marks?.length === 2);
  await tab("tab.history");
  await tapEl('.sheet.in .card[data-kind="episode"]', 0); await sleep(400);
  const before = (await all()).length;
  await tapEl('.sheet.in [data-t="delete"]', -1); await sleep(500);
  ok("7 delete removes every version of that record", (await eff()).length === 2 && (await all()).length < before, `${before} -> ${(await all()).length}`);
  await tab("tab.map");

  // 8. import fixtures as a backup, then timeline + exports + routing
  const bk = { format: "bodymap-backup", schema_version: "1.0", exported_at: "2026-10-01T00:00:00-07:00", records: fixtures };
  await tab("tab.more");
  ok("8 file handed to the input", (await importJson(bk, "fixtures.json")) === 1); await sleep(900);
  ok("8 fixtures imported (6 incl. a superseded one)", (await all()).filter((r) => r.id.startsWith("a1b2c3d4")).length === 6);
  ok("8 toast says imported", (await text(".toast")).includes(ui["backup.imported"].zh), await text(".toast"));
  await importJson(bk, "fixtures.json"); await sleep(700);
  ok("8 importing again skips duplicates", (await all()).filter((r) => r.id.startsWith("a1b2c3d4")).length === 6 && (await text(".toast")).includes(ui["backup.skipped"].zh));
  await tab("tab.timeline");
  const dots = await count(".sheet.in .tl .dot");
  ok("8 timeline draws one dot per mark", dots >= 6, String(dots));
  ok("8 timeline shows a gap label", (await text(".sheet.in")).includes(ui["timeline.gap"].zh));
  ok("8 timeline has no connecting lines (dots only)", (await count(".sheet.in .tl path, .sheet.in .tl polyline")) === 0);
  await tapEl(".sheet.in .tl .dot", 0); await sleep(400);
  ok("8 tapping a dot opens the record", (await count(".sheet.in")) === 2);
  await wd("GET", S("/screenshot")).then((b) => writeFileSync(OUT + "d1_02_timeline.png", Buffer.from(b, "base64")));
  await tab("tab.more");
  await tapEl('.sheet.in [data-t="export.doctor"]'); await sleep(2500);
  ok("8 doctor export has 10 SOCRATES sections", (await exec(() => [...document.querySelectorAll(".sheet.in .print-doc")].pop()?.querySelectorAll(".sec").length)) === 10);
  ok("8 doctor export has front and back body figures", (await exec(() => [...document.querySelectorAll(".sheet.in .print-doc")].pop()?.querySelectorAll(".figures img").length)) === 2);
  ok("8 doctor figures are real PNGs", (await exec(() => [...document.querySelectorAll(".sheet.in .print-doc")].pop()?.querySelector(".figures img")?.getAttribute("src") ?? "")).startsWith("data:image/png"));
  const docText = await text(".sheet.in .print-doc", -1);
  ok("8 doctor export lists ECG under already checked", docText.includes("ECG"));
  ok("8 doctor export has no verdict words", forbidden(docText).length === 0, forbidden(docText).join(","));
  ok("8 doctor export footer: record not diagnosis", docText.includes(ui["footer.record_only"].zh));
  await exec(() => { window.__printed = 0; window.print = () => { window.__printed = document.querySelectorAll("#print-root .print-doc").length; window.dispatchEvent(new Event("afterprint")); }; });
  await tapEl('.sheet.in [data-t="print"]', -1); await sleep(400);
  ok("8 print puts the document in #print-root and cleans up", (await bm("window.__printed")) === 1 && (await count("#print-root")) === 0);
  await wd("GET", S("/screenshot")).then((b) => writeFileSync(OUT + "d1_03_doctor_export.png", Buffer.from(b, "base64")));
  await tab("tab.more");
  await tapEl('.sheet.in [data-t="export.self"]'); await sleep(2500);
  const selfText = await text(".sheet.in .print-doc", -1);
  ok("8 self export has timeline + gap + visits", (await exec(() => [...document.querySelectorAll(".sheet.in .print-doc")].pop()?.querySelectorAll(".tl").length)) === 1 && selfText.includes(ui["timeline.gap"].zh) && selfText.includes(ui["export.visits"].zh));
  ok("8 self export has no verdict words", forbidden(selfText).length === 0, forbidden(selfText).join(","));
  await tab("tab.more");
  await tapEl('.sheet.in [data-t="routing.open"]'); await sleep(600);
  const rt = await text(".sheet.in", -1);
  ok("8 routing lists entries with a basis", (await count(".sheet.in .entry")) >= 1 && rt.includes(ui["routing.basis"].zh));
  ok("8 routing shows the hint and no verdict words", rt.includes(ui["routing.hint"].zh) && forbidden(rt).length === 0, forbidden(rt).join(","));
  ok("8 routing has no red flag line for closed episodes", !rt.includes(ui["footer.emergency"].zh) || (await eff()).some((r) => r.kind === "episode" && !r.ended_at));

  // 9. backup export round-trip
  await tab("tab.more");
  await exec(() => { window.__downloads = []; });
  await tapEl('.sheet.in button[data-t="export.backup"]'); await sleep(600);
  const dl = await execAsync(() => { const d = window.__downloads.pop(); return d ? fetch(d.href).then((r) => r.text()).then((t) => ({ name: d.name, text: t })) : null; });
  ok("9 a backup download was offered", !!dl?.name, JSON.stringify(dl?.name));
  const parsed = dl?.text ? JSON.parse(dl.text) : {};
  ok("9 backup file has format + schema_version + records", parsed.format === "bodymap-backup" && parsed.schema_version === "1.0" && Array.isArray(parsed.records));
  ok("9 backup contains every version (append-only)", parsed.records?.length === (await all()).length, `${parsed.records?.length} vs ${(await all()).length}`);
  ok("9 backup filename has a date", /bodymap-backup-\d{4}-\d{2}-\d{2}\.json/.test(dl?.name ?? ""), dl?.name);

  const errs = await bm("window.__errs");
  ok("page raised no errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await wd("DELETE", S(""));
} catch (e) {
  ok("webkit d1 run without exception", false, String(e?.stack || e).slice(0, 700));
} finally {
  driver.kill();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(`\n${passes}/${passes + fails} passed (WebKit, touch)`);
process.exit(fails ? 1 : 0);
