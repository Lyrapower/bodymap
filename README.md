# <name>

**Anything that hurts can be written down. Nothing is wrong, nothing is judged.**
**怎样的不舒服都能记下来。没有问题，没有评判。**

A 3D body record. Tap where it hurts, say what it feels like, note how long. Over weeks the records become something a doctor can read in one page, and something you can look back on yourself.

*A record, not a diagnosis.* 这是记录，不是诊断。

## What it does

- **Mark on a 3D body**, by part and depth (skin, muscle, bone, deep). Point, patch, line or radiating.
- **Record what it feels like** with plain words (McGill vocabulary) and a 0–10 intensity. Start time; end time when it passes.
- **One tap when it happens.** Details can wait.
- **Body & mind on one timeline.** Stress, mood, sleep, optional on every record.
- **Two exports.** For your clinician: since your last visit, in the order clinicians are trained to read (SOCRATES), with an "already checked" column. For you: the whole line, gaps and all.
- **Who to see.** When you ask, a transparent lookup lists where people with records like yours usually start. Two or three doors, never one; emergency last.
- **Yours.** Everything stays on your device. Export a backup file whenever you like. No account, no server, no analytics.
- 中文 / English.

## Who it is for

People who find pain hard to put into words. Children and older people. People living with something long-term. People who see doctors rarely and don't know which door. Anyone who has been told "we can't find anything" and knows it is still real.

## Run

```
npm install
npm run dev
```

## Data format

Records are plain JSON. See [`core/schema/README.md`](core/schema/README.md). The format is versioned and append-only.

## License

Code: [AGPL-3.0](LICENSE). Body model: CC BY-SA 4.0, see [ATTRIBUTION.md](ATTRIBUTION.md). Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md) (DCO).

Built with Claude (Anthropic).
