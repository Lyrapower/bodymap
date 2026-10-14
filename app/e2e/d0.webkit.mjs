// D0 end-to-end on WebKit (Safari's engine) through WebKit's own WebDriver (WebKitGTK MiniBrowser).
// The X screen size is the phone viewport; the browser runs full-screen so there is no window chrome.
//   npm run build
//   xvfb-run -a -s "-screen 0 390x844x24" node e2e/d0.webkit.mjs
//   VIEW=375x667 MODE=layout xvfb-run -a -s "-screen 0 375x667x24" node e2e/d0.webkit.mjs
// Needs packages libwebkit2gtk-4.1-0 + webkit2gtk-driver. Exits 0 only if every check passes.
import { preview } from "vite";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FORBIDDEN } from "../../core/export/export.mjs";

const OUT = new URL("./out/webkit/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const ui = JSON.parse(readFileSync(new URL("../../core/i18n/ui.json", import.meta.url)));
const BROWSER = process.env.WEBKIT_BROWSER || "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser";
const PORT = 4444;
const [VW, VH] = (process.env.VIEW || "390x844").split("x").map(Number);
const MODE = process.env.MODE || "full";

let fails = 0; const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("FAIL watchdog: did not finish in 420 s"); process.exit(2); }, 420000).unref(); // real model in software GL

// ---- minimal W3C WebDriver client ----
const driver = spawn("WebKitWebDriver", [`--port=${PORT}`], { stdio: "ignore" });
const wd = async (method, path, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${method} ${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
};
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/status`); break; } catch { await sleep(100); } }

const server = await preview({ root: new URL("..", import.meta.url).pathname, preview: { port: 4174, strictPort: false, host: "127.0.0.1" }, logLevel: "error" });
const base = server.resolvedUrls.local[0];

async function session(lang) {
  const s = await wd("POST", "/session", { capabilities: { alwaysMatch: { "webkitgtk:browserOptions": { binary: BROWSER, args: ["--automation", "--full-screen", "--enable-webgl=true"] } } } });
  const id = s.sessionId, S = (p) => `/session/${id}${p}`;
  const exec = (fn, ...args) => wd("POST", S("/execute/sync"), { script: `return (${fn}).apply(null, arguments)`, args });
  const execAsync = (fn, ...args) => wd("POST", S("/execute/async"), { script: `const done = arguments[arguments.length-1]; Promise.resolve((${fn}).apply(null, Array.from(arguments).slice(0,-1))).then(done, (e)=>done({__err:String(e)}))`, args });
  await wd("POST", S("/url"), { url: base + "?e2e=1" });
  await exec((l) => localStorage.setItem("bodymap.locale", l), lang);
  await wd("POST", S("/refresh"), {});
  for (let i = 0; i < 300; i++) { if ((await exec(() => document.documentElement.dataset.ready)) === "1") break; await sleep(100); }
  return { id, S, exec, execAsync };
}

const shot = async (s, name) => writeFileSync(OUT + name, Buffer.from(await wd("GET", s.S("/screenshot")), "base64"));
const el = async (s, css) => Object.values(await wd("POST", s.S("/element"), { using: "css selector", value: css }))[0];
const click = async (s, css) => { await wd("POST", s.S(`/element/${await el(s, css)}/click`), {}); await sleep(150); };
const attr = (s, css, a) => s.exec((c, a) => document.querySelector(c)?.getAttribute(a), css, a);
const text = (s, css) => s.exec((c) => document.querySelector(c)?.innerText ?? null, css);
let pointerType = "touch";
async function pointer(s, steps) {
  const run = (type) => wd("POST", s.S("/actions"), { actions: [{ type: "pointer", id: "p1", parameters: { pointerType: type }, actions: steps }] });
  try { await run(pointerType); }
  catch (e) { if (pointerType !== "touch") throw e; pointerType = "mouse"; console.log(`· touch actions refused (${String(e).slice(0, 80)}); using mouse`); await run("mouse"); }
  await wd("DELETE", s.S("/actions"));
}
const tap = async (s, x, y) => { await pointer(s, [{ type: "pointerMove", x: Math.round(x), y: Math.round(y), duration: 0 }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 60 }, { type: "pointerUp", button: 0 }]); await sleep(150); };
// wait for the re-framing tween to finish (slow frames in software GL with the real model)
const idle = async (s) => { for (let i = 0; i < 200; i++) { if (await s.exec(() => !window.__bodymap.viewer.tween)) return; await sleep(100); } };
let refitUndidTurn = 0;
const face = async (s, r) => {
  for (let i = 0; i < 4; i++) {
    await idle(s); await s.exec((r) => window.__bodymap.faceAzimuth(r), r); await sleep(400); await idle(s);
    const az = await s.exec(() => { const v = window.__bodymap.viewer; const d = v.camera.position.clone().sub(v.controls.target); return Math.atan2(d.x, d.z); });
    if (Math.abs(Math.atan2(Math.sin(az - r), Math.cos(az - r))) < 0.05) return;
    refitUndidTurn++;
  }
};
const tapWorld = async (s, x, y, z) => { await idle(s); const p = await s.exec((x, y, z) => window.__bodymap.screenOf(x, y, z), x, y, z); await tap(s, p.x, p.y); await sleep(120); await idle(s); return p; };
const picks = (s) => s.exec(() => window.__bodymap.picks());
async function expectPick(s, name, want) {
  const p = (await picks(s)).at(-1); const l = p?.location ?? {};
  const pass = p && Object.entries(want).every(([k, v]) => l[k] === v);
  ok(name, pass, pass ? `local=${JSON.stringify(l.local)} view=${l.view}` : `got ${JSON.stringify(l)}`);
}
const OVERLAP = () => {
  const r = (q) => document.querySelector(q).getBoundingClientRect();
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const P = r(".panel"), F = r(".foot-note"), B = r(".brand"), L = r(".lang"), out = [];
  if (hit(P, F)) out.push("panel×footer"); if (hit(P, B)) out.push("panel×header"); if (hit(B, L)) out.push("brand×lang");
  if (F.bottom > innerHeight + 0.5) out.push("footer below screen");
  // the body (feet) must end above the hint line
  const bm = window.__bodymap; const feet = bm && bm.screenOf(0.105, 0.0, 0.05);
  if (feet && feet.y > r(".hint").top) out.push(`feet under hint (${Math.round(feet.y)}>${Math.round(r(".hint").top)})`);
  return out;
};
const fps = (s, ms) => s.execAsync((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }), ms);

try {
  const s = await session(MODE === "layout" ? "en" : "zh");
  const info = await s.exec(() => {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    return { ua: navigator.userAgent, vp: [innerWidth, innerHeight, devicePixelRatio], gl: gl ? gl.getParameter(gl.VERSION) : null, ready: document.documentElement.dataset.ready, loadMs: document.documentElement.dataset.loadMs };
  });
  console.log("· engine", info.ua);
  console.log("· viewport", info.vp.join("×"), "· WebGL", info.gl);
  ok(`viewport is ${VW}×${VH}`, info.vp[0] === VW && info.vp[1] === VH, info.vp.join("×"));
  ok("model loaded on WebKit", info.ready === "1", `app load ${info.loadMs} ms (Xvfb + software GL, not a phone number)`);
  if (info.ready !== "1") throw new Error("not ready: " + JSON.stringify(await s.exec(() => document.querySelector(".status")?.textContent)));

  if (MODE === "layout") {
    for (const l of ["en", "zh"]) {
      if (l === "zh") { await click(s, ".lang"); await sleep(200); }
      const o = await s.exec(OVERLAP);
      ok(`S no overlap ${l} ${VW}×${VH}`, o.length === 0, o.join());
      await shot(s, `06_small_${l}.png`);
    }
  } else {
    await sleep(300); await shot(s, "01_loaded_zh.png");
    const foot = await text(s, ".foot-note");
    ok("footer two lines", foot.includes(ui["footer.record_only"].zh) && foot.includes(ui["footer.emergency"].zh));
    ok("default layers: skin only", (await attr(s, '[data-layer="skin"]', "aria-pressed")) === "true" && (await attr(s, '[data-layer="muscle"]', "aria-pressed")) === "false");

    await tapWorld(s, 0.08, 1.335, 0.07);
    await expectPick(s, "A tap chest L (skin)", { part_id: "pectoralis_major", side: "left", depth: "skin", view: "anterior" });
    ok("A readout label", (await text(s, ".readout strong")) === "胸大肌");
    const pB = await tapWorld(s, -0.095, 0.70, 0.045);
    ok("B patient's right on screen-left", pB.x < VW / 2, `x=${pB.x.toFixed(0)}`);
    await expectPick(s, "B tap thigh R", { part_id: "rectus_femoris", side: "right", depth: "skin" });
    await shot(s, "02_two_marks_zh.png");

    await click(s, '[data-layer="muscle"]'); await click(s, '[data-layer="skin"]');
    await tapWorld(s, 0.08, 1.335, 0.07);
    await expectPick(s, "C chest L on muscle layer", { part_id: "pectoralis_major", side: "left", depth: "muscle" });
    ok("C skin marks hidden with skin off", (await s.exec(() => window.__bodymap.viewer.markers.map((m) => m.mesh.visible).join())) === "false,false,true");
    await shot(s, "03_muscle_layer.png");

    await click(s, '[data-layer="bone"]'); await click(s, '[data-layer="muscle"]');
    await tapWorld(s, 0.0975, 0.70, 0.0);
    await expectPick(s, "D femur L from 'Femur.l'", { part_id: "femur", side: "left", depth: "bone" });
    await tapWorld(s, 0, 1.31, 0.075);
    await expectPick(s, "D sternum midline", { part_id: "sternum", side: "midline", depth: "bone" });
    await click(s, '[data-layer="bone"]');
    ok("E last layer stays on", (await attr(s, '[data-layer="bone"]', "aria-pressed")) === "true");

    const n = (await picks(s)).length;
    await tap(s, 20, 420);
    ok("F background tap adds nothing", (await picks(s)).length === n);
    const before = await s.exec(() => window.__bodymap.viewer.camera.position.toArray());
    const c = await s.exec(() => window.__bodymap.screenOf(0, 1.0, 0.1));
    await pointer(s, [{ type: "pointerMove", x: Math.round(c.x), y: Math.round(c.y), duration: 0 }, { type: "pointerDown", button: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({ type: "pointerMove", x: Math.round(c.x + (i + 1) * 12), y: Math.round(c.y), duration: 16 })), { type: "pointerUp", button: 0 }]);
    await sleep(600);
    const after = await s.exec(() => window.__bodymap.viewer.camera.position.toArray());
    ok("G drag rotates", Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.05);
    ok("G drag adds no mark", (await picks(s)).length === n);

    await click(s, '[data-layer="skin"]');
    await face(s, Math.PI); await sleep(300);
    await tapWorld(s, 0.085, 0.915, -0.07);
    await expectPick(s, "H buttock L from behind", { part_id: "gluteus_maximus", side: "left", view: "posterior" });
    await shot(s, "04_back_skin_bone.png");
    await face(s, Math.PI / 2); await sleep(300);
    await tapWorld(s, 0.159, 1.337, -0.041); // deltoid L centre in the Z-Anatomy export (placeholder: 0.21, 1.40, 0.0)
    await expectPick(s, "I shoulder L from the left", { part_id: "deltoid", side: "left", view: "lateral_left" });
    await face(s, 0); await sleep(300);

    console.log(`· re-frame tween undid a camera turn ${refitUndidTurn} time(s) in this run`);
    const all = await picks(s);
    ok("K local in 0..1", all.every((p) => p.location.local.length === 3 && p.location.local.every((v) => v >= 0 && v <= 1)));
    ok("J round trip < 3 mm", all.every((p) => p.roundTripMm < 3), all.map((p) => `${p.location.part_id}:${p.roundTripMm.toFixed(1)}`).join(" "));

    const fBreath = await fps(s, 2000);
    const b1 = await s.exec(() => window.__bodymap.breath()); await sleep(2000); const b2 = await s.exec(() => window.__bodymap.breath());
    ok("L marks breathe", b1.some((v, i) => Math.abs(v - b2[i]) > 0.01));
    await click(s, ".switch");
    await s.execAsync(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const r1 = await s.exec(() => window.__bodymap.breath()); await sleep(700); const r2 = await s.exec(() => window.__bodymap.breath());
    ok("L reduced motion: still", r1.every((v, i) => v === 0.5 && r2[i] === 0.5));
    await click(s, ".switch");

    for (const [v, y] of [["upper", 1.37], ["lower", 0.47], ["full", 0.93]]) {
      await click(s, `[data-view="${v}"]`); await sleep(700);
      await idle(s);
      const ty = (await s.exec(() => window.__bodymap.cameraTarget()))[1];
      ok(`P view ${v}`, Math.abs(ty - y) < 0.01, `y=${ty.toFixed(3)}`);
    }

    const zh = await text(s, "body");
    ok(`S no overlap zh ${VW}×${VH}`, (await s.exec(OVERLAP)).length === 0, (await s.exec(OVERLAP)).join());
    await click(s, ".lang"); await sleep(200);
    const en = await text(s, "body");
    ok("M English UI", en.includes(ui["footer.record_only"].en) && !/[㐀-鿿]/.test(en.replace("中文", "")));
    for (const [k, t] of [["zh", zh], ["en", en]]) ok(`N no verdict words (${k})`, !FORBIDDEN.some((re) => re.test(t)));
    ok(`S no overlap en ${VW}×${VH}`, (await s.exec(OVERLAP)).length === 0, (await s.exec(OVERLAP)).join());
    await shot(s, "05_en.png");
    await click(s, ".lang");

    const reds = await s.exec(() => {
      const bad = [];
      for (const e of document.querySelectorAll("*")) {
        const cs = getComputedStyle(e);
        for (const p of ["color", "backgroundColor", "borderTopColor"]) {
          const m = cs[p].match(/rgba?\(([^)]+)\)/); if (!m) continue;
          const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); if (a === 0) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 40) continue;
          let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
          if (h < 40 || h > 330) bad.push(`${e.tagName}:${p}=${cs[p]}`);
        }
      }
      return bad;
    });
    ok("O no red/orange hue", reds.length === 0, reds.slice(0, 3).join(" | "));
    const res = await s.exec(() => performance.getEntriesByType("resource").map((e) => e.name).filter((u) => !(u.startsWith(location.origin) || u.startsWith("data:") || u.startsWith("blob:"))));
    ok("Q no resource from another origin", res.length === 0, res.join(" "));
    console.log(`· frame rate while breathing (Xvfb, software GL): ${fBreath} fps`);
  }
  await wd("DELETE", `/session/${s.id}`);
} catch (e) {
  ok("webkit run without exception", false, String(e?.stack || e).slice(0, 600));
} finally {
  driver.kill();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed (pointer: ${pointerType})`);
process.exit(fails ? 1 : 0);
