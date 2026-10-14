# app/

The web app. Vite + Three.js + TypeScript, mobile first. Reads `../core` and never writes to it.

```
npm install
npm run dev            # http://localhost:5173  (add --host to open it from a phone on the same Wi-Fi)
npm run build          # tsc --noEmit + vite build -> dist/
npm test               # unit tests (vitest)
npm run e2e            # build first; D0: viewer, taps, coordinates, layout (real preview server + headless browser, phone viewport)
npm run e2e:d1         # D1/D2: records, forms, IndexedDB, timeline, history, exports, routing, backup, adversarial cases
npm run shots          # README screenshots into ../docs/
node ../core/tests/run.mjs
```

`npm run e2e` uses Chromium at `/opt/pw-browsers/...` by default (set `CHROMIUM_PATH`), or `E2E_ENGINE=webkit` where Playwright's WebKit is installed. Screenshots land in `e2e/out/`.

## Layout

| Path | What |
| --- | --- |
| `src/body/naming.ts` | glTF node name -> `part_id` + `side`; layer names (skin / muscle / bone / deep) |
| `src/body/coords.ts` | `local` (0..1 in the part's bounding box) <-> point; camera direction -> `view` |
| `src/body/model.ts` | loads a `.glb` + parts file and indexes parts by node |
| `src/viewer/viewer.ts` | rendering, layers, views, tap vs drag, tap -> body coordinate, coordinate -> surface point |
| `src/viewer/marker.ts` | the breathing mark |
| `src/i18n.ts` | `t(key)`; strings come from `core/i18n/ui.json`, plus `src/i18n/ui.pending.json` until those keys move into core |
| `src/records.ts` | record types mirroring `core/schema/record.schema.json`; `newRecord`, `revise` (append-only), `isoLocal` |
| `src/store/db.ts` | IndexedDB (localStorage fallback), version chains, backup parsing |
| `src/state.ts` | all records, the record being added to, region; one change event |
| `src/ui/forms.ts` | episode details, mark details (McGill words), visit + tests |
| `src/ui/timeline.ts` | SVG dots on a time axis from `core/export` (`timelinePoints`, `mindPoints`, `gaps`) |
| `src/ui/history.ts` | list + detail, show on body, delete |
| `src/ui/exports.ts` | doctor / self print views (`doctorView` / `selfView`), who-to-see (`route`), backup, settings, about |
| `scripts/make-placeholder.mjs` | builds `public/model/placeholder.glb` + `placeholder.parts.json` |

## Body model contract

- Top-level glTF nodes named by layer: `skin`, `muscle`, `bone` (aliases such as `skeleton`, `muscles` are accepted).
- One glTF node per part. GLTFLoader rewrites node names (`Femur.l` becomes `Femurl`); the app reads the original from `userData.name`, so parts files must key on the name as written in the `.glb`.
- A whole-body skin mesh is "generic": a tap on it is named by the muscle or bone underneath, with `depth: "skin"`.
- Swapping in the real model: put `body.glb` and `body.parts.json` in `public/model/` and switch `MODEL` in `src/config.ts`.
