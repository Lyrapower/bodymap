// Builds the placeholder body model: public/model/placeholder.glb + placeholder.parts.json.
// Same contract as the real Z-Anatomy export: three top-level groups (skin / muscle / bone),
// one glTF node per part, anatomical node names. Muscles use "name_L/_R", bones use the
// Blender ".l/.r" convention on purpose, so both naming paths are exercised end to end.
// Run: node scripts/make-placeholder.mjs
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { writeFileSync, mkdirSync } from "node:fs";

// GLTFExporter (binary) uses FileReader; Node has Blob but not FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = "data:application/octet-stream;base64," + Buffer.from(b).toString("base64"); this.onloadend?.(); }); }
};

const OUT = new URL("../public/model/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- skin: smooth union of primitives, polygonized with marching cubes ----------
const sdEllipsoid = (p, c, r) => {
  const x = (p.x - c.x) / r.x, y = (p.y - c.y) / r.y, z = (p.z - c.z) / r.z;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r.x, y / r.y, z / r.z);
  return k1 === 0 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
};
const sdCone = (p, a, b, r1, r2) => {
  const ab = b.clone().sub(a), ap = p.clone().sub(a);
  const t = Math.min(1, Math.max(0, ap.dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t)) - (r1 + (r2 - r1) * t);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

const J = { // joints, patient's left side (+x). Body faces +z. Feet at y = 0.
  shoulder: V(0.19, 1.43, 0), elbow: V(0.31, 1.165, -0.01), wrist: V(0.375, 0.935, 0.01), finger: V(0.40, 0.78, 0.02),
  hip: V(0.09, 0.92, 0), knee: V(0.10, 0.50, 0.01), ankle: V(0.105, 0.085, -0.01),
};
const mirror = (v) => V(-v.x, v.y, v.z);

function skinSdf(p) {
  let d = sdEllipsoid(p, V(0, 1.70, 0.012), V(0.088, 0.118, 0.102));             // head
  d = smin(d, sdCone(p, V(0, 1.47, -0.005), V(0, 1.63, 0.0), 0.058, 0.05), 0.04);  // neck
  let t = sdEllipsoid(p, V(0, 0.95, -0.005), V(0.165, 0.12, 0.112));              // pelvis
  t = smin(t, sdEllipsoid(p, V(0, 1.10, 0.0), V(0.138, 0.13, 0.094)), 0.08);       // waist
  t = smin(t, sdEllipsoid(p, V(0, 1.29, 0.004), V(0.155, 0.17, 0.108)), 0.08);     // chest
  t = smin(t, sdCone(p, V(-0.17, 1.425, -0.01), V(0.17, 1.425, -0.01), 0.062, 0.062), 0.07); // shoulder girdle
  d = smin(d, t, 0.05);
  for (const s of [1, -1]) {
    const m = (v) => (s === 1 ? v : mirror(v));
    let limb = sdCone(p, m(J.shoulder), m(J.elbow), 0.054, 0.043);
    limb = smin(limb, sdCone(p, m(J.elbow), m(J.wrist), 0.043, 0.031), 0.03);
    limb = smin(limb, sdEllipsoid(p, m(V(0.386, 0.855, 0.014)), V(0.021, 0.078, 0.046)), 0.025);
    d = smin(d, limb, 0.035);
    let leg = sdCone(p, m(J.hip), m(J.knee), 0.092, 0.056);
    leg = smin(leg, sdCone(p, m(J.knee), m(J.ankle), 0.055, 0.034), 0.035);
    leg = smin(leg, sdEllipsoid(p, m(V(0.105, 0.036, 0.045)), V(0.043, 0.036, 0.118)), 0.035);
    d = smin(d, leg, 0.04);
  }
  return d;
}

function buildSkin() {
  const RES = 168, HALF = 0.97, CY = 0.93; // cube spans 1.94 m, centred at y = 0.93
  const mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 400000);
  mc.isolation = 0;
  const p = new THREE.Vector3();
  for (let z = 0; z < RES; z++) for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    p.set(((x - RES / 2) / (RES / 2)) * HALF, ((y - RES / 2) / (RES / 2)) * HALF + CY, ((z - RES / 2) / (RES / 2)) * HALF);
    mc.field[mc.size2 * z + mc.size * y + x] = -skinSdf(p);
  }
  mc.update();
  const src = mc.geometry.getAttribute("position");
  const pos = new Float32Array(mc.count * 3);
  for (let i = 0; i < mc.count; i++) {
    pos[i * 3] = src.getX(i) * HALF; pos[i * 3 + 1] = src.getY(i) * HALF + CY; pos[i * 3 + 2] = src.getZ(i) * HALF;
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  // Make sure normals point outwards (top of the head must face +y).
  g.computeBoundingBox();
  const n = g.getAttribute("normal"), q = g.getAttribute("position");
  let top = 0; for (let i = 1; i < q.count; i++) if (q.getY(i) > q.getY(top)) top = i;
  if (n.getY(top) < 0) { const idx = g.getIndex(); for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } g.computeVertexNormals(); }
  return g;
}

// ---------- muscle and bone parts ----------
const ell = (c, r, rotZ = 0, seg = 24) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(r.x, r.y, r.z); if (rotZ) g.rotateZ(rotZ); g.translate(c.x, c.y, c.z); return g;
};
const rod = (a, b, r, seg = 16) => {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 6, seg);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
  const mid = a.clone().add(b).multiplyScalar(0.5); g.translate(mid.x, mid.y, mid.z); return g;
};
const tilt = (a, b) => Math.atan2(b.x - a.x, a.y - b.y); // rotZ that lines a sphere's y axis up with a→b
const mid = (a, b, dz = 0) => V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 + dz);

// Each entry: [nodeName stem, side, build(sign) -> geometry, part_id, zh, en]
// sign = +1 for left (+x), -1 for right. Midline parts use sign = +1 once.
const S = (v, s) => V(v.x * s, v.y, v.z);
const MUSCLES = [
  ["frontalis", "midline", () => ell(V(0, 1.745, 0.072), V(0.068, 0.042, 0.035)), "frontalis", "额肌", "Frontalis"],
  ["temporalis", "bi", (s) => ell(V(0.074 * s, 1.715, 0.002), V(0.02, 0.042, 0.046)), "temporalis", "颞肌", "Temporalis"],
  ["sternocleidomastoid", "bi", (s) => ell(V(0.034 * s, 1.555, 0.022), V(0.018, 0.06, 0.02), -0.25 * s), "sternocleidomastoid", "胸锁乳突肌", "Sternocleidomastoid"],
  ["trapezius", "midline", () => ell(V(0, 1.43, -0.062), V(0.155, 0.105, 0.04)), "trapezius", "斜方肌", "Trapezius"],
  ["deltoid", "bi", (s) => ell(V(0.198 * s, 1.40, 0.0), V(0.056, 0.078, 0.06), 0.3 * s), "deltoid", "三角肌", "Deltoid"],
  ["pectoralis_major", "bi", (s) => ell(V(0.08 * s, 1.335, 0.07), V(0.078, 0.066, 0.04)), "pectoralis_major", "胸大肌", "Pectoralis major"],
  ["biceps_brachii", "bi", (s) => ell(S(mid(J.shoulder, J.elbow, 0.014), s), V(0.034, 0.12, 0.03), tilt(J.shoulder, J.elbow) * s), "biceps_brachii", "肱二头肌", "Biceps brachii"],
  ["triceps_brachii", "bi", (s) => ell(S(mid(J.shoulder, J.elbow, -0.018), s), V(0.036, 0.125, 0.03), tilt(J.shoulder, J.elbow) * s), "triceps_brachii", "肱三头肌", "Triceps brachii"],
  ["flexor_carpi", "bi", (s) => ell(S(mid(J.elbow, J.wrist, 0.012), s), V(0.03, 0.115, 0.022), tilt(J.elbow, J.wrist) * s), "flexor_carpi", "前臂屈肌", "Forearm flexors"],
  ["extensor_carpi", "bi", (s) => ell(S(mid(J.elbow, J.wrist, -0.012), s), V(0.03, 0.115, 0.022), tilt(J.elbow, J.wrist) * s), "extensor_carpi", "前臂伸肌", "Forearm extensors"],
  ["rectus_abdominis", "midline", () => ell(V(0, 1.12, 0.07), V(0.062, 0.14, 0.03)), "rectus_abdominis", "腹直肌", "Rectus abdominis"],
  ["external_oblique", "bi", (s) => ell(V(0.105 * s, 1.11, 0.03), V(0.045, 0.105, 0.06)), "external_oblique", "腹外斜肌", "External oblique"],
  ["latissimus_dorsi", "bi", (s) => ell(V(0.09 * s, 1.24, -0.066), V(0.08, 0.115, 0.04)), "latissimus_dorsi", "背阔肌", "Latissimus dorsi"],
  ["erector_spinae_lumbar", "bi", (s) => ell(V(0.035 * s, 1.07, -0.07), V(0.03, 0.10, 0.03)), "erector_spinae_lumbar", "腰段竖脊肌", "Erector spinae (lumbar)"],
  ["gluteus_maximus", "bi", (s) => ell(V(0.085 * s, 0.915, -0.07), V(0.085, 0.092, 0.05)), "gluteus_maximus", "臀大肌", "Gluteus maximus"],
  ["rectus_femoris", "bi", (s) => ell(V(0.095 * s, 0.70, 0.045), V(0.042, 0.17, 0.038)), "rectus_femoris", "股直肌", "Rectus femoris"],
  ["vastus_lateralis", "bi", (s) => ell(V(0.135 * s, 0.69, 0.005), V(0.036, 0.165, 0.048)), "vastus_lateralis", "股外侧肌", "Vastus lateralis"],
  ["adductor_longus", "bi", (s) => ell(V(0.052 * s, 0.74, 0.008), V(0.036, 0.12, 0.042)), "adductor_longus", "长收肌", "Adductor longus"],
  ["biceps_femoris", "bi", (s) => ell(V(0.10 * s, 0.70, -0.045), V(0.05, 0.165, 0.036)), "biceps_femoris", "股二头肌", "Biceps femoris"],
  ["tibialis_anterior", "bi", (s) => ell(V(0.115 * s, 0.31, 0.028), V(0.026, 0.155, 0.024)), "tibialis_anterior", "胫骨前肌", "Tibialis anterior"],
  ["gastrocnemius", "bi", (s) => ell(V(0.10 * s, 0.355, -0.03), V(0.046, 0.125, 0.04)), "gastrocnemius", "腓肠肌", "Gastrocnemius"],
];
const BONES = [
  ["Skull", "midline", () => ell(V(0, 1.71, 0.006), V(0.074, 0.098, 0.088)), "skull", "颅骨", "Skull"],
  ["Cervical vertebrae", "midline", () => rod(V(0, 1.49, -0.025), V(0, 1.62, -0.018), 0.017), "cervical_vertebrae", "颈椎", "Cervical vertebrae"],
  ["Thoracic vertebrae", "midline", () => rod(V(0, 1.19, -0.06), V(0, 1.48, -0.05), 0.017), "thoracic_vertebrae", "胸椎", "Thoracic vertebrae"],
  ["Lumbar vertebrae", "midline", () => rod(V(0, 0.99, -0.05), V(0, 1.18, -0.058), 0.021), "lumbar_vertebrae", "腰椎", "Lumbar vertebrae"],
  ["Sacrum", "midline", () => ell(V(0, 0.92, -0.062), V(0.04, 0.05, 0.02)), "sacrum", "骶骨", "Sacrum"],
  ["Sternum", "midline", () => ell(V(0, 1.31, 0.07), V(0.018, 0.08, 0.012)), "sternum", "胸骨", "Sternum"],
  ["Rib cage", "midline", () => ell(V(0, 1.28, -0.004), V(0.13, 0.14, 0.08)), "rib_cage", "胸廓", "Rib cage"],
  ["Clavicle", "bi", (s) => rod(V(0.02 * s, 1.448, 0.05), V(0.17 * s, 1.458, 0.0), 0.01), "clavicle", "锁骨", "Clavicle"],
  ["Scapula", "bi", (s) => ell(V(0.10 * s, 1.36, -0.07), V(0.05, 0.07, 0.012)), "scapula", "肩胛骨", "Scapula"],
  ["Humerus", "bi", (s) => rod(S(J.shoulder, s), S(J.elbow, s), 0.015), "humerus", "肱骨", "Humerus"],
  ["Radius", "bi", (s) => rod(S(J.elbow, s), S(J.wrist, s), 0.011), "radius", "桡骨", "Radius"],
  ["Metacarpals", "bi", (s) => ell(V(0.386 * s, 0.86, 0.014), V(0.012, 0.045, 0.03)), "metacarpals", "掌骨", "Metacarpals"],
  ["Ilium", "bi", (s) => ell(V(0.09 * s, 0.975, -0.01), V(0.07, 0.06, 0.04)), "ilium", "髂骨", "Ilium"],
  ["Femur", "bi", (s) => rod(S(V(0.095, 0.90, 0), s), S(J.knee, s), 0.018), "femur", "股骨", "Femur"],
  ["Patella", "bi", (s) => ell(V(0.10 * s, 0.50, 0.05), V(0.025, 0.03, 0.012)), "patella", "髌骨", "Patella"],
  ["Tibia", "bi", (s) => rod(S(V(0.10, 0.48, 0.01), s), S(V(0.105, 0.10, -0.005), s), 0.016), "tibia", "胫骨", "Tibia"],
  ["Calcaneus", "bi", (s) => ell(V(0.105 * s, 0.04, -0.012), V(0.025, 0.025, 0.04)), "calcaneus", "跟骨", "Calcaneus"],
  ["Metatarsals", "bi", (s) => ell(V(0.105 * s, 0.03, 0.08), V(0.03, 0.012, 0.05)), "metatarsals", "跖骨", "Metatarsals"],
];

const scene = new THREE.Scene();
const parts = { model_version: "placeholder-0.1", nodes: {}, labels: {} };
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

const skinGroup = new THREE.Group(); skinGroup.name = "skin"; scene.add(skinGroup);
const skin = new THREE.Mesh(buildSkin(), mat(0xeeeeee)); skin.name = "Skin"; skinGroup.add(skin);
parts.nodes["Skin"] = { part_id: "skin", side: "midline", layer: "skin", generic: true };
parts.labels["skin"] = { zh: "皮肤", en: "Skin" };

// Pull every vertex of an inner part at least `margin` under the skin, so layers nest the way bodies do.
function conform(g, margin) {
  const pos = g.getAttribute("position"), v = new THREE.Vector3(), e = 1e-4;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (let k = 0; k < 6; k++) {
      const d = skinSdf(v);
      if (d <= -margin) break;
      const gx = skinSdf(V(v.x + e, v.y, v.z)) - skinSdf(V(v.x - e, v.y, v.z));
      const gy = skinSdf(V(v.x, v.y + e, v.z)) - skinSdf(V(v.x, v.y - e, v.z));
      const gz = skinSdf(V(v.x, v.y, v.z + e)) - skinSdf(V(v.x, v.y, v.z - e));
      const gr = V(gx, gy, gz).normalize();
      v.addScaledVector(gr, -(d + margin) * 1.05);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function addLayer(name, list, nameStyle, color) {
  const group = new THREE.Group(); group.name = name; scene.add(group);
  for (const [stem, sides, build, part_id, zh, en] of list) {
    const variants = sides === "midline" ? [["", "midline", 1]] : [[nameStyle === "dot" ? ".l" : "_L", "left", 1], [nameStyle === "dot" ? ".r" : "_R", "right", -1]];
    for (const [suffix, side, s] of variants) {
      const nodeName = stem + suffix;
      const m = new THREE.Mesh(conform(build(s), name === "muscle" ? 0.003 : 0.012), mat(color)); m.name = nodeName; group.add(m);
      parts.nodes[nodeName] = { part_id, side, layer: name };
    }
    parts.labels[part_id] = { zh, en };
  }
}
addLayer("muscle", MUSCLES, "underscore", 0xd8b4a0);
addLayer("bone", BONES, "dot", 0xeee6d6);

const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync(new URL("placeholder.glb", OUT), Buffer.from(glb));
writeFileSync(new URL("placeholder.parts.json", OUT), JSON.stringify(parts, null, 1) + "\n");
console.log("skin verts", skin.geometry.getAttribute("position").count, "tris", skin.geometry.getIndex().count / 3,
  "| nodes", Object.keys(parts.nodes).length, "| glb bytes", glb.byteLength);
