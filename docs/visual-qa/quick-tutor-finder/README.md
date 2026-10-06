# Quick tutor finder review

Captured and visually reviewed on 2026-10-07. `finder-1440.png` and `finder-390.png` show the Online/Offline buttons and open subject dropdown with Mathematics and Science selected. Screens use the isolated Go/MongoDB E2E stack and contain no private records.

`tests/e2e/quick-tutor-finder.spec.ts` verifies optional multiple subjects, keyboard selection, mode exclusivity, search/API parameters, refresh persistence, results-filter changes, all-subject wrapping, outside dismissal and focus restoration. Escape closes the dropdown first and the mobile filter panel on a subsequent press. Both captured states passed axe and overflow checks.

Additional fixture-based review under `.local/quick-finder-review/` covered 360, 390, 768, 1024, 1440 and 1920px with all five subjects selected: no overflow or axe violations. These fixtures intercept reads only and do not substitute for the separate database-backed discovery tests in `tutor_subjects_test.go`.
