// Body-coordinate math. Pure, no three.js, so it is testable in node.
export interface V3 { x: number; y: number; z: number }
export interface Box { min: V3; max: V3 }
export type View = "anterior" | "posterior" | "lateral_left" | "lateral_right" | "superior" | "inferior";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

// Point in the part's local frame -> [x,y,z] in 0..1 of the part's bounding box.
export function toLocal(p: V3, box: Box): [number, number, number] {
  const f = (v: number, a: number, b: number) => (b - a < 1e-9 ? 0.5 : clamp01((v - a) / (b - a)));
  return [r4(f(p.x, box.min.x, box.max.x)), r4(f(p.y, box.min.y, box.max.y)), r4(f(p.z, box.min.z, box.max.z))];
}

export function fromLocal(local: readonly number[], box: Box): V3 {
  const l = (i: number) => clamp01(Number.isFinite(local[i]) ? local[i] : 0.5);
  return {
    x: box.min.x + l(0) * (box.max.x - box.min.x),
    y: box.min.y + l(1) * (box.max.y - box.min.y),
    z: box.min.z + l(2) * (box.max.z - box.min.z),
  };
}

// dir: from the body toward the camera, in body space (body faces +z, patient's left is +x, up is +y).
export function viewFromDirection(dir: V3): View {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const x = dir.x / len, y = dir.y / len, z = dir.z / len;
  if (Math.abs(y) > 0.8) return y > 0 ? "superior" : "inferior";
  if (Math.abs(z) >= Math.abs(x)) return z >= 0 ? "anterior" : "posterior";
  return x > 0 ? "lateral_left" : "lateral_right";
}
