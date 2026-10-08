# Asset provenance

## GoCoaching logo, 2026-10-08

Generated and refined with the built-in `image_gen` tool for the user-requested rebrand. The symbol is an open book with a rising sage page, in dark ink and sage on a transparent background. It accompanies accessible live-text GoCoaching wordmarks, rather than embedding small text in the image. The same mark appears in public, sign-in, workspace and invoice branding. No external image service is called at runtime.

Final assets in `apps/web/public/brand/`:

- `gocoaching-logo.webp`: 512 × 512 transparent downloadable logo and share metadata asset.
- `gocoaching-mark.webp`: 128 × 128 transparent mark used by the 40px website logo component.
- `gocoaching-icon.png`: 180 × 180 favicon and Apple touch icon.

Chromium canvas performed only resizing and format encoding (WebP quality 0.94), preserving alpha. The old SVG favicon was removed. Generated PNG sources are retained in the Codex generated-images directory; the site uses only the project-owned assets above.

Generation prompt:

> Use case: logo-brand. Asset type: production website logo mark for GoCoaching, a carefully selected home and online tutoring service for families in India. Create one exceptional, simple, memorable standalone symbol: an open book whose two rounded, rising pages form a subtle lowercase g / forward path, expressing learning and steady progress. Flat vector-like geometric design rendered as a crisp raster asset; confident medium-thick shapes, friendly rounded corners, balanced negative space, no thin details. Dark ink green #15353B and restrained sage #A5B987, with the dark ink shape dominant so it works on white and warm paper #F6F1E8. Centered square composition, mark fills about 82 percent of canvas, optically balanced. Genuinely transparent background with clean alpha edges. No text, no letters rendered separately, no wordmark, no tagline, no mockup, no border, no drop shadow, no texture, no gradients, no glossy 3D. Should remain recognizable at 32px and feel warm, academic and modern. One logo only.

Refinement prompt:

> Refine this exact GoCoaching open-book logo into clean professional FLAT artwork. Preserve the book/rising-page silhouette and transparent background. Replace all shaded, textured or glowing fills with two perfectly uniform solid colors: dark ink #15353B and sage #A5B987. Remove ALL specular highlights, white smudges, yellow fringes, glow, grain and texture. Sharply defined smooth clean alpha edges. Simplify the small lower page folds for legibility at 32px. No text, no background, no gradients, no 3D effects. Centered square logo, consistent margins, one symbol only.

## Earlier assets

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
