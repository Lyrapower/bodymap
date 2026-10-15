// D0 end-to-end: real build, real preview server, real pointer/touch input on a phone-sized viewport.
// Run after `npm run build`:  node e2e/d0.e2e.mjs
// Engine: Chromium by default (CI sandbox). On a Mac with Playwright's WebKit installed:  E2E_ENGINE=webkit node e2e/d0.e2e.mjs
// Exits 0 only if every check passes. Screenshots go to e2e/out/.
import { preview } from "vite";
import { chromium, webkit } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { FORBIDDEN } from "../../core/export/export.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const ui = JSON.parse(readFileSync(new URL("../../core/i18n/ui.json", import.meta.url)));
const pending = JSON.parse(readFileSync(new URL("../src/i18n/ui.pending.json", import.meta.url)));
const engine = process.env.E2E_ENGINE === "webkit" ? webkit : chromium;
const launch = process.env.E2E_ENGINE === "webkit" ? {} : {
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--disable-sync"],
};

let fails = 0;
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fails++; };
const OVERLAP = () => {
  const r = (q) => document.querySelector(q).getBoundingClientRect();
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const P = r(".panel"), F = r(".foot-note"), B = r(".brand"), L = r(".lang");
  const out = [];
  if (hit(P, F)) out.push("panel×footer");
  if (hit(P, B)) out.push("panel×header");
  if (hit(B, L)) out.push("brand×lang");
  if (F.bottom > innerHeight + 0.5) out.push("footer below screen");
  const S = document.querySelector(".rec-state");
  if (S) for (const b of document.querySelectorAll(".rec-actions .btn")) if (hit(S.getBoundingClientRect(), b.getBoundingClientRect())) { out.push("record state×button"); break; }
  const bm = window.__bodymap; const feet = bm && bm.screenOf(0.105, 0.0, 0.05);
  if (feet && feet.y > r(".hint").top) out.push(`feet under hint (${Math.round(feet.y)}>${Math.round(r(".hint").top)})`);
  return out;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { console.log("FAIL watchdog: e2e did not finish in 300 s"); process.exit(2); }, 300000); // real model: ~0.5 M triangles in software GL
watchdog.unref();

const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4173, strictPort: false, host: "127.0.0.1" }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
const stage = (m) => console.log("· " + m);
stage("preview up " + base);
// Sandbox Chromium sometimes never finishes launching; give it 30 s and one retry instead of hanging.
let browser;
for (let attempt = 1; !browser; attempt++) {
  try { browser = await engine.launch({ ...launch, timeout: 30000 }); }
  catch (e) { console.log(`· launch attempt ${attempt} failed: ${String(e).split("\n")[0]}`); if (attempt >= 2) { await new Promise((r) => server.httpServer.close(r)); process.exit(2); } }
}
stage("browser launched");

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "zh-CN", reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  const tNav = Date.now();
  await page.goto(base + "?e2e=1");
  stage("page loaded");
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 30000 });
  } catch (e) {
    const diag = await page.evaluate(() => ({ ds: { ...document.documentElement.dataset }, status: document.querySelector(".status")?.textContent, rs: document.readyState })).catch((x) => String(x));
    console.log("DIAG", JSON.stringify(diag), "errors:", JSON.stringify(errors), "requests:", JSON.stringify(requests.map((u) => u.replace(origin, ""))));
    throw e;
  }
  const loadMs = Date.now() - tNav;
  ok("model loaded", true, `nav→ready ${loadMs} ms (sandbox, software GL; not a phone number)`);
  // the model the app is configured to load (src/config.ts, the uncommented MODEL line)
  const cfgParts = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8").split("\n").find((l) => /^export const MODEL/.test(l)).match(/model\/([\w.-]+\.parts\.json)/)[1];
  const wantVersion = JSON.parse(readFileSync(new URL(`../public/model/${cfgParts}`, import.meta.url))).model_version;
  ok("model version from parts file", (await page.evaluate(() => window.__bodymap.modelVersion())) === wantVersion, wantVersion);
  await sleep(400);
  await page.screenshot({ path: OUT + "01_loaded_zh.png" });

  // static UI contract
  const footer = await page.locator(".foot-note").innerText();
  ok("footer line 1 (footer.record_only)", footer.includes(ui["footer.record_only"].zh));
  ok("footer line 2 (footer.emergency)", footer.includes(ui["footer.emergency"].zh));
  ok("built with line", (await page.locator(".built").innerText()) === ui["built_with"].zh);
  ok("no anthropic logo / image assets", (await page.locator("img, svg").count()) === 0);

  // the body re-frames with a tween; with ~0.5 M triangles in software GL a frame can take 100+ ms, so wait for the tween itself
  const idle = () => page.waitForFunction(() => !window.__bodymap.viewer.tween, null, { timeout: 20000 });
  const settle = async () => {
    let h = -1;
    for (let i = 0; i < 40; i++) {
      await idle(); await sleep(250);
      const nh = await page.evaluate(() => Math.round(document.querySelector(".panel")?.getBoundingClientRect().height ?? 0));
      if (nh === h && (await page.evaluate(() => !window.__bodymap.viewer.tween))) return;
      h = nh;
    }
  };
  // Turn to an azimuth and make sure it stuck. A re-frame tween that starts after a tap (panel grows, D1) keeps the old direction
  // and can undo the turn; that is reported to the app owner, the test only needs the camera where it asked for it.
  let refitUndidTurn = 0;
  const face = async (r) => {
    for (let i = 0; i < 4; i++) {
      await idle(); await page.evaluate((r) => window.__bodymap.faceAzimuth(r), r); await sleep(400); await idle();
      const az = await page.evaluate(() => { const v = window.__bodymap.viewer; const d = v.camera.position.clone().sub(v.controls.target); return Math.atan2(d.x, d.z); });
      if (Math.abs(Math.atan2(Math.sin(az - r), Math.cos(az - r))) < 0.05) return;
      refitUndidTurn++;
    }
  };
  const tapWorld = async (x, y, z) => {
    await settle();
    const p = await page.evaluate(([x, y, z]) => window.__bodymap.screenOf(x, y, z), [x, y, z]);
    await page.touchscreen.tap(p.x, p.y);
    await sleep(120);
    // D1: the panel grows when a record opens and the body re-frames (650 ms). The resize, and so the re-frame, can start
    // after a first idle check; wait until the panel height holds still and no tween runs, so the next screenOf is current.
    await settle();
    await sleep(80);
    return p;
  };
  const picks = () => page.evaluate(() => window.__bodymap.picks());
  const lastPick = async () => (await picks()).at(-1);
  const expectPick = async (name, want) => {
    const p = await lastPick();
    const l = p?.location ?? {};
    const pass = p && Object.entries(want).every(([k, v]) => l[k] === v);
    ok(name, pass, pass ? `local=${JSON.stringify(l.local)} view=${l.view}` : `got ${JSON.stringify(l)}`);
    return p;
  };

  // A. skin on: front of left chest -> named by the muscle underneath, depth skin
  await tapWorld(0.08, 1.335, 0.07);
  await expectPick("A tap chest L (skin) -> pectoralis_major / left / skin / anterior", { part_id: "pectoralis_major", side: "left", depth: "skin", view: "anterior" });
  ok("A readout shows zh label", (await page.locator(".readout strong").innerText()) === "胸大肌");
  ok("A readout side+depth via ui.json", (await page.locator(".readout .meta").innerText()) === `${ui["side.left"].zh} · ${ui["depth.skin"].zh}`);
  // B. right thigh: patient's right is on the viewer's left in a front view
  const pB = await tapWorld(-0.095, 0.70, 0.045);
  ok("B right thigh is on screen-left in front view", pB.x < 195, `x=${pB.x.toFixed(0)}`);
  await expectPick("B tap thigh R -> rectus_femoris / right / skin", { part_id: "rectus_femoris", side: "right", depth: "skin" });
  await page.screenshot({ path: OUT + "02_two_marks_zh.png" });

  ok("default layers: skin on, muscle and bone off", (await page.locator('[data-layer="skin"]').getAttribute("aria-pressed")) === "true"
    && (await page.locator('[data-layer="muscle"]').getAttribute("aria-pressed")) === "false" && (await page.locator('[data-layer="bone"]').getAttribute("aria-pressed")) === "false");
  // C. muscle on, skin off -> depth muscle; skin marks leave with the skin
  await page.locator('[data-layer="muscle"]').click();
  await page.locator('[data-layer="skin"]').click();
  ok("C skin chip off", (await page.locator('[data-layer="skin"]').getAttribute("aria-pressed")) === "false");
  await tapWorld(0.08, 1.335, 0.07);
  await expectPick("C tap chest L (muscle) -> pectoralis_major / left / muscle", { part_id: "pectoralis_major", side: "left", depth: "muscle" });
  const vis = await page.evaluate(() => window.__bodymap.viewer.markers.map((m) => m.mesh.visible));
  ok("C skin marks hidden while skin is off, muscle mark shown", vis.join() === "false,false,true", vis.join());
  await page.screenshot({ path: OUT + "03_muscle_layer.png" });

  // D. bone only. Bone names in the model use Blender ".l" — exercises userData.name, not the sanitized node name.
  await page.locator('[data-layer="bone"]').click();
  await page.locator('[data-layer="muscle"]').click();
  await tapWorld(0.0975, 0.70, 0.0);
  await expectPick("D tap femur L (bone, from 'Femur.l') -> femur / left / bone", { part_id: "femur", side: "left", depth: "bone" });
  await tapWorld(0, 1.31, 0.075);
  await expectPick("D tap sternum -> sternum / midline / bone", { part_id: "sternum", side: "midline", depth: "bone" });
  await page.screenshot({ path: OUT + "04_bone_layer.png" });

  // E. cannot switch off the last visible layer
  await page.locator('[data-layer="bone"]').click();
  ok("E last layer stays on", (await page.locator('[data-layer="bone"]').getAttribute("aria-pressed")) === "true");

  // F. tap on empty space -> nothing
  let n = (await picks()).length;
  await page.touchscreen.tap(24, 420); await sleep(150);
  ok("F tap on background adds nothing", (await picks()).length === n);

  // G. a drag rotates, never marks
  const before = await page.evaluate(() => window.__bodymap.viewer.camera.position.toArray());
  const c = await page.evaluate(() => window.__bodymap.screenOf(0, 1.0, 0.1));
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
    for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x + i * 12, y: c.y }] }); await sleep(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 100, c.y, { steps: 8 }); await page.mouse.up();
  }
  await sleep(600);
  const after = await page.evaluate(() => window.__bodymap.viewer.camera.position.toArray());
  ok("G drag rotated the camera", Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.05);
  ok("G drag added no mark", (await picks()).length === n);

  // H. back view, skin on
  await page.locator('[data-layer="skin"]').click();
  await face(Math.PI); await sleep(300);
  await tapWorld(0.085, 0.915, -0.07);
  await expectPick("H tap buttock L from behind -> gluteus_maximus / left / posterior", { part_id: "gluteus_maximus", side: "left", depth: "skin", view: "posterior" });
  await page.screenshot({ path: OUT + "05_back_view.png" });

  // I. from the patient's left side
  await face(Math.PI / 2); await sleep(300);
  await tapWorld(0.159, 1.337, -0.041); // deltoid L centre in the Z-Anatomy export (placeholder: 0.21, 1.40, 0.0)
  await expectPick("I tap shoulder L from the left -> deltoid / left / lateral_left", { part_id: "deltoid", side: "left", view: "lateral_left" });
  await face(0); await sleep(200);

  console.log(`· re-frame tween undid a camera turn ${refitUndidTurn} time(s) in this run`);
  // J/K. coordinates: local in 0..1, round trip location -> surface point
  const all = await picks();
  ok("K every local is [x,y,z] in 0..1", all.every((p) => p.location.local.length === 3 && p.location.local.every((v) => v >= 0 && v <= 1)));
  const rt = all.map((p) => `${p.location.part_id}/${p.location.depth}:${p.roundTripMm.toFixed(1)}mm`);
  ok("J round trip (location -> point) muscle/bone < 3 mm", all.filter((p) => p.location.depth !== "skin").every((p) => p.roundTripMm < 3), rt.join(" "));
  ok("J round trip skin < 15 mm", all.filter((p) => p.location.depth === "skin").every((p) => p.roundTripMm < 15), "");

  // L. breathing, and reduced motion
  const b1 = await page.evaluate(() => window.__bodymap.breath()); await sleep(2000);
  const b2 = await page.evaluate(() => window.__bodymap.breath());
  ok("L marks breathe (motion on)", b1.some((v, i) => Math.abs(v - b2[i]) > 0.01), `${b1[0].toFixed(3)}→${b2[0].toFixed(3)}`);
  ok("L marks do not breathe in lockstep", new Set(b2.map((v) => v.toFixed(3))).size > 1);
  const toggleMotion = async () => page.locator(".switch").click();
  await toggleMotion();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // let a frame apply it
  const r1 = await page.evaluate(() => window.__bodymap.breath()); await sleep(700);
  const r2 = await page.evaluate(() => window.__bodymap.breath());
  ok("L reduced motion: marks still", r1.every((v, i) => v === 0.5 && r2[i] === 0.5), `checked=${await page.locator("#reduced").isChecked()} r1=${r1.map((v) => v.toFixed(2))} r2=${r2.map((v) => v.toFixed(2))}`);
  ok("L reduced motion persisted", (await page.evaluate(() => localStorage.getItem("bodymap.reducedMotion"))) === "1");
  await toggleMotion();

  // P. view presets
  for (const [v, y] of [["upper", 1.37], ["lower", 0.47], ["full", 0.93]]) {
    await page.locator(`[data-view="${v}"]`).click();
    await sleep(100); await idle();
    const ty = (await page.evaluate(() => window.__bodymap.cameraTarget()))[1];
    ok(`P view ${v} frames y≈${y}`, Math.abs(ty - y) < 0.01, `target.y=${ty.toFixed(3)}`);
    if (v === "upper") await page.screenshot({ path: OUT + "06_upper_view.png" });
  }

  // M/N. language and forbidden words
  const zhText = await page.locator("body").innerText();
  await page.locator(".lang").click(); await sleep(200);
  ok("M html lang switches to en", (await page.evaluate(() => document.documentElement.lang)) === "en");
  const enText = await page.locator("body").innerText();
  ok("M footer in en", enText.includes(ui["footer.record_only"].en) && enText.includes(ui["footer.emergency"].en));
  ok("M no CJK left in en (except the 中文 switch)", !/[㐀-鿿]/.test(enText.replace("中文", "")), (enText.match(/[㐀-鿿]+/g) || []).join(","));
  ok("M readout label switches", (await page.locator(".readout strong").innerText()) === "Deltoid");
  for (const [name, txt] of [["zh", zhText], ["en", enText]]) ok(`N no verdict/warning words on page (${name})`, !FORBIDDEN.some((re) => re.test(txt)), FORBIDDEN.filter((re) => re.test(txt)).join(","));
  await settle(); // English wraps the record row onto a second line: the panel grows and the body re-frames
  ok("S no overlap (en, 390×844)", (await page.evaluate(OVERLAP)).length === 0, (await page.evaluate(OVERLAP)).join(","));
  await page.screenshot({ path: OUT + "07_en.png" });
  await page.locator(".lang").click();

  // O. no red / warning hue anywhere in computed styles
  const reds = await page.evaluate(() => {
    const bad = [];
    const hue = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (a === 0) return null;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 40) return null; // near grey
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      return h;
    };
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const p of ["color", "backgroundColor", "borderTopColor", "outlineColor"]) {
        const h = hue(cs[p]);
        if (h !== null && (h < 40 || h > 330)) bad.push(`${el.tagName}.${el.className}:${p}=${cs[p]}`);
      }
    }
    return bad;
  });
  ok("O no red/orange/warning hue in UI styles", reds.length === 0, reds.slice(0, 5).join(" | "));

  // Q. offline by construction
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:"));
  ok("Q no request leaves the origin", foreign.length === 0, foreign.join(" "));
  ok("Q no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  ok("S no overlap (zh, 390×844)", (await page.evaluate(OVERLAP)).length === 0, (await page.evaluate(OVERLAP)).join(","));
  // S. small phone (iPhone SE size), both languages
  for (const loc of ["zh-CN", "en-US"]) {
    const sp = await (await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: loc })).newPage();
    await sp.goto(base + "?e2e=1");
    await sp.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 30000 });
    const o = await sp.evaluate(OVERLAP);
    ok(`S no overlap (${loc}, 375×667)`, o.length === 0, o.join(","));
    await sp.screenshot({ path: OUT + `09_small_${loc}.png` });
  }

  // T. model file missing -> calm message, no crash
  {
    const tp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" })).newPage();
    await tp.route("**/model/*.glb", (r) => r.fulfill({ status: 404, body: "" }));
    await tp.goto(base);
    await tp.waitForSelector(".status.failed", { timeout: 15000 });
    const msg = await tp.locator(".status").innerText();
    ok("T missing model -> model.failed text", msg === (ui["model.failed"] ?? pending["model.failed"]).zh, msg);
  }
  // U. parts file missing -> still loads, names parsed from the glTF node names
  {
    const up = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" })).newPage();
    await up.route("**/model/*.parts.json", (r) => r.fulfill({ status: 404, body: "" }));
    await up.goto(base + "?e2e=1");
    await up.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 30000 });
    ok("U missing parts.json -> loads, version unknown", (await up.evaluate(() => window.__bodymap.modelVersion())) === "unknown");
    const parts = await up.evaluate(() => window.__bodymap.viewer.model.parts.map((p) => `${p.info.part_id}|${p.info.side}|${p.info.layer}`));
    ok("U fallback parsing: Femur.l -> femur|left|bone, pectoralis_major_R -> right|muscle", parts.includes("femur|left|bone") && parts.includes("pectoralis_major|right|muscle"));
    ok("U fallback: Skin is generic", await up.evaluate(() => window.__bodymap.viewer.model.parts.some((p) => p.info.part_id === "skin" && p.info.generic)));
  }

  // R. desktop width
  const dpage = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" })).newPage();
  await dpage.goto(base);
  await dpage.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 30000 });
  await sleep(300);
  await dpage.screenshot({ path: OUT + "08_desktop.png" });
  ok("R desktop renders", true);
} catch (e) {
  ok("e2e run without exception", false, String(e?.stack || e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(fails ? 1 : 0);
