# Model changes

Source: Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D. Attribution lives in ../../ATTRIBUTION.md and in the app's About section.
File used: `Z-Anatomy/Startup.blend` from `Z-Anatomy.zip` in https://github.com/Z-Anatomy/Models-of-human-anatomy
(repository head 7b8d2e3, 2026-10-14; the .blend inside is dated 2023-05-02). The derived files `app/public/model/body.glb` and
`app/public/model/body.parts.json` are CC BY-SA 4.0 as well.

Export done 2026-10-14 with `assets/model/export_zanatomy.py` (command in its docstring). The placeholder model stays in
`app/public/model/placeholder.*`; `app/src/config.ts` switches between them.

- Blender version: 4.0.2 (Ubuntu 24.04 package), headless, `--factory-startup`; the .blend is read as a library, peak RAM ~1.7 GB, ~50 s.
- Layers kept: skin, muscles, skeleton. Organs, vessels, nerves, joints and ligaments omitted at v1.
  - Muscle: collection `4: Muscular system` (683 meshes kept; includes fascia, bursae, tendon sheaths).
  - Bone: collection `1: Skeletal system` (277 meshes kept; includes cartilages and teeth).
  - Skipped: label / group helpers whose names end in `.j` `.g` `.i` `.t` (no faces or not rendered); HOOK and BOOLEAN modifiers
    (they drive the label lines). Subsurf capped at level 1, then all modifiers applied.
  - Skin: Z-Anatomy has no skin surface (Integument > Skin holds only empty collections, hair and nails). The skin layer is built
    from the decimated muscles + bones: voxel remesh 6 mm, Laplacian smooth x6, pushed out 4 mm along normals, decimated to 60 000
    triangles. One node `Skin`, part_id `skin`, `generic: true`.
- Parts of one structure are joined into one node named by `labels.json` ("Clavicular head / Sternocostal head / Abdominal part of
  pectoralis major muscle.l" -> `Pectoralis major.l`, "Manubrium / Body of sternum" -> `Sternum`), so one part_id + side = one node.
  The original Z-Anatomy names are kept in `body.parts.json` under `from`. 960 source meshes -> 795 nodes + skin = 796.
- Thin wrappings (fascia, bursa, tendon sheath, retinaculum) carry `envelope: true`; a tap on one is named by the muscle or bone up to
  2 cm behind it (app/src/viewer/viewer.ts), otherwise by the wrapping itself.
- Decimation ratio per layer: muscle 0.12, bone 0.25, skin to 60 000 triangles.
- Triangles: muscle 272 377 (573 nodes), bone 173 829 (222 nodes), skin 60 000 (1 node); total 506 206.
- File size: body.glb 12 963 400 bytes (12.4 MiB); body.parts.json 143 793 bytes.
- Mesh naming: node names are the Z-Anatomy names (or the joined name above); part_id = snake case, side stripped, a trailing
  "muscle" / "bone" dropped. Mapping file: `body.parts.json` (written by the script). zh labels: all 418 part_ids from an exact
  labels.json entry (since D4); a part with no entry would show its English Z-Anatomy name in both languages.
- Export: glTF 2.0 binary (.glb), no Draco (the app has no decoder), no materials, no UVs. Meshes are baked in world space (no node
  transforms), so `local` is relative to an axis-aligned box.
- Units / origin: metres, feet at y = 0 (min y 0.002), height 1.711 m, facing +Z, patient's left = +X. Z-Anatomy is Z-up, facing -Y,
  left at +X; the glTF Y-up conversion alone gives the app's convention, so nothing is rotated. Checked by app/test/model.test.ts.
