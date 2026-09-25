# GyanSetu brand and homepage review

2026-09-25. Windows Chromium with real Go API and an isolated local MongoDB replica set. All account/tutor records shown are fictional test fixtures. Domain remains `thegyansetu.in`; visible brand is `GyanSetu`.

Reviewed the old desktop/mobile homepage baselines before editing. Individually inspected the thirteen `english-only-*.png` captures here: homepage, tutor profile, empty discovery, login, signup, parent workspace and tutor application. The two homepage captures were refreshed and reinspected after improving image source sizing. Also inspected the full homepage overviews (`home-1440.png`, `home-390.png`), loading/error tutor sections, forced-colour viewport, 200% reflow viewport and mobile application drawer.

The requested hero headline/supporting text and both CTA labels are present. Desktop has separate text/photo columns; mobile stacks full-width actions. The image remains labelled as AI-generated. Existing login/signup and workspace layouts remain intact with updated branding. Ten changed baselines were copied only after individual review; the mobile workspace baseline was unchanged. All eleven exact visual comparisons passed.

Executed checks:

- `npm run build`, `npm run lint`, `npm run test`: pass (strict TypeScript included; three component tests).
- From `apps/api`: `go test ./internal/config`, `go vet ./internal/config`: pass.
- `npx playwright test --config .local/rebrand.config.ts tests/e2e/home.spec.ts --reporter=list --output=.local/gyansetu-home-results`: 3/3 passed in 1.5m.
- `npx playwright test --config .local/rebrand.config.ts tests/e2e/visual.spec.ts tests/e2e/accounts-visual.spec.ts tests/e2e/workspace-visual.spec.ts --reporter=list --output=.local/gyansetu-visual-results`: 11/11 passed in 1.8m.
- Local capture/smoke harnesses checked branded page titles, favicon, application title restoration, mobile drawer and no horizontal overflow.
- Private-value scan: zero findings in 268 text files against six private values.

Homepage checks cover 360/390/768/1024/1440 widths, desktop/mobile axe, 200% CSS reflow, keyboard skip/menu/FAQ, parent/tutor/profile navigation, real tutor loading/error/retry, reduced motion and forced colours. No live deployment, real provider delivery, Atlas test writes, full workflow regression, native screen-reader review or cross-browser certification is claimed.
