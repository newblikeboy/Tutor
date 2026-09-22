# Visual review evidence

Date: 2026-09-23. Actual Chromium (Playwright 1.63.0), Windows, device scale 1, self-hosted Manrope/Noto fonts. The real React application called the Go API and Atlas. All records shown are fictional. No screenshots of real child records, live credentials or payment/provider claims are included.

## Inspected by opening the rendered images

- Initial English homepage: `home-en-desktop-initial.png`, `home-en-mobile-initial.png` (before refinements).
- Final candidate homepage desktop English and mobile English/Hindi: `candidates/home-en-desktop.png`, `candidates/home-en-mobile.png`, `candidates/home-hi-mobile.png`.
- Full Hindi homepage desktop/mobile: `home-hi-1440.png`, `home-hi-390.png`.
- Tutor profile desktop English/mobile Hindi: `candidates/profile-en-desktop.png`, `candidates/profile-hi-mobile.png`.
- Real no-match mobile Hindi: `candidates/empty-hi-mobile.png`.
- Parent reviewed progress: `parent-reviewed-en-desktop.png`, `parent-reviewed-hi-mobile.png`.
- Tutor confirmed lesson form: `tutor-confirmed-en-desktop.png`, `tutor-confirmed-hi-mobile.png`.
- Mentor scorecard: `mentor-scorecard-en-desktop.png`, `mentor-scorecard-hi-mobile.png`.
- Admin queue: `admin-en-mobile.png`, `admin-hi-mobile.png`.
- Hindi adult requirement form: `adult-requirement-hi-mobile.png`.
- Search filter drawer: `search-filter-mobile.png`.
- Search populated desktop and network-failure state: `search-en-desktop.png`, `search-network-error.png`.
- 200% component stress case: `components-200-percent.png` and the earlier failed screenshot during diagnosis.

Other files are captured artifacts, not automatically individually reviewed images. The homepage additionally has automated overflow checks at 360, 390, 768, 1024 and 1440 CSS px. Tests include relevant English/Hindi axe scans and keyboard checks. Private record text entered in English is intentionally not auto-translated or rewritten when interface language changes.

## Defects found and refined

1. Approval note overlapped the learning-preview mentor text. Moved it below the paper with deliberate spacing.
2. Small supporting text and low-contrast preview/illustration labels. Increased text sizes and darkened foregrounds; re-ran axe.
3. Form hints were part of the accessible label. Added explicit input IDs, labels and `aria-describedby` for hints/errors. The OTP flow now has the correct accessible name.
4. Header overflow at 200% CSS zoom. Collapsed redundant sign-in navigation when the menu is present; verified reflow.
5. Two-column controls became too narrow at that zoom level. Changed form grid columns to fit the available width.
6. Mobile hero grid grew wider than its container even without page-level scroll. Removed intrinsic minimum width on hero children and added a container-boundary assertion.
7. Large “no upcoming trials” state distracted from available reviewed progress. Used a compact state when reviewed records exist.
8. Corrected tutor pipeline/role labels. Hid the unfocused skip link reliably during full-page capture; it remains keyboard accessible.

## Reviewed regression baselines

The six files under `candidates/` were actually opened and reviewed before being copied to `tests/e2e/baselines`. `visual.spec.ts` compares against those reviewed originals with zero allowed different pixels. Homepage comparisons intentionally use a fixed 1000px viewport so they do not depend on which newly approved fictional tutor appears below the fold; full-page homepage evidence is separately retained. Profile/no-match baselines use complete pages with deterministic seed data and fixed assessment dates. No broken content is masked. There is no displayed live clock on those baseline screens.

These baselines are **Windows Chromium only**. Linux CI explicitly skips their raster comparisons; it still executes the connected workflow, layout, keyboard and axe tests. Establish separate reviewed Linux/other-browser baselines before broadening claims. Private-role artifacts currently have changing audit/session dates and are review evidence, not automated pixel baselines.

Final complete run: 10/10 Playwright tests passed, including all six exact-pixel comparisons and the Hindi adult requirement flow. The actual snapshots were reviewed before promotion; later tests compared without changing the accepted images.

`node scripts/capture-baselines.mjs` creates candidates against the running local application. It never promotes them automatically. Never run a blanket snapshot update and call that visual acceptance.

## Limits

CSS 200% scaling is a reflow stress check; native browser zoom, screen-reader/manual assistive-technology testing and an operator walkthrough remain unverified. Wider component catalog, unimplemented workflows, native mobile devices, WebKit/Firefox and Lighthouse/field performance are not accepted by these screenshots. Automated axe checks do not certify WCAG conformance.
