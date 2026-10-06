# Parent learner context and unused learning needs

Captured and visually inspected on 2026-10-07 using Chromium and fictional records persisted through the Go API to an isolated local MongoDB replica set. No production records or credentials appear here.

- `home-1440.png`, `home-390.png`: top-left learner selector, learner metadata and matching action for the selected learner.
- `delete-1440.png`, `delete-390.png`: unused-need confirmation, alongside a need with a cancelled trial that cannot be deleted.

All four states passed axe and horizontal-overflow checks. The E2E also verifies URL/history/refresh selection, confirmation cancellation and focus restoration, a simulated stale-booking conflict, real API deletion and reload persistence while preserving the other learner and trial history. The initial error-announcement issue and stretched desktop confirmation text were fixed before these final captures.

Run `tests/e2e/parent-learning-needs.spec.ts` with Playwright and an explicitly configured local `MONGODB_URI`; the test launcher creates a separate retained database. API tests in `requirements_test.go` use `TEST_MONGODB_URI` and verify ownership, CSRF, all trial states and booking/deletion races through two API instances.
