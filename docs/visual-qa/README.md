# Visual review evidence

Date: 2026-09-23. Actual Chromium (Playwright 1.63.0), Windows, device scale 1, self-hosted Manrope/Noto fonts. The real React application called the Go API and Atlas. All records shown are fictional. No screenshots of real child records, live credentials or payment/provider claims are included.

## Email/password redesign review

The old OTP login design is superseded. Individually opened final account images: `account-login-en-desktop.png`, `account-signup-en-desktop.png`, `account-login-hi-mobile.png`, `account-signup-hi-mobile.png`, `account-login-en-mobile.png`, `account-signup-en-mobile.png`, staff `login-hi-mobile.png`, `login-error-desktop.png`, `account-login-loading.png`, and `account-login-load-error.png`. Hindi desktop login was also inspected in `.local/auth-login-hi-1440.png`. The password component at 200% was inspected in the updated `components-200-percent.png`.

Fixed clipped illustration text, overly tall signup composition, small field typography and generic account-load error copy. Mobile prioritizes the form. A screenshot initially captured a route-loading skeleton; the test now waits for the form before screenshot/axe review. The four `account-*` desktop/Hindi-mobile baseline images were opened before copying to `tests/e2e/baselines`; all four passed zero-difference comparisons. Empty forms were captured so no passwords appear. `node scripts/capture-auth.mjs` creates review candidates only.

Full regression: 22/22 passed, including the 6 older public baselines and these 4 new account baselines. Final affected-suite rerun: 12/12 passed after error-copy/trailing-slash/screenshot-wait refinements. Public baselines were not rewritten. English/Hindi signup/login, keyboard, 360/390/768/1024/1440 overflow, CSS 200% stress, error/retry and axe checks ran. Native browser zoom and manual assistive-tech review remain unverified.

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
- Login follow-up: `login-en-desktop.png` and `login-hi-mobile.png`, inspected during the localhost login fix. Captured before requesting an OTP; no login secrets are retained in these images.
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

Initial checkpoint: 10/10 Playwright tests passed, including all six exact-pixel comparisons and the Hindi adult requirement flow. The actual snapshots were reviewed before promotion; later tests compared without changing the accepted images. After the local login address fix, the full suite passed 13/13, including three added login/security regressions and the same six unchanged baselines. The login screenshots listed above were individually inspected.

`node scripts/capture-baselines.mjs` creates candidates against the running local application. It never promotes them automatically. Never run a blanket snapshot update and call that visual acceptance.

## Limits

CSS 200% scaling is a reflow stress check; native browser zoom, screen-reader/manual assistive-technology testing and an operator walkthrough remain unverified. Wider component catalog, unimplemented workflows, native mobile devices, WebKit/Firefox and Lighthouse/field performance are not accepted by these screenshots. Automated axe checks do not certify WCAG conformance.
