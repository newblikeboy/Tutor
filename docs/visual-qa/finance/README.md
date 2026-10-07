# Finance verification — 2026-10-08

Eight reviewed Chromium captures at 1440px and 390px:

- `business-*`: real Go/MongoDB admin form save/reload, fictional GSTIN/address and tax assessment in an isolated retained test database.
- `revenue-*`: real authorized finance API reads, empty-data state and exact zero totals (no invented revenue).
- `tutor-*`: real tutor account, private earnings/payout empty state.
- `invoice-sample-*`: explicitly **render-only** supplier invoice response fixture. Backend invoice persistence, ownership, immutable records and GST arithmetic were separately verified by the MongoDB integration test.

Both Playwright tests passed. No page errors, horizontal overflow or axe violations. Print-media check keeps the invoice visible and hides its print button. All eight captures inspected individually.

The first browser run failed because its success assertion matched two `role=status` elements; the form save itself succeeded. The selector was narrowed to the saved message before the passing rerun. Go financial tests also cover exact paise allocation, negative platform contribution without reduced tutor payout, IST week boundaries, tax holds, original/replacement tutor isolation, duplicate capture/refund handling, concurrent idempotent batch preparation and separate settlement verification. Targeted financial/payment MongoDB tests passed with `-race` against a local replica set; no provider money moved.

Environment recovery: the Windows C: drive filled during compilation and the local MongoDB process was unavailable. Go build caches/temp files were redirected to ignored `.local/finance-*` directories on D:. MongoDB was restarted against its existing data path and completed recovery. No retained databases or project records were deleted.
