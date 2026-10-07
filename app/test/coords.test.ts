import { describe, expect, it } from "vitest";
import { toLocal, fromLocal, viewFromDirection } from "../src/body/coords";

const box = { min: { x: -1, y: 0, z: 2 }, max: { x: 1, y: 4, z: 3 } };
describe("local coordinates", () => {
  it("corners and centre", () => {
    expect(toLocal({ x: -1, y: 0, z: 2 }, box)).toEqual([0, 0, 0]);
    expect(toLocal({ x: 1, y: 4, z: 3 }, box)).toEqual([1, 1, 1]);
    expect(toLocal({ x: 0, y: 2, z: 2.5 }, box)).toEqual([0.5, 0.5, 0.5]);
  });
  it("clamps outside points into 0..1", () => expect(toLocal({ x: 9, y: -9, z: 2.5 }, box)).toEqual([1, 0, 0.5]));
  it("flat box axis -> 0.5, never NaN", () => expect(toLocal({ x: 0, y: 0, z: 0 }, { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } })).toEqual([0.5, 0, 0]));
  it("round trip", () => {
    const p = { x: 0.3, y: 1.7, z: 2.9 };
    const q = fromLocal(toLocal(p, box), box);
    expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeLessThan(1e-3);
  });
  it("fromLocal tolerates bad input", () => expect(fromLocal([NaN, 2, -1], box)).toEqual({ x: 0, y: 4, z: 2 }));
});

describe("view from camera direction (body faces +z, patient's left is +x)", () => {
  it.each([
    [{ x: 0, y: 0.2, z: 1 }, "anterior"],
    [{ x: 0, y: 0, z: -1 }, "posterior"],
    [{ x: 1, y: 0, z: 0.3 }, "lateral_left"],
    [{ x: -1, y: 0, z: 0 }, "lateral_right"],
    [{ x: 0, y: 1, z: 0.1 }, "superior"],
    [{ x: 0, y: -1, z: 0 }, "inferior"],
  ])("%o -> %s", (d, v) => expect(viewFromDirection(d)).toBe(v));
});
