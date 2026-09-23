# Visual review evidence

## Private dashboard redesign, 2026-09-23

The private application now uses a distinct ink sidebar and paper workspace, retaining the approved account colours. English/Hindi desktop and mobile layouts were rendered in actual Chromium against Go/Atlas. Role screenshots contain explicitly fictional development fixtures; no actual child records or credentials were captured.

Individually opened at this checkpoint: both `candidates/workspace-parent-*.png` images; populated `parent-reviewed-en-desktop.png` and `parent-reviewed-hi-mobile.png`; `tutor-confirmed-en-desktop.png` and `tutor-confirmed-hi-mobile.png`; `mentor-scorecard-en-desktop.png` and `mentor-scorecard-hi-mobile.png`; `admin-hi-mobile.png`; `workspace-admin-en-1440.png`; `workspace-tutor-hi-1440.png`; `workspace-parent-mobile-menu.png`; `workspace-parent-200-percent.png`; `workspace-loading.png`, `workspace-error.png` and `workspace-queue-empty.png`. The long learner-name capture was also opened and exposed a view-selection race, subsequently fixed. Initial four-role English desktop and parent Hindi mobile captures were inspected under the ignored `.local/workspace-review/` directory. Other captured widths are not automatically claimed as individually inspected.

Review fixed step-number contrast, complementary landmark names, the search field's accessible label, contextual empty-state copy and the full-page sidebar background. The drawer close target is 44px; its final mobile rendering was reopened. Also inspected `workspace-parent-hi-1440.png`, `application-submitted-en-desktop.png` and `adult-requirement-hi-mobile.png`. Two first-use parent candidates were opened after the contrast refinement, then copied to the new Windows-only `workspace-parent-en-desktop.png` and `workspace-parent-hi-mobile.png` baselines. All twelve baselines passed exact-pixel comparison in the final regression; the existing ten public/account baselines were not rewritten. `scripts/capture-workspace-baselines.mjs` captures only the verified fictional empty parent fixture and does not promote images automatically. It reads the private fixture password locally and never captures it.

`workspace.spec.ts` exercises role navigation/reload, English/Hindi at 360/390/768/1024/1440, keyboard skip, mobile drawer/Escape focus, default axe rules, CSS 200% reflow, actual persisted learner switching and queue filters, request/session errors/retry, sign-out and role denial. Full-journey tests still exercise the real multi-step forms. Final regression passed **33/33**, including all 7 workspace tests and all 12 reviewed pixel baselines; sampled axe scans reported no violations. Reopened the final `workspace-long-learner-name.png` after the URL-state fix: the correct My learners view persists, full name wraps, and content remains within 360px. Other role images include changing audit dates and remain review evidence rather than pixel baselines.

## Homepage photo redesign, 2026-09-23

The homepage now follows the account page's paper/ink/sage direction with a generated tutoring photograph and balanced grids. The source image was opened before use. Opened the desktop English and mobile English/Hindi candidates under `candidates/home-*.png` before promoting those three images to the existing Windows baselines. Image decoding is now awaited by both the candidate script and comparison test. The seven other account/profile/no-match baselines were preserved and passed.

Individually inspected: the three hero candidates; the full English and Hindi desktop/mobile homepage captures, including `home-en-1440.png`, `home-hi-1440.png` and `home-hi-390.png`; the 1024px composition; `landing-tutors-loading.png` and `landing-tutors-error.png`; and the English/Hindi process portions in `landing-*-200-percent.png`. Some full-page journey captures show the visible main focus outline after keyboard skip navigation. Additional widths were captured and automatically checked; their existence alone is not a claim of individual visual inspection.

Refinements from review: responsive image selection now allows for the cover crop, so desktop uses an adequately sized source; error copy describes the failed tutor query; loading surfaces use the landing palette; tutor-card footers align for different content lengths. The generated scene is explicitly labelled and is not used as a real tutor profile.

Full regression: **24/24 passed** in 2.8m, including the actual four-role Atlas journey and all 10 reviewed baselines. Final affected regression after the small refinements: **12/12 passed** in 1.1m. `home.spec.ts` checks both languages at 360/390/768/1024/1440, column alignment, image decode, keyboard FAQ/menu/skip, CSS 200% reflow, real entry-point navigation, and loading/error/retry; sampled axe checks passed. Existing journey coverage verifies real empty search. No Lighthouse, manual screen-reader, native-zoom, other-browser or production-readiness claim is made.

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
