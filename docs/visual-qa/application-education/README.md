# Education & experience review — 2026-10-07

Visually reviewed `education-1440.png` and `education-390.png`: updated labels, two document controls, JPG preview, PDF cards and View file/Remove actions. All identities, institutions and documents are fictional. Desktop document cards size independently; mobile stacks them.

`tests/e2e/application-education.spec.ts` uses isolated local Go/MongoDB and the Cloudinary protocol fixture. It verifies JPG and PDF in both resume and educational-document controls, immediate local thumbnail/PDF selection cards, completed attachments after reload, mixed qualification batches, private original-view links and byte-for-byte original preservation. The 1600px document JPG is not resized by the passport-photo preparation step. Unsupported text is rejected before any upload intent. Desktop/mobile axe and horizontal-overflow checks passed.

Existing `cloudinary-files.spec.ts` and `upload-performance.spec.ts` also passed for direct images/PDF/video, progress stages, private delivery and lost-response recovery without duplicate uploads. The fixture does not emulate Cloudinary image transformations or measure real network speed. No live provider upload or production deployment was performed.
