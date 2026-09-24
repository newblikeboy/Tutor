# Asset provenance

Landing editorial additions (2026-09-24): the crystal ornaments, three-step notebook/matching/growth illustrations, photo orbit lines and layered learning record are original CSS/HTML compositions using the existing Lucide icons. They are decorative, hidden from assistive technology and contain no claimed results or real learner records. English display accents use the system Georgia serif; Hindi retains the existing self-hosted Devanagari font. No new raster asset, external font request or third-party image was introduced. The existing AI-labelled scene remains unchanged; its `sizes` hints now account for the taller hero crop, selecting a sharper desktop WebP.

- Manrope: self-hosted via `@fontsource/manrope` 5.3.0. Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope), SIL Open Font License 1.1. License inspected in the installed package.
- Noto Sans Devanagari: self-hosted via `@fontsource/noto-sans-devanagari` 5.3.0. Copyright 2022 The Noto Project Authors (https://github.com/notofonts/devanagari), SIL Open Font License 1.1. License inspected in the installed package.
- Lucide icons: `lucide-react` 1.47.0, package license ISC. No emoji navigation.
- Learning-plan/fraction/book visuals are original HTML/CSS/SVG icon compositions. No stock tutor portraits or fabricated founder photograph.
- Tutor initials identify explicitly fictional, database-backed development fixtures. Names and experience do not represent real people or assessed qualifications.

Upstream notices are included in `apps/web/public/licenses` and copied into the production build. Keep them with distributed assets. Add attribution here before introducing external assets.

## Homepage hero, 2026-09-23

The tutoring scene was generated with the built-in `image_gen` tool for this project and visually inspected before use. It depicts fictional people in an illustrative setting; it is not a photograph of an actual platform tutor, learner, facility or Purnea location. Both the visible caption and localized alt text identify it as AI-generated. It is never used as a tutor profile image or testimonial. The original generation prompt is preserved in [hero-image-prompt.md](hero-image-prompt.md). Operator content review is still required before live launch.

Final project assets:

| File in `apps/web/public/images/` | Width | Bytes |
|---|---:|---:|
| `purnea-learning-640.webp` | 640 | 45,686 |
| `purnea-learning-960.webp` | 960 | 88,152 |
| `purnea-learning-1200.webp` | 1200 | 115,220 |
| `purnea-learning-1536.webp` | 1536 | 164,492 |

The generated 1536×1024 PNG remains in Codex's generated-image directory, with a development working copy in ignored `.local`. Final WebP variants are committed in the project; serving the app does not depend on either source location. Chromium canvas performed only size/format optimization (quality 0.86), with no creative edits. Native `srcset`/`sizes` account for the CSS cover crop, explicit dimensions reserve layout space, and high fetch priority applies to the hero. No third-party image requests or image-generation runtime dependency were introduced.
