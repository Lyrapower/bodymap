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
