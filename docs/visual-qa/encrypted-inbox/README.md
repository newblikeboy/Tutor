> Historical screenshots of the retired encrypted inbox. Current screenshots and verification are in [Updates](../updates/README.md).

# Encrypted Updates review — 2026-09-26

Chromium exercised the actual Go API and an isolated local MongoDB replica set. These are fictional fixture messages/accounts, not production data or real deliveries.

All ten captures were individually opened and reviewed:

- `admin-activate-desktop.png`: passphrase setup, recovery limitation and confirmation.
- `admin-empty-desktop.png`: purposeful Sent empty state and compose action.
- `admin-compose-desktop.png`, `admin-compose-mobile.png`: recipient selection, encrypted subject/body and send action at 1440/390px.
- `admin-sent-desktop.png`, `admin-read-desktop.png`: two-column list/detail, decrypted subject preview, unread-to-read status and timestamp.
- `parent-activate-mobile.png`, `parent-inbox-mobile.png`, `parent-read-mobile.png`: activation, true unread count, list-to-message navigation and read-only receipt at 390px.
- `admin-read-360.png`: one-way tutor update and verified receipt at 360px.

The paper/ink/sage palette, clear field labels and keyboard focus were retained. Mobile shows the list or selected message with a Back action; desktop shows both. Long content wraps without horizontal page overflow. Recipient role wording was refined from workspace labels to Parent/Tutor/Administrator. Subjects decrypt only in browser memory. Read status uses text and an icon, not colour alone.

The final inbox E2E test passed, including a lost-response retry that created only one update, incorrect-passphrase rejection, unlock after reload, tampered-ciphertext rejection without a receipt, no parent compose/reply action, applicant reception and no unauthorized family recipients. Existing tuition/conversation/billing and support/Activity browser regressions also passed. Axe scans passed on the captured inbox screens. Additional local checks passed at 360, 390, 768, 1024 and 1440px and CSS 200% text reflow; keyboard activation of Lock discarded the message. Inspection confirmed no plaintext/passphrase in query data and no crypto operations in the global mutation cache.

The parent workspace desktop baseline initially differed by exactly 132 pixels, confined to replacing the Updates sprout icon with the envelope icon. The actual image and diff were individually reviewed before copying that candidate to `tests/e2e/baselines/english-only-workspace-parent-en-desktop.png`. The mobile baseline remained unchanged. Both exact-pixel workspace comparisons subsequently passed.

This is Chromium/Windows verification. Other browsers, real mobile hardware, native browser zoom, manual screen readers, independent cryptographic review and live droplet deployment are not claimed. The admin test-environment banner and sample-record labels are existing fixture disclosures; they do not appear as an encryption guarantee.
