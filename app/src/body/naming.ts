// Mesh name -> body coordinate fields. Pure functions, no three.js.
// Contract (core/schema/README.md): part_id is lower snake case without side; side is its own field.

export type Side = "left" | "right" | "midline";
export type Depth = "skin" | "muscle" | "bone" | "deep";
export interface PartInfo { part_id: string; side: Side; layer: Depth | null; generic: boolean }
export interface PartsFile {
  model_version: string;
  nodes: Record<string, { part_id: string; side: Side; layer?: Depth; generic?: boolean }>;
  labels: Record<string, { zh: string; en: string }>;
}

const LAYER_ALIASES: Record<string, Depth> = {
  skin: "skin", skins: "skin", integument: "skin", integumentary_system: "skin",
  muscle: "muscle", muscles: "muscle", muscular_system: "muscle", muscular: "muscle",
  bone: "bone", bones: "bone", skeleton: "bone", skeletal_system: "bone", skeletal: "bone",
  deep: "deep", organs: "deep", viscera: "deep", visceral_system: "deep",
};
// Parts that cover the whole body. A tap on them is resolved to the anatomical part underneath.
export const GENERIC_PARTS = new Set(["skin", "body", "integument", "body_surface"]);

export function snake(s: string): string {
  return s
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function layerFromName(name: string | undefined | null): Depth | null {
  if (!name) return null;
  return LAYER_ALIASES[snake(name)] ?? null;
}

// Accepts "pectoralis_major_L", "Femur.l", "Femur.L.001", "Biceps brachii (right)", "left_kidney", "Sternum".
export function parseNodeName(raw: string): { part_id: string; side: Side } {
  let s = (raw ?? "").trim().replace(/\.\d{3}$/, ""); // Blender duplicate suffix
  let side: Side = "midline";
  const suffix = s.match(/^(.+?)(?:[\s._-]+|\s*[([]\s*)(l|left|r|right)\s*[)\]]?$/i);
  if (suffix) {
    side = suffix[2].toLowerCase().startsWith("l") ? "left" : "right";
    s = suffix[1];
  } else {
    const prefix = s.match(/^(left|right)[\s._-]+(.+)$/i);
    if (prefix) { side = prefix[1].toLowerCase() === "left" ? "left" : "right"; s = prefix[2]; }
  }
  const part_id = snake(s) || "unknown";
  return { part_id, side };
}

export function resolvePartInfo(nodeName: string, layerHint: Depth | null, parts?: PartsFile | null): PartInfo {
  const entry = parts?.nodes?.[nodeName];
  if (entry) {
    return { part_id: entry.part_id, side: entry.side, layer: entry.layer ?? layerHint, generic: !!entry.generic || GENERIC_PARTS.has(entry.part_id) };
  }
  const p = parseNodeName(nodeName);
  return { ...p, layer: layerHint, generic: GENERIC_PARTS.has(p.part_id) };
}
