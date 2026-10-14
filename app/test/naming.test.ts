import { describe, expect, it } from "vitest";
import { parseNodeName, resolvePartInfo, layerFromName, snake } from "../src/body/naming";

describe("parseNodeName", () => {
  const cases: [string, string, string][] = [
    ["pectoralis_major_L", "pectoralis_major", "left"],
    ["vastus_lateralis_R", "vastus_lateralis", "right"],
    ["Femur.l", "femur", "left"],
    ["Femur.R", "femur", "right"],
    ["Femur.l.001", "femur", "left"],
    ["Biceps brachii (right)", "biceps_brachii", "right"],
    ["Gluteus maximus muscle.l", "gluteus_maximus_muscle", "left"],
    ["left_kidney", "kidney", "left"],
    ["Sternum", "sternum", "midline"],
    ["Rib cage", "rib_cage", "midline"],
    ["Cervical vertebrae", "cervical_vertebrae", "midline"],
    ["RectusAbdominis", "rectus_abdominis", "midline"],
    ["Pelvis", "pelvis", "midline"],    // ends in "s", not a side
    ["Patella", "patella", "midline"],  // ends in "a"
    ["", "unknown", "midline"],
    ["L", "l", "midline"],              // a bare letter is a name, not a side
  ];
  for (const [raw, id, side] of cases) it(`${JSON.stringify(raw)} -> ${id}/${side}`, () => expect(parseNodeName(raw)).toEqual({ part_id: id, side }));
});

describe("resolvePartInfo", () => {
  const parts = { model_version: "t", labels: {}, nodes: { "Skin": { part_id: "skin", side: "midline" as const, layer: "skin" as const, generic: true }, "Odd name 7": { part_id: "deltoid", side: "left" as const } } };
  it("parts.json wins over the name", () => expect(resolvePartInfo("Odd name 7", "muscle", parts)).toEqual({ part_id: "deltoid", side: "left", layer: "muscle", generic: false, envelope: false }));
  it("generic skin", () => expect(resolvePartInfo("Skin", null, parts).generic).toBe(true));
  it("falls back to parsing", () => expect(resolvePartInfo("Tibia.r", "bone", parts)).toEqual({ part_id: "tibia", side: "right", layer: "bone", generic: false, envelope: false }));
  it("unnamed skin mesh is still generic", () => expect(resolvePartInfo("skin", "skin", null).generic).toBe(true));
});

describe("layers", () => {
  it("aliases", () => {
    expect(layerFromName("Skeleton")).toBe("bone");
    expect(layerFromName("Muscular system")).toBe("muscle");
    expect(layerFromName("skin")).toBe("skin");
    expect(layerFromName("Femur.l")).toBe(null);
  });
  it("snake", () => expect(snake("Músculo  Bíceps--Brachii")).toBe("musculo_biceps_brachii"));
});

describe("envelope parts (fascia, bursae, sheaths, retinacula)", () => {
  it.each([["Deltoid fascia.l", true], ["Fascia lata.r", true], ["Subdeltoid bursa.l", true], ["Tendon sheath of extensor pollicis longus.r", true],
    ["Superior extensor retinaculum.l", true], ["Plantar aponeurosis.l", false], ["Iliotibial tract.r", false], ["Deltoid.l", false], ["Fascial nothing", false]])
    ("%s -> %s", (n, env) => expect(resolvePartInfo(n, "muscle", null).envelope).toBe(env));
  it("parts.json flag wins", () => expect(resolvePartInfo("X", "muscle", { model_version: "t", labels: {}, nodes: { X: { part_id: "x", side: "left", envelope: true } } }).envelope).toBe(true));
});
