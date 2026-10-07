// Which body model the app loads. When 钉's Z-Anatomy export lands, drop body.glb + body.parts.json
// into public/model/ and switch MODEL to the second entry. Nothing else changes.
const base = import.meta.env.BASE_URL;
export const MODEL = { url: `${base}model/placeholder.glb`, parts: `${base}model/placeholder.parts.json`, placeholder: true };
// export const MODEL = { url: `${base}model/body.glb`, parts: `${base}model/body.parts.json`, placeholder: false };
