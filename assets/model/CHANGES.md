# Model changes

Source: Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D. Attribution lives in ../../ATTRIBUTION.md and in the app's About section.

Status 2026-10-13: the app ships with `app/public/model/placeholder.glb` (a low-poly stand-in made by `app/scripts/make-placeholder.mjs`,
40 named parts, three layers). The Z-Anatomy export has **not been run yet**: `export_zanatomy.py` is the Blender script for it,
`labels.json` holds the zh / en names it merges in (140 parts: the common muscles, bones and skin regions). Running it needs Blender 4.x
and the Z-Anatomy .blend on a machine with the files; see the docstring in the script.

When the export is done, fill in:

- Layers kept: skin, muscles, skeleton. Organs omitted at v1.
- Decimation ratio per layer (script defaults: skin 0.08, muscle 0.12, bone 0.12):
- Mesh naming: lower snake case, side stripped into a separate attribute. Mapping file: `body.parts.json` (written by the script).
- Export: glTF 2.0 binary (.glb), no Draco (the app has no decoder).
- Blender version:
- Units / origin: metres, feet at y = 0, facing +Z, patient's left = +X. The app's view presets assume a ~1.8 m body; if the
  export differs, `app/src/viewer/viewer.ts` PRESETS are the three numbers to change.
