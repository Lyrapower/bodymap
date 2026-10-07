// Strings: every key used by the app exists, pending keys are bilingual and do not shadow core,
// nothing hits core's FORBIDDEN list, and no visible text is hard-coded in components.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import core from "../../core/i18n/ui.json";
import pending from "../src/i18n/ui.pending.json";
// @ts-ignore core is plain JS
import { FORBIDDEN } from "../../core/export/export.mjs";

const C = core as Record<string, any>, P = pending as Record<string, any>;
const keys = (o: Record<string, any>) => Object.keys(o).filter((k) => !k.startsWith("_"));
const src = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? src(join(dir, e.name)) : /\.(ts|css|html)$/.test(e.name) ? [join(dir, e.name)] : []));
const files = [...src(new URL("../src", import.meta.url).pathname), new URL("../index.html", import.meta.url).pathname];

describe("strings", () => {
  it("pending keys are bilingual", () => keys(P).forEach((k) => expect(P[k].zh && P[k].en, k).toBeTruthy()));
  it("pending keys do not shadow core", () => keys(P).forEach((k) => expect(k in C, k).toBe(false)));
  it("no forbidden words in pending", () => {
    const s = JSON.stringify(P);
    expect(FORBIDDEN.filter((re: RegExp) => re.test(s)).map(String)).toEqual([]);
  });
  it("no CJK text hard-coded in components", () => {
    for (const f of files) expect((readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").match(/[㐀-鿿]+/g) || []), f).toEqual([]);
  });
  it("every literal key passed to t()/tx() exists", () => {
    for (const f of files.filter((x) => x.endsWith(".ts"))) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/\b(?:t|tx|chip)\(\s*"([a-z_.]+)"(?!\s*\+)/g)) expect(m[1] in C || m[1] in P, `${f}: ${m[1]}`).toBe(true);
    }
  });
  it("dynamic keys used by the app exist (side.*, depth.*, view.*)", () => {
    for (const k of ["side.left", "side.right", "side.midline", "depth.skin", "depth.muscle", "depth.bone", "depth.deep", "view.full", "view.upper", "view.lower"])
      expect(k in C || k in P, k).toBe(true);
  });
});
