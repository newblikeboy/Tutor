# Test code and fixtures

Tests protect active behavior and do not ship as application screens. Go excludes
`*_test.go` from API builds, and Vite follows the application import graph rather
than bundling the frontend test directory or Playwright scripts.

- `apps/api/internal/**/**_test.go`: domain rules, authorization, persistence,
  provider protocols, payment idempotency and concurrency. Integration tests need
  an explicit `TEST_MONGODB_URI`; a skipped integration test is not a passing
  database check.
- `apps/web/src/tests`: component accessibility and shared UI calculations.
- `tests/e2e`: browser journeys, responsive layout, keyboard and accessibility
  checks using the Go API. Individual tests describe the behavior they protect.
- `scripts/e2e-server.mjs`: starts an isolated API/frontend/database namespace.
  Google, SMTP and optional Cloudinary fixtures use loopback endpoints. It does
  not send real email, create live meetings or make real payments.
- `tests/e2e/baselines`: four reviewed Windows sign-in/sign-up images. Other
  platforms need separately reviewed images; never regenerate blindly.
- `/components`: local development examples only; its route and component module
  are excluded from production builds.

Run frontend unit tests with `npm run test`, Go checks from `apps/api` with
`go vet ./...` and `go test ./...`, and browser tests with `npm run e2e` after
configuring an isolated local replica set. `playwright.config.ts` starts the test
servers on 8081/5174 without replacing the normal local servers on 8080/5173.

The obsolete public/workspace snapshot suites, their retired images, unreferenced
older images, one-off capture scripts and the removed guardian-unconfigured
scenario were deleted. Current functional, responsive and accessibility tests
remain, including parent consent and independent per-student study expiry.

Payment simulation, fictional seeds and provider fixtures are retained for their
explicitly supported test flows. Never remove their environment checks or sample
labels as cleanup, and never delete retained databases as part of source cleanup.
