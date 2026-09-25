# Ordinary Updates review — 2026-09-26

Chromium exercised the real Go API and an isolated local MongoDB replica set using fictional accounts/messages. End-to-end encryption has been removed at the operator's request.

Nine captures were individually opened and reviewed:

- `admin-empty-desktop.png`: direct Sent view without activation.
- `admin-compose-desktop.png`, `admin-compose-mobile.png`: recipient selection and ordinary Send update action at 1440/390px.
- `admin-sent-desktop.png`, `admin-read-desktop.png`: persisted message before and after the recipient opens it.
- `parent-inbox-mobile.png`, `parent-read-mobile.png`: unread count, subject preview, one-way detail and read timestamp.
- `parent-other-browser-mobile.png`: the same message opens in another authenticated browser without a key or passphrase.
- `admin-read-360.png`: read receipt and message reflow at 360px.

The paper/ink/sage palette, readable focus outlines, mobile Back action and desktop split view remain. Encryption badges, passphrase forms, activation and device-link controls are absent. Axe scans passed for all captures. The test also checked 360, 390, 768, 1024 and 1440px page widths and CSS 200% text reflow without horizontal overflow.

The inbox browser flow passed, including sending before the recipient first visits Updates, a response lost after commit followed by a deduplicated retry, a failed detail fetch remaining unread, recipient-only acknowledgements, reload persistence, applicant receiving and no parent reply/compose action. The existing billing/tuition-conversation/Activity browser regression also passed (two tests total).

The admin development banner and sample labels are fixture disclosures. They are unrelated to message encryption. These checks cover Chromium on Windows; other engines, real phones, manual screen readers and live droplet deployment were not tested here. The previous encrypted-inbox captures are retained only as historical evidence.
