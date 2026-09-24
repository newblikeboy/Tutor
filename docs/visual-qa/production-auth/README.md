# Production account browser review

The locally built frontend was served over loopback HTTPS to Chromium, proxying the real Go API with `APP_ENV=production`, `AUTH_PROVIDER=password` and an isolated real local MongoDB replica set. The test certificate was self-signed and accepted only by that local browser context. No public site, Atlas data, email delivery or provider action was involved.

Parent and tutor signup, logout, login and reload persistence passed. The browser verified actual Secure, HttpOnly and SameSite=Lax cookie attributes and the production config response. Every screenshot below was individually opened and reviewed; the approved account design remains intact, the forms fit their viewport, and the staff screen explains its separate availability boundary. No visual baseline was replaced. Axe returned zero violations on all six views; no horizontal overflow or browser page errors were recorded.

- `login-1440.png`, `login-390.png`: enabled parent sign-in form.
- `signup-1440.png`, `signup-390.png`: enabled public signup form.
- `staff-1440.png`, `staff-390.png`: staff access stays closed pending MFA.

Local harness: `.local/production-auth-browser.mjs`; data retained in `tutor_test_prod_browser_1790278781073`. The committed `apps/api/internal/app/production_auth_test.go` separately covers real database/TLS behavior, negative security cases, rotation, cross-instance persistence and proxy limits. Native assistive-technology and cross-browser checks were not performed. Droplet-origin verification remains an operator deployment step.
