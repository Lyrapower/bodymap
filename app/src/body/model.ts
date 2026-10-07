// Loads a body .glb and indexes it by part. Works the same for the placeholder and the Z-Anatomy export:
// top-level groups name the layer (skin / muscle / bone / deep), each glTF node is one part,
// parts.json maps original node names to part_id / side / layer and gives zh / en labels.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type Depth, type PartInfo, type PartsFile, layerFromName, resolvePartInfo } from "./naming";

export interface Part {
  key: string;                 // part_id|side|layer
  info: PartInfo;
  node: THREE.Object3D;        // the glTF node (frame for `local`)
  meshes: THREE.Mesh[];
  box: THREE.Box3;             // bounding box in node-local space
  nodeName: string;            // original glTF name (userData.name), not the sanitized three.js name
}

export interface BodyModel {
  root: THREE.Object3D;
  modelVersion: string;
  layers: Map<Depth, THREE.Mesh[]>;
  parts: Part[];
  partOfMesh: Map<THREE.Mesh, Part>;
  labels: PartsFile["labels"];
}

// GLTFLoader sanitizes node.name ("Femur.l" -> "Femurl", spaces -> "_"). The original is in userData.name.
export const originalName = (o: THREE.Object3D): string => (o.userData?.name as string | undefined) ?? o.name;

function layerOf(o: THREE.Object3D): Depth | null {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const l = layerFromName(originalName(p)) ?? layerFromName(p.userData?.layer);
    if (l) return l;
  }
  return null;
}

// The part a mesh belongs to: nearest ancestor-or-self that is a named glTF node and not a layer group.
function partNodeOf(mesh: THREE.Object3D): THREE.Object3D {
  for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
    if (p.userData?.name && !layerFromName(p.userData.name)) return p;
  }
  return mesh;
}

export async function loadBody(modelUrl: string, partsUrl: string | null): Promise<BodyModel> {
  const [gltf, parts] = await Promise.all([
    new GLTFLoader().loadAsync(modelUrl),
    partsUrl ? fetch(partsUrl).then((r) => (r.ok ? (r.json() as Promise<PartsFile>) : null)).catch(() => null) : Promise.resolve(null),
  ]);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const byNode = new Map<THREE.Object3D, Part>();
  const partOfMesh = new Map<THREE.Mesh, Part>();
  const layers = new Map<Depth, THREE.Mesh[]>();
  const inv = new THREE.Matrix4(), m = new THREE.Matrix4();

  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const node = partNodeOf(mesh);
    let part = byNode.get(node);
    if (!part) {
      const nodeName = originalName(node);
      const info = resolvePartInfo(nodeName, layerOf(node), parts);
      if (!info.layer) info.layer = "deep"; // unknown layer: keep it reachable, never drop a part
      part = { key: `${info.part_id}|${info.side}|${info.layer}`, info, node, meshes: [], box: new THREE.Box3(), nodeName };
      byNode.set(node, part);
    }
    part.meshes.push(mesh);
    partOfMesh.set(mesh, part);
    mesh.geometry.computeBoundingBox();
    inv.copy(node.matrixWorld).invert();
    m.multiplyMatrices(inv, mesh.matrixWorld);
    part.box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(m));
  });

  const partList = [...byNode.values()];
  for (const p of partList) {
    const l = p.info.layer as Depth;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(...p.meshes);
  }
  return { root, modelVersion: parts?.model_version ?? "unknown", layers, parts: partList, partOfMesh, labels: parts?.labels ?? {} };
}
