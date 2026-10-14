// Which body model the app loads. body.glb / body.parts.json come from assets/model/export_zanatomy.py (Z-Anatomy,
// CC BY-SA 4.0). The placeholder stays in public/model/ and is one line away.
const base = import.meta.env.BASE_URL;
// export const MODEL = { url: `${base}model/placeholder.glb`, parts: `${base}model/placeholder.parts.json`, placeholder: true };
export const MODEL = { url: `${base}model/body.glb`, parts: `${base}model/body.parts.json`, placeholder: false };
