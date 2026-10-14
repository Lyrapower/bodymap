// The placeholder parts file covers every node in the .glb, uses only schema enums, and part_ids are lower snake case.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore core is plain JS
import { regionOf } from "../../core/routing/routing.mjs";

const parts = JSON.parse(readFileSync(new URL("../public/model/placeholder.parts.json", import.meta.url), "utf8"));
const glb = readFileSync(new URL("../public/model/placeholder.glb", import.meta.url));
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));

describe("placeholder model", () => {
  const meshNodes = gltf.nodes.filter((n: any) => n.mesh !== undefined).map((n: any) => n.name);
  it("every mesh node is in parts.json", () => meshNodes.forEach((n: string) => expect(parts.nodes[n], n).toBeTruthy()));
  it("enums", () => Object.values(parts.nodes).forEach((p: any) => {
    expect(["left", "right", "midline"]).toContain(p.side);
    expect(["skin", "muscle", "bone", "deep"]).toContain(p.layer);
    expect(p.part_id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  }));
  it("every part_id has zh and en labels", () => Object.values(parts.nodes).forEach((p: any) => expect(parts.labels[p.part_id]?.zh && parts.labels[p.part_id]?.en, p.part_id).toBeTruthy()));
  it("report: core regionOf for each placeholder part (informational)", () => {
    const ids = [...new Set(Object.values(parts.nodes).map((p: any) => p.part_id))].filter((id) => id !== "skin");
    const map = Object.fromEntries(ids.map((id) => [id, regionOf(id)]));
    console.log("regionOf:", JSON.stringify(map));
    expect(ids.length).toBeGreaterThan(20);
  });
});

// The Z-Anatomy export (assets/model/export_zanatomy.py): contract checks on the real file.
describe("Z-Anatomy body model", () => {
  const bp = JSON.parse(readFileSync(new URL("../public/model/body.parts.json", import.meta.url), "utf8"));
  const bglb = readFileSync(new URL("../public/model/body.glb", import.meta.url));
  const bg = JSON.parse(bglb.subarray(20, 20 + bglb.readUInt32LE(12)).toString("utf8"));
  const mesh = bg.nodes.filter((n: any) => n.mesh !== undefined);
  const box = (n: any) => {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of bg.meshes[n.mesh].primitives) { const a = bg.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); } }
    return { mn, mx, c: mn.map((v, i) => (v + mx[i]) / 2) };
  };
  const nodeOf = (pid: string, side: string) => mesh.find((n: any) => bp.nodes[n.name]?.part_id === pid && bp.nodes[n.name]?.side === side);
  it("file size <= 15 MB", () => expect(bglb.length).toBeLessThanOrEqual(15 * 1024 * 1024));
  it("every mesh node is in body.parts.json, and back", () => {
    mesh.forEach((n: any) => expect(bp.nodes[n.name], n.name).toBeTruthy());
    expect(Object.keys(bp.nodes).length).toBe(mesh.length);
  });
  it("enums and snake-case ids", () => Object.values(bp.nodes).forEach((p: any) => {
    expect(["left", "right", "midline"]).toContain(p.side);
    expect(["skin", "muscle", "bone"]).toContain(p.layer);
    expect(p.part_id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  }));
  it("one node per part_id + side + layer (a saved location maps back to exactly one part)", () => {
    const seen = new Map<string, string>();
    for (const [name, p] of Object.entries<any>(bp.nodes)) { const k = `${p.part_id}|${p.side}|${p.layer}`; expect(seen.has(k), `${k}: ${seen.get(k)} / ${name}`).toBe(false); seen.set(k, name); }
  });
  it("exactly one generic skin node", () => expect(Object.values<any>(bp.nodes).filter((p) => p.generic && p.part_id === "skin" && p.layer === "skin").length).toBe(1));
  it("baked in world space (no node transforms)", () => expect(bg.nodes.filter((n: any) => n.translation || n.rotation || n.scale || n.matrix).length).toBe(0));
  it("metres, feet at y = 0, 1.6-1.9 m tall", () => {
    const all = mesh.map(box); const minY = Math.min(...all.map((b: any) => b.mn[1])), maxY = Math.max(...all.map((b: any) => b.mx[1]));
    expect(minY).toBeGreaterThan(-0.02); expect(minY).toBeLessThan(0.03); expect(maxY).toBeGreaterThan(1.6); expect(maxY).toBeLessThan(1.9);
  });
  it("patient's left is +X, facing +Z", () => {
    expect(box(nodeOf("femur", "left")).c[0]).toBeGreaterThan(0.03);
    expect(box(nodeOf("femur", "right")).c[0]).toBeLessThan(-0.03);
    expect(box(nodeOf("rectus_femoris", "left")).c[2]).toBeGreaterThan(box(nodeOf("femur", "left")).c[2]);
    expect(box(nodeOf("gluteus_maximus", "left")).c[2]).toBeLessThan(box(nodeOf("femur", "left")).c[2]);
  });
  it("the parts the D0 e2e asserts on exist", () => {
    for (const [pid, side] of [["pectoralis_major", "left"], ["rectus_femoris", "right"], ["femur", "left"], ["sternum", "midline"], ["gluteus_maximus", "left"], ["deltoid", "left"]])
      expect(nodeOf(pid, side), `${pid}/${side}`).toBeTruthy();
  });
  it("fascia / bursae are flagged as envelopes; muscles are not", () => {
    expect(bp.nodes[nodeOf("fascia_lata", "right").name].envelope).toBe(true);
    expect(bp.nodes[nodeOf("deltoid", "left").name].envelope).toBeUndefined();
  });
  it("every part_id has zh and en labels", () => Object.values<any>(bp.nodes).forEach((p) => expect(bp.labels[p.part_id]?.zh && bp.labels[p.part_id]?.en, p.part_id).toBeTruthy()));
});

// Names: labels.json is the source for every part, and two different parts never show the same Chinese name
// (a contained-id fallback once named iliotibial_tract "胫骨" and every vertebra "椎骨").
describe("body part names", () => {
  const bp = JSON.parse(readFileSync(new URL("../public/model/body.parts.json", import.meta.url), "utf8"));
  const L = JSON.parse(readFileSync(new URL("../../assets/model/labels.json", import.meta.url), "utf8"));
  const ids = [...new Set(Object.values<any>(bp.nodes).map((n) => n.part_id))];
  it("every part_id has an exact labels.json entry, and the parts file shows it", () =>
    ids.forEach((i) => { expect(L[i], i).toBeTruthy(); expect(bp.labels[i].zh, i).toBe(L[i].zh); }));
  it("no two part_ids share a Chinese name", () => {
    const seen = new Map<string, string>();
    for (const i of ids) { const zh = bp.labels[i].zh; expect(seen.has(zh), `${zh}: ${seen.get(zh)} / ${i}`).toBe(false); seen.set(zh, i); }
  });
});
