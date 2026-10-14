# Attribution

## Body model

The 3D body model is derived from **Z-Anatomy** (https://github.com/Z-Anatomy), itself derived from **BodyParts3D** (The Database Center for Life Science, Japan). Both are licensed **CC BY-SA 4.0**. The exported model files (`app/public/model/body.glb`, `body.parts.json`) are distributed under the same license, with changes (decimation, layer grouping, export to glTF) described in `assets/model/CHANGES.md`.

- Z-Anatomy: https://github.com/Z-Anatomy/Models-of-human-anatomy
- BodyParts3D: https://lifesciencedb.jp/bp3d/ (CC BY-SA 2.1 JP, relicensed through Z-Anatomy under CC BY-SA 4.0)

## Vocabulary

Pain descriptors in `core/i18n/descriptors.json` are a subset of the McGill Pain Questionnaire vocabulary (Melzack, 1975), grouped as the questionnaire groups them. The export section order follows the SOCRATES pain-history mnemonic.

## Built with

Built with Claude (Anthropic) as a pair, from design to code. All decisions and all responsibility are the author's.
