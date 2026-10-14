// Merge assets/model/labels.json (zh / en names) into a parts file's labels. Idempotent; run after editing labels.json.
//   node scripts/merge-labels.mjs public/model/body.parts.json
import { readFileSync, writeFileSync } from "node:fs";
const partsPath = process.argv[2] ?? "public/model/body.parts.json";
const labels = JSON.parse(readFileSync(new URL("../../assets/model/labels.json", import.meta.url), "utf8"));
const parts = JSON.parse(readFileSync(partsPath, "utf8"));
parts.labels ??= {};
let n = 0;
for (const id of new Set(Object.values(parts.nodes).map((x) => x.part_id))) {
  const l = labels[id]; if (!l) continue;
  const cur = parts.labels[id] ?? {};
  const next = { zh: /[一-鿿]/.test(cur.zh ?? "") ? cur.zh : l.zh, en: cur.en ?? l.en };
  if (next.zh !== cur.zh || next.en !== cur.en) { parts.labels[id] = next; n++; }
}
writeFileSync(partsPath, JSON.stringify(parts, null, 1) + "\n");
console.log(`merged ${n} labels into ${partsPath}`);
