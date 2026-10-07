// The 3D viewer: renders the body, frames views, tells taps from drags, and turns a tap into a body coordinate.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BodyModel, Part } from "../body/model";
import type { Depth, Side } from "../body/naming";
import { fromLocal, toLocal, viewFromDirection, type View } from "../body/coords";
import { Marker } from "./marker";

export interface Location { part_id: string; side: Side; local: [number, number, number]; depth: Depth; view: View }
export interface Pick { location: Location; point: THREE.Vector3; normal: THREE.Vector3; part: Part; surfacePart: Part }
export type ViewPreset = "full" | "upper" | "lower";

const PRESETS: Record<ViewPreset, { cy: number; h: number; w: number }> = {
  full: { cy: 0.93, h: 1.95, w: 0.92 },
  upper: { cy: 1.37, h: 0.84, w: 0.92 },
  lower: { cy: 0.47, h: 1.0, w: 0.46 },
};
const LAYER_ORDER: Depth[] = ["skin", "muscle", "bone", "deep"];
const TAP_SLOP_PX = 8, TAP_MAX_MS = 550, UNDERLYING_MAX_M = 0.06;

function skinMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { uBase: { value: new THREE.Color("#f9f9fb") }, uRim: { value: new THREE.Color("#7c82ad") } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uRim; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(f, 2.2);
        float key = clamp(dot(normalize(vN), normalize(vec3(-0.35, 0.8, 0.5))), 0.0, 1.0);
        vec3 c = mix(uBase, uRim, rim * 0.9) * (0.92 + 0.08 * key);
        gl_FragColor = vec4(c, 0.15 + 0.66 * rim);
      }`,
  });
}
const LAYER_MATERIAL: Record<Depth, () => THREE.Material> = {
  skin: skinMaterial,
  muscle: () => new THREE.MeshStandardMaterial({ color: "#dcc0ae", roughness: 0.78, metalness: 0 }),
  bone: () => new THREE.MeshStandardMaterial({ color: "#eee8db", roughness: 0.62, metalness: 0 }),
  deep: () => new THREE.MeshStandardMaterial({ color: "#d9d3e6", roughness: 0.7, metalness: 0 }),
};

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.02, 30);
  readonly controls: OrbitControls;
  readonly markers: Marker[] = [];
  readonly picks: Pick[] = [];
  model: BodyModel | null = null;
  reducedMotion = false;
  onPick: (p: Pick) => void = () => {};

  private raycaster = new THREE.Raycaster();
  private visible = new Set<Depth>(["skin"]);
  private dirty = true;
  private frameInsets = { top: 0, bottom: 0 };
  private preset: ViewPreset = "full";
  private tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number; ms: number } | null = null;
  private worldBoxes = new Map<Part, THREE.Box3>();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d3ca, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-1.5, 3, 2.5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8ecff, 0.6); fill.position.set(2, 1, -2); this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.09, minDistance: 0.35, maxDistance: 7, rotateSpeed: 0.8, screenSpacePanning: true });
    this.controls.minPolarAngle = 0.15; this.controls.maxPolarAngle = Math.PI - 0.15;
    this.controls.addEventListener("change", () => (this.dirty = true));
    this.camera.position.set(0, 0.93, 5);
    this.controls.target.set(0, 0.93, 0);
    this.listenTaps();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  setModel(model: BodyModel) {
    this.model = model;
    for (const [layer, meshes] of model.layers) {
      const mat = LAYER_MATERIAL[layer]();
      for (const m of meshes) { m.material = mat; m.renderOrder = layer === "skin" ? 2 : 1; }
    }
    this.scene.add(model.root);
    model.root.updateMatrixWorld(true);
    for (const p of model.parts) this.worldBoxes.set(p, p.box.clone().applyMatrix4(p.node.matrixWorld));
    this.applyLayers();
    this.frameView(this.preset, false);
  }

  // ---------- layers and views ----------
  layers(): Depth[] { return LAYER_ORDER.filter((l) => this.model?.layers.has(l)); }
  isVisible(l: Depth) { return this.visible.has(l); }
  setLayer(l: Depth, on: boolean): boolean {
    if (!on && [...this.visible].filter((x) => this.model?.layers.has(x)).length <= 1) return false; // keep at least one layer
    on ? this.visible.add(l) : this.visible.delete(l);
    this.applyLayers();
    return true;
  }
  private applyLayers() {
    if (!this.model) return;
    for (const [layer, meshes] of this.model.layers) for (const m of meshes) m.visible = this.visible.has(layer);
    // A mark lives on its layer: peel the skin and the skin marks go with it.
    this.markers.forEach((mk, i) => (mk.mesh.visible = this.visible.has(this.picks[i].location.depth)));
    this.dirty = true;
  }

  setInsets(top: number, bottom: number) { this.frameInsets = { top, bottom }; this.resize(); }

  frameView(preset: ViewPreset, animate = true) {
    this.preset = preset;
    const { cy, h, w } = PRESETS[preset];
    const H = this.canvas.clientHeight || 1, W = this.canvas.clientWidth || 1;
    const free = Math.max(0.35, (H - this.frameInsets.top - this.frameInsets.bottom) / H);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const dist = Math.max((h / 2) / (tanV * free * 0.88), (w / 2) / (tanV * (W / H) * 0.9));
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    const tTo = new THREE.Vector3(0, cy, 0);
    const to = tTo.clone().addScaledVector(dir, dist);
    if (!animate || this.reducedMotion) {
      this.tween = null; this.camera.position.copy(to); this.controls.target.copy(tTo); this.controls.update(); this.dirty = true; return;
    }
    this.tween = { from: this.camera.position.clone(), to, tFrom: this.controls.target.clone(), tTo, t0: performance.now(), ms: 650 };
  }

  // Rotate around the body to face a given side. Used by tests and later by a front/back control.
  faceAzimuth(radians: number) {
    const d = this.camera.position.distanceTo(this.controls.target);
    this.camera.position.set(this.controls.target.x + Math.sin(radians) * d, this.controls.target.y, this.controls.target.z + Math.cos(radians) * d);
    this.controls.update(); this.dirty = true;
  }

  private resize() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    // Centre the body in the free area between the header and the bottom panel.
    const shift = H / 2 - (this.frameInsets.top + (H - this.frameInsets.bottom)) / 2;
    this.camera.setViewOffset(W, H, 0, shift, W, H);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---------- taps ----------
  private listenTaps() {
    const down = new Map<number, { x: number; y: number; t: number }>();
    let multi = false, moved = false;
    this.canvas.addEventListener("pointerdown", (e) => {
      if (down.size === 0) { multi = false; moved = false; }
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      if (down.size > 1) multi = true;
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const d = down.get(e.pointerId);
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) moved = true;
    });
    const up = (e: PointerEvent, cancelled: boolean) => {
      const d = down.get(e.pointerId);
      down.delete(e.pointerId);
      if (!d || cancelled || multi || moved || down.size > 0) return;
      if (performance.now() - d.t > TAP_MAX_MS) return;
      const r = this.canvas.getBoundingClientRect();
      const pick = this.pickAt(e.clientX - r.left, e.clientY - r.top);
      if (pick) this.addMark(pick);
    };
    this.canvas.addEventListener("pointerup", (e) => up(e, false));
    this.canvas.addEventListener("pointercancel", (e) => up(e, true));
  }

  pickAt(x: number, y: number): Pick | null {
    if (!this.model) return null;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.raycaster.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), this.camera);
    const targets: THREE.Object3D[] = [];
    for (const [layer, meshes] of this.model.layers) if (this.visible.has(layer)) targets.push(...meshes);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || !hit.face) return null;
    const surfacePart = this.model.partOfMesh.get(hit.object as THREE.Mesh)!;
    const part = surfacePart.info.generic ? this.underlying(hit) : surfacePart;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate();
    const local = toLocal(part.node.worldToLocal(hit.point.clone()), part.box);
    const view = viewFromDirection(this.camera.position.clone().sub(this.controls.target));
    return {
      location: { part_id: part.info.part_id, side: part.info.side, local, depth: surfacePart.info.layer as Depth, view },
      point: hit.point.clone(), normal, part, surfacePart,
    };
  }

  // A tap on a whole-body surface (skin) is named by the anatomical part underneath it.
  private underlying(surfaceHit: THREE.Intersection): Part {
    const m = this.model!;
    const inner: THREE.Object3D[] = [];
    for (const p of m.parts) if (!p.info.generic) inner.push(...p.meshes);
    const behind = this.raycaster.intersectObjects(inner, false)
      .find((h) => h.distance >= surfaceHit.distance - 0.002 && h.distance - surfaceHit.distance <= UNDERLYING_MAX_M);
    if (behind) return m.partOfMesh.get(behind.object as THREE.Mesh)!;
    let best: Part | null = null, bestD = Infinity;
    for (const p of m.parts) {
      if (p.info.generic) continue;
      const d = this.worldBoxes.get(p)!.distanceToPoint(surfaceHit.point);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ?? m.partOfMesh.get(surfaceHit.object as THREE.Mesh)!;
  }

  // Body coordinate -> point on the surface of its depth layer. Used to redraw saved marks.
  locationToWorld(loc: Pick["location"] | Omit<Location, "view">): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const m = this.model; if (!m) return null;
    const cands = m.parts.filter((p) => p.info.part_id === loc.part_id && p.info.side === loc.side);
    const part = cands.find((p) => !p.info.generic) ?? cands[0];
    if (!part) return null;
    const pl = fromLocal(loc.local, part.box);
    const p = part.node.localToWorld(new THREE.Vector3(pl.x, pl.y, pl.z));
    const centre = this.worldBoxes.get(part)!.getCenter(new THREE.Vector3());
    const out = p.clone().sub(centre); if (out.lengthSq() < 1e-10) out.set(0, 0, 1); out.normalize();
    const surface = m.layers.get(loc.depth) ?? part.meshes;
    const rc = new THREE.Raycaster(p.clone().addScaledVector(out, 0.5), out.clone().negate(), 0, 1.5);
    const hits = rc.intersectObjects(surface, false);
    if (!hits.length) return { point: p, normal: out };
    hits.sort((a, b) => a.point.distanceTo(p) - b.point.distanceTo(p));
    const h = hits[0];
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : out;
    if (n.dot(out) < 0) n.negate();
    return { point: h.point.clone(), normal: n };
  }

  addMark(pick: Pick, intensity = 5) {
    const mk = new Marker(pick.point, pick.normal, intensity);
    this.markers.push(mk); this.picks.push(pick);
    this.scene.add(mk.mesh);
    this.dirty = true;
    this.onPick(pick);
  }

  setReducedMotion(on: boolean) { this.reducedMotion = on; if (on) this.tween = null; this.dirty = true; }

  // Project a world point to canvas CSS pixels (for tests and overlays).
  project(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * this.canvas.clientWidth, y: (1 - v.y) / 2 * this.canvas.clientHeight };
  }
  worldBox(part: Part) { return this.worldBoxes.get(part)!; }

  // ---------- frame ----------
  private frame(now: number) {
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, e);
      this.controls.target.lerpVectors(this.tween.tFrom, this.tween.tTo, e);
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    let animating = false;
    const H = this.canvas.clientHeight || 1;
    for (const m of this.markers) animating = m.update(now, this.camera, H, this.reducedMotion) || animating;
    if (animating) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }
}
