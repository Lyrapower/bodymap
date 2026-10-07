# Data format

Three files. The format is the asset; the app is one reader of it.

| File | What |
| --- | --- |
| `record.schema.json` | One record: episode / visit / note. Marks carry a body coordinate. |
| `backup.schema.json` | The backup file: a list of records plus locale and region. |
| `README.md` | This page: the rules that are not expressible in JSON Schema. |

## Rules

1. **Append-only.** Nothing is edited in place. A correction is a new record with `supersedes` pointing at the old one. The old one stays.
2. **Times are what the person said.** `ended_at` is `null` when they did not say. The app never fills it in.
3. **Marks are points, not lines in time.** Readers never interpolate between records. A gap of ten days is ten days of nothing recorded.
4. **No verdict fields.** There is no field for "better", "worse", "diagnosis" or "severity label". Intensity is an integer; readers show the integer.
5. **Body coordinate is model-relative.** `part_id` + `local` (0..1 in the part's bounding box) + `depth`. `model_version` on the record says which model. A viewer with a different model maps by `part_id` and may show `local` approximately.
6. **`tests` is the "already ruled out" column.** It is the single most useful thing on the doctor export. Keep it easy to fill.
7. **`mind` lives on the same record, not in a separate store.** The timeline is one line.

## Body coordinate

```json
{
  "part_id": "vastus_lateralis",
  "side": "left",
  "local": [0.62, 0.41, 0.80],
  "depth": "muscle",
  "view": "anterior"
}
```

`part_id` is the model mesh name, lower snake case, without side prefix. Side is its own field. The frontend owns the mapping from mesh name to `part_id`; it must be stable across model versions.

## Versioning

`schema_version` is a string. Readers accept any `1.x`; a `2.0` means a migration. Add fields freely within 1.x; never change the meaning of an existing field.

## Note on `tests[].result`

`abnormal` is the data value (what labs call it). The UI label key is `result.finding` and reads "有发现 / Finding". The forbidden-word test covers UI strings and exports, not enum values.
