"""
Export the Z-Anatomy body (CC BY-SA 4.0) to the three-layer .glb this app loads, plus body.parts.json.

Run (Blender 4.x, headless; the .blend is Z-Anatomy/Startup.blend from Z-Anatomy.zip):

    blender --background --factory-startup --python assets/model/export_zanatomy.py -- \
        --blend /path/to/Z-Anatomy/Startup.blend --out app/public/model

    blender --background --factory-startup --python assets/model/export_zanatomy.py -- --blend <file> --list

Why it works this way (found by running it on the real file, 2026-10-14):
  * Opening Startup.blend as a scene evaluates every system (nerves, vessels, organs, modifiers) and needs more
    than 8 GB of RAM. The script reads the file as a library instead and loads only the two collections it uses
    (peak ~1 GB).
  * Z-Anatomy has no skin surface: Integument > Skin only holds empty collections, hair and nails. The skin layer is
    built here: the decimated muscles and bones are joined, voxel-remeshed, smoothed and pushed out a few mm, then
    decimated. One node, "Skin", part_id "skin", generic (the app names a tap on it by the part underneath).
  * Objects ending in .j / .g / .i are label and group helpers (no faces, or not rendered); they are skipped.
    HOOK modifiers only drive those label lines and are removed. Other modifiers (subsurf, solidify, skin) are kept
    and applied, then a decimate.
  * Z-Anatomy is Z-up, metres, feet at z = 0, facing -Y, patient's left at +X. The glTF Y-up conversion maps that to
    feet at y = 0, facing +Z, left at +X, which is exactly the app's convention, so nothing is rotated.
  * Meshes are baked in world space (node transform = identity), so `local` is relative to an axis-aligned box.
  * part_id: the Z-Anatomy name in snake case, side stripped, a trailing "muscle" / "bone" dropped
    ("Pectoralis major muscle.l" -> pectoralis_major, left). Labels: labels.json exact match; otherwise the
    labels.json entry whose id is contained in the part_id (zh only, en keeps the full Z-Anatomy name).
"""
import bpy, bmesh, json, re, sys, os, argparse, unicodedata, mathutils

COLLECTIONS = {  # exact Z-Anatomy names first, then substring hints
    "muscle": ["4: Muscular system", "muscular system"],
    "bone": ["1: Skeletal system", "skeletal system"],
}
HELPER = re.compile(r"\.(j|g|i|t)$")
ENVELOPE = re.compile(r"(^|_)(fascia|bursa|bursae|sheath|sheaths|retinaculum|retinacula)(_|$)")  # same rule as app naming.ts
HERE = os.path.dirname(os.path.abspath(__file__))

def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--blend", required=True)
    p.add_argument("--out", default=os.path.join(HERE, "..", "..", "app", "public", "model"))
    p.add_argument("--ratio-muscle", type=float, default=0.12)
    p.add_argument("--ratio-bone", type=float, default=0.25)
    p.add_argument("--skin-voxel", type=float, default=0.006, help="voxel size of the skin shell, metres")
    p.add_argument("--skin-offset", type=float, default=0.004, help="how far the shell sits outside, metres")
    p.add_argument("--skin-tris", type=int, default=60000)
    p.add_argument("--version", default="z-anatomy-2024-v1")
    p.add_argument("--list", action="store_true", help="print the collection tree of the file and exit")
    return p.parse_args(argv)

def snake(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

def parse_name(raw):
    """Same side rules as app/src/body/naming.ts, plus a trailing 'muscle'/'bone' dropped."""
    s = re.sub(r"\.\d{3}$", "", raw.strip())
    side = "midline"
    m = re.match(r"^(.+?)(?:[\s._-]+|\s*[\(\[]\s*)(l|left|r|right)\s*[\)\]]?$", s, re.I)
    if m:
        side = "left" if m.group(2).lower().startswith("l") else "right"; s = m.group(1)
    else:
        m = re.match(r"^(left|right)[\s._-]+(.+)$", s, re.I)
        if m: side = m.group(1).lower(); s = m.group(2)
    pid = re.sub(r"_(muscle|muscles|bone|bones)$", "", snake(s))
    return pid or "unknown", side

def tris_of(me): return sum(len(p.vertices) - 2 for p in me.polygons)

def main():
    a = args()
    with bpy.data.libraries.load(a.blend, link=False) as (src, dst):
        if a.list:
            names = list(src.collections)
        else:
            want = []
            for hints in COLLECTIONS.values():
                hit = next((n for n in src.collections if n == hints[0]), None) or \
                      next((n for n in src.collections if any(h.lower() in n.lower() for h in hints[1:])), None)
                if hit: want.append(hit)
            dst.collections = want
    if a.list:
        print("\n".join(names)); return

    labels = json.load(open(os.path.join(HERE, "labels.json"), encoding="utf-8"))
    out = os.path.abspath(a.out); os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)   # factory cube / camera / light

    # 1. evaluate + decimate every kept object in a bake collection
    bake = bpy.data.collections.new("bake"); scene.collection.children.link(bake)
    picked = {}
    for layer, hints in COLLECTIONS.items():
        col = bpy.data.collections.get(hints[0]) or next((c for c in bpy.data.collections if hints[1] in c.name.lower()), None)
        if col is None: raise SystemExit(f"no collection for {layer}; run with --list")
        objs = [o for o in col.all_objects if o.type == "MESH" and not HELPER.search(o.name)]
        picked[layer] = objs
        print(f"{layer}: {col.name} -> {len(objs)} meshes")
        for o in objs:
            for m in [m for m in o.modifiers if m.type in ("HOOK", "BOOLEAN")]: o.modifiers.remove(m)
            for m in o.modifiers:
                if m.type == "SUBSURF": m.levels = min(m.levels, 1); m.render_levels = m.levels
            d = o.modifiers.new("bodymap_decimate", "DECIMATE"); d.ratio = a.ratio_muscle if layer == "muscle" else a.ratio_bone
            if o.name not in bake.objects: bake.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()

    # 2. bake world-space meshes; parts of one muscle / bone ("Sternocostal head of pectoralis major muscle.l",
    #    "Body of sternum") are joined into one node named by labels.json, so one part_id + side = one node
    empties = {}
    for layer in ("skin", "muscle", "bone"):
        e = bpy.data.objects.new(layer, None); scene.collection.objects.link(e); empties[layer] = e
    groups = {}   # (layer, part_id, side) -> [(original name, mesh)]
    for layer, objs in picked.items():
        for o in objs:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            if tris_of(me) == 0: bpy.data.meshes.remove(me); continue
            me.transform(o.evaluated_get(dg).matrix_world)
            pid, side = parse_name(o.name)
            canon = next((k for k in sorted(labels, key=len, reverse=True) if pid.endswith("_of_" + k)), None)
            groups.setdefault((layer, canon or pid, side), []).append((o.name, me))
            o.name = "__src__" + o.name
    nodes, part_labels, stats, baked = {}, {}, {"muscle": [0, 0], "bone": [0, 0]}, []
    for (layer, pid, side), members in groups.items():
        if len(members) == 1:
            name, me = members[0]
        else:
            base = labels.get(pid, {}).get("en") or members[0][0]
            name = base + {"left": ".l", "right": ".r", "midline": ""}[side]
            bm = bmesh.new()
            for _, m in members: bm.from_mesh(m)
            me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        n = bpy.data.objects.new(name, me); scene.collection.objects.link(n); n.parent = empties[layer]
        baked.append((layer, n)); stats[layer][0] += 1; stats[layer][1] += tris_of(me)
        entry = {"part_id": pid, "side": side, "layer": layer}
        if ENVELOPE.search(pid): entry["envelope"] = True
        if len(members) > 1 or members[0][0] != name: entry["from"] = [m[0] for m in members]
        nodes[n.name] = entry
        en = re.sub(r"\.[lr]$", "", name)
        if pid in labels: lab = labels[pid]
        else:
            hit = max((k for k in labels if k in pid), key=len, default=None)
            lab = {"zh": labels[hit]["zh"] if hit else en, "en": en}
        part_labels.setdefault(pid, {"zh": lab["zh"], "en": lab.get("en", en)})
    scene.collection.children.unlink(bake)

    # 3. skin shell from the union of muscles and bones
    bm = bmesh.new()
    for _, n in baked: bm.from_mesh(n.data)
    shell_me = bpy.data.meshes.new("Skin"); bm.to_mesh(shell_me); bm.free()
    shell = bpy.data.objects.new("Skin", shell_me); scene.collection.objects.link(shell)
    r = shell.modifiers.new("remesh", "REMESH"); r.mode = "VOXEL"; r.voxel_size = a.skin_voxel
    s = shell.modifiers.new("smooth", "LAPLACIANSMOOTH"); s.iterations = 6; s.lambda_factor = 0.6
    dsp = shell.modifiers.new("offset", "DISPLACE"); dsp.direction = "NORMAL"; dsp.mid_level = 0.0; dsp.strength = a.skin_offset
    dg = bpy.context.evaluated_depsgraph_get()
    full = bpy.data.meshes.new_from_object(shell.evaluated_get(dg))
    shell.modifiers.clear(); shell.data = full
    dec = shell.modifiers.new("dec", "DECIMATE"); dec.ratio = min(1.0, a.skin_tris / max(1, tris_of(full)))
    dg = bpy.context.evaluated_depsgraph_get()
    final = bpy.data.meshes.new_from_object(shell.evaluated_get(dg))
    shell.modifiers.clear(); shell.data = final; shell.parent = empties["skin"]
    nodes["Skin"] = {"part_id": "skin", "side": "midline", "layer": "skin", "generic": True}
    part_labels["skin"] = {"zh": labels.get("skin", {}).get("zh", "皮肤"), "en": "Skin"}
    print(f"skin shell: {tris_of(full)} tris after remesh -> {tris_of(final)}")

    # 4. export
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "body.glb"), export_format="GLB", export_yup=True,
                              use_selection=False, export_apply=False, export_draco_mesh_compression_enable=False,
                              export_materials="NONE", export_normals=True, export_texcoords=False, export_extras=False,
                              export_animations=False, export_skins=False, export_morph=False)
    json.dump({"model_version": a.version, "nodes": nodes, "labels": part_labels},
              open(os.path.join(out, "body.parts.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("STATS", json.dumps({"muscle_meshes": stats["muscle"][0], "muscle_tris": stats["muscle"][1],
                               "bone_meshes": stats["bone"][0], "bone_tris": stats["bone"][1],
                               "skin_tris": tris_of(final), "nodes": len(nodes), "labels": len(part_labels),
                               "blender": bpy.app.version_string}))

main()
