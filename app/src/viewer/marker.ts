// A mark on the body that breathes. One quad, one shader: a soft core, a halo that rises and falls
// with a calm breath (~4.8 s), and a faint ring that leaves on the out-breath.
// Colour is a single ink-violet; intensity changes presence (opacity, size), never hue.
import * as THREE from "three";

export const MARK_COLOR = new THREE.Color("#5b55d6");
const BREATH_S = 4.8;
const SCREEN_PX = 54; // rendered diameter of the halo, in CSS px, at any zoom

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */ `
uniform vec3 uColor; uniform float uBreath; uniform float uRipple; uniform float uPresence; uniform float uLand;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float core = smoothstep(0.17, 0.11, r);
  float coreRing = smoothstep(0.22, 0.18, r) - smoothstep(0.18, 0.14, r);
  float haloR = 0.42 + 0.22 * uBreath;
  float halo = exp(-pow(r / haloR, 2.0) * 2.2) * (0.20 + 0.16 * uBreath);
  float ring = 0.0;
  if (uRipple >= 0.0) {
    float rr = 0.22 + 0.74 * uRipple;
    ring = (smoothstep(rr - 0.05, rr, r) - smoothstep(rr, rr + 0.03, r)) * (1.0 - uRipple) * 0.38;
  }
  float a = max(core * 0.92, max(halo, ring)) + coreRing * 0.35;
  a *= uPresence * uLand;
  vec3 c = mix(uColor, vec3(1.0), coreRing * 0.65);
  gl_FragColor = vec4(c, a);
}`;

export class Marker {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private born = performance.now();
  private phase = Math.random() * BREATH_S; // marks do not breathe in lockstep

  constructor(point: THREE.Vector3, normal: THREE.Vector3, intensity = 5) {
    const material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: {
        uColor: { value: MARK_COLOR.clone() }, uBreath: { value: 0.5 }, uRipple: { value: -1 },
        uPresence: { value: 0.55 + 0.045 * Math.max(0, Math.min(10, intensity)) }, uLand: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.renderOrder = 10;
    this.mesh.position.copy(point).addScaledVector(normal, 0.0025);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    this.mesh.userData.marker = true;
  }

  // Returns true while the marker still needs frames.
  update(now: number, camera: THREE.PerspectiveCamera, viewportH: number, reduced: boolean): boolean {
    const u = this.mesh.material.uniforms;
    const dist = camera.position.distanceTo(this.mesh.position);
    const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportH;
    const age = (now - this.born) / 1000;
    const land = reduced ? 1 : Math.min(1, age / 0.6);
    const ease = 1 - Math.pow(1 - land, 3);
    const scale = SCREEN_PX * worldPerPx * (reduced ? 1 : 1.35 - 0.35 * ease);
    this.mesh.scale.setScalar(scale);
    u.uLand.value = reduced ? 1 : ease;
    if (reduced) { u.uBreath.value = 0.5; u.uRipple.value = -1; return false; }
    const t = ((age + this.phase) % BREATH_S) / BREATH_S;      // 0..1 over one breath
    u.uBreath.value = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);   // in, then out
    u.uRipple.value = t > 0.5 ? (t - 0.5) * 2 : -1;            // a ring leaves on the out-breath
    return true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
