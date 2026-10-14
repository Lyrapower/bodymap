"""
Export the Z-Anatomy body (CC BY-SA 4.0) to the three-layer .glb this app loads, plus body.parts.json.

NOT RUN YET in CI: Blender is not available in the sandbox this was written in. Run it once on a machine with Blender 4.x:

    blender --background /path/to/Z-Anatomy.blend --python assets/model/export_zanatomy.py -- \
        --out app/public/model --ratio-skin 0.08 --ratio-muscle 0.12 --ratio-bone 0.12

Then in app/src/config.ts switch MODEL to body.glb / body.parts.json, and fill in assets/model/CHANGES.md.

What it does
  1. Finds the Z-Anatomy collections for the integument (skin), the muscular system and the skeletal system
     (names are matched case-insensitively against COLLECTION_HINTS; pass --list to print the tree and adjust).
  2. For each kept object: applies modifiers, decimates to the ratio for its layer, keeps the original object name.
  3. Builds a new scene: three empties named Skin / Muscle / Bone (the app reads the layer from the ancestor name),
     each object parented to its layer empty. Units: metres, feet at y = 0, body facing +Z, patient's left = +X
     (the app's view/side conventions). Z-Anatomy is Z-up, so the export uses glTF's +Y up conversion.
  4. Exports body.glb (glTF 2.0 binary, no Draco so the app needs no decoder) and writes body.parts.json:
     { model_version, nodes: { "<original name>": { part_id, side, layer } }, labels: { part_id: { zh, en } } }
     zh labels come from labels.json next to this script; unknown parts get their English name as both labels.
"""
import bpy, bmesh, json, re, sys, os, argparse, unicodedata

COLLECTION_HINTS = {
    "skin": ["integument", "skin"],
    "muscle": ["muscular", "muscle"],
    "bone": ["skeletal", "skeleton", "bone"],
}
HERE = os.path.dirname(os.path.abspath(__file__))

def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(HERE, "..", "..", "app", "public", "model"))
    p.add_argument("--ratio-skin", type=float, default=0.08)
    p.add_argument("--ratio-muscle", type=float, default=0.12)
    p.add_argument("--ratio-bone", type=float, default=0.12)
    p.add_argument("--version", default="z-anatomy-2024-lowpoly-v1")
    p.add_argument("--list", action="store_true", help="print the collection tree and exit")
    return p.parse_args(argv)

def walk(col, depth=0):
    print("  " * depth + col.name, len(col.objects))
    for c in col.children: walk(c, depth + 1)

def find_collection(layer):
    hints = COLLECTION_HINTS[layer]
    best = None
    def visit(col):
        nonlocal best
        n = col.name.lower()
        if any(h in n for h in hints) and (best is None or len(col.all_objects) > len(best.all_objects)): best = col
        for c in col.children: visit(c)
    visit(bpy.context.scene.collection)
    return best

def snake(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s

def parse_name(raw):
    """'Femur.l' / 'Pectoralis major.r' / 'Left kidney' / 'Sternum' -> (part_id, side). Same rules as app/src/body/naming.ts."""
    s = re.sub(r"\.\d{3}$", "", raw.strip())
    side = "midline"
    m = re.match(r"^(.+?)(?:[\s._-]+|\s*[\(\[]\s*)(l|left|r|right)\s*[\)\]]?$", s, re.I)
    if m:
        side = "left" if m.group(2).lower().startswith("l") else "right"; s = m.group(1)
    else:
        m = re.match(r"^(left|right)[\s._-]+(.+)$", s, re.I)
        if m: side = m.group(1).lower(); s = m.group(2)
    return snake(s) or "unknown", side

def decimate(obj, ratio):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new("dec", "DECIMATE"); mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="dec")
    obj.select_set(False)

def main():
    a = args()
    if a.list: walk(bpy.context.scene.collection); return
    labels_path = os.path.join(HERE, "labels.json")
    labels = json.load(open(labels_path, encoding="utf-8")) if os.path.exists(labels_path) else {}
    out = os.path.abspath(a.out); os.makedirs(out, exist_ok=True)
    ratios = {"skin": a.ratio_skin, "muscle": a.ratio_muscle, "bone": a.ratio_bone}
    keep = {}
    for layer in ("skin", "muscle", "bone"):
        col = find_collection(layer)
        if not col: print(f"!! no collection for {layer}; run with --list"); continue
        objs = [o for o in col.all_objects if o.type == "MESH"]
        print(f"{layer}: {col.name} -> {len(objs)} meshes")
        keep[layer] = objs
    bpy.ops.object.select_all(action="DESELECT")
    export_scene = bpy.data.scenes.new("bodymap_export")
    layer_empties = {}
    for layer in keep:
        e = bpy.data.objects.new(layer.capitalize(), None); export_scene.collection.objects.link(e); layer_empties[layer] = e
    nodes = {}; part_labels = {}
    for layer, objs in keep.items():
        for o in objs:
            dup = o.copy(); dup.data = o.data.copy(); dup.name = o.name  # keep the Z-Anatomy name on the node
            export_scene.collection.objects.link(dup)
            bpy.context.window.scene = export_scene
            decimate(dup, ratios[layer])
            dup.parent = layer_empties[layer]
            pid, side = parse_name(o.name)
            if layer == "skin" and len(objs) <= 3: pid, side = "skin", "midline"
            nodes[o.name] = {"part_id": pid, "side": side, "layer": layer, **({"generic": True} if pid == "skin" else {})}
            en = re.sub(r"\.\w$", "", o.name).replace("_", " ")
            part_labels.setdefault(pid, {"zh": labels.get(pid, {}).get("zh", en), "en": labels.get(pid, {}).get("en", en)})
    # ground the feet at y=0 and face +Z: Z-Anatomy stands on z=0 facing -Y; glTF export converts Z-up to Y-up (+Y up, -Z forward).
    bpy.context.window.scene = export_scene
    bpy.ops.object.select_all(action="SELECT")
    for e in layer_empties.values(): e.rotation_euler = (0, 0, 3.141592653589793)  # turn to face +Z after the Y-up conversion
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "body.glb"), export_format="GLB", export_yup=True,
                              use_selection=True, export_apply=True, export_draco_mesh_compression_enable=False,
                              export_materials="NONE", export_normals=True, export_texcoords=False, export_extras=True)
    json.dump({"model_version": a.version, "nodes": nodes, "labels": part_labels},
              open(os.path.join(out, "body.parts.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", out, "nodes:", len(nodes), "labels:", len(part_labels))

main()
