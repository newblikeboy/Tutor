# Upload performance verification — 2026-10-07

`tests/e2e/upload-performance.spec.ts` runs against the isolated local Go API, MongoDB replica set and loopback Cloudinary protocol fixture. All identities and media are fictional.

- Reviewed `local-preview-1440.png`, `local-preview-390.png` and `saving-mobile.png`: selected image, filename, not-saved label, responsive sizing and saving feedback.
- Desktop/mobile axe scans and horizontal-overflow assertions passed. Existing private-file desktop/mobile captures in `../cloudinary-direct/` were regenerated and reviewed.
- Actual browser photo preparation: 2400px PNG, 96,476 bytes -> 1280px JPEG, 9,910 bytes. This generated image is not a representative real-world network benchmark.
- Upload response deliberately lost after provider persistence. Retry verified the existing object with identical metadata: one Cloudinary upload, one draft save and one persisted attachment after reload.
- Progress appears during upload, verification and saving; the selected preview remains after failure. Unchanged drafts require no preliminary save.
- Protocol E2E confirms fixed preview transformation, authenticated type and 300-second expiry. Downloads retain originals; image/PDF/video delivery and playback passed.
- Go integration tests deny preview/download requests from unrelated accounts and revoke new preview links after reviewer reassignment.

`measurements.json` records client byte counts and request counts. The fixture returns source bytes and does not implement Cloudinary WebP encoding or CDN behavior. No live approved photo was available for a read-only check, so provider transformation success and latency are not claimed. No real provider upload or deployment was performed.
