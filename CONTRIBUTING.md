# Contributing

Thank you. Three things before a pull request.

## 1. Sign off every commit (DCO)

This project uses the Developer Certificate of Origin (https://developercertificate.org). Add `-s` when you commit:

```
git commit -s -m "Add reduced-motion toggle"
```

That appends `Signed-off-by: Your Name <you@example.com>`, which says you have the right to submit the code and agree to the project license (AGPL-3.0). A bot checks every PR for it.

## 2. The two rules that are not negotiable

- **It records. It never judges.** No field, string, color or chart that says better, worse, abnormal, severe, or names a condition. `node core/tests/run.mjs` fails if a forbidden word appears in UI strings or exports.
- **Records are points.** Never interpolate between them. A gap is a gap.

## 3. Where things live

| Directory | Owner | What |
| --- | --- | --- |
| `core/schema` | format | Record and backup JSON Schema. Changes need a version note. |
| `core/i18n` | content | UI strings, descriptors, SOCRATES headings. Every key has `zh` and `en`. |
| `core/routing` | content | The "who to see" lookup table and its matcher. Every rule names its basis. |
| `core/export` | logic | Pure functions that turn records into the two export views. |
| `app/` | frontend | The web app: viewer, marking, timeline, print layouts. |
| `assets/model` | model | glTF body model, CC BY-SA 4.0, see ATTRIBUTION.md. |

Run `node core/tests/run.mjs` before you push.
