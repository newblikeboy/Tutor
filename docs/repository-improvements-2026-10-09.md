# Repository improvements

Implements the actionable findings in [the repository audit](repository-audit-2026-10-08.md), preserving existing routes, approval rules, payments, files and communication features.

## Changes

- Mentor dashboard application reads use the assigned-assessor filter from the staff endpoints. Unrelated submitted applications no longer appear in that dashboard.
- Tutor discovery filters approval, expiry and paused availability before paging. Geographic searches retain the existing distance/service-radius rules while streaming candidates and retaining at most 101 public summaries. Pages contain up to 100 tutors with an opaque `X-Next-Cursor` header. Public discovery has a Load more action, with existing results retained when another page fails. Matching and handover selectors follow every page so their local filters see all eligible candidates. The array response remains compatible with already-open clients. Invalid cursors, coordinates and radii return validation errors.
- Academic reports use projected summary records and three grouped queries in place of `3*T + 2*A` per-record queries. Counts and review dates include records beyond the old 100-record limit. Founder payment collections use one monthly aggregation with exact integer paise totals, refunds, UTC months and a combined unknown-date bucket.
- Jobs process up to 25 records per five-second wake-up within the existing cancellation deadline. Empty queues stop the batch. Per-job leases, retries and idempotency remain; sanitized failure types and job kinds/statuses are logged without record contents or credentials.
- Public routes and parent/staff screens load separately. Private dictionaries register with their components; shared private navigation loads its own titles before child routes suspend. Home CSS loads with landing/discovery/profile routes.
- Removed the unused locality picker and its private imports/styles/copy, the test-only fee helper/assertion and obsolete root landing copy; pruned obsolete selectors from 424 CSS rule groups. Dynamic role selectors, active tuition conversations, legacy file access/scanning and retained encrypted records remain.
- Logo/hero imports emit hashed `/assets/` URLs using the existing Nginx long-cache policy. Original public image URLs remain available for previously published pages and already-open clients. Those public copies are compatibility snapshots.
- Capture scripts use current selectors and English-only scenario labels. Staff test expectations were aligned with session revocation and explicit approval modes after failures reproduced on the untouched base commit. The login persistence test now uses an approved tutor for its workspace expectation; applicant redirects are checked separately.
- Deployment asset staging records current/retired bundles in `ASSET_RETENTION.json`. A bundle receives a 30-day grace period when it stops being current. Older retired bundles stop being copied into new releases. Existing release directories and rollback assets are never deleted. The first deployment from a release without a manifest retains all its assets for the full grace period.

## Production-build comparison

Fresh desktop Chromium contexts, same local API, before/after production builds. KB means decimal kilobytes. Gzip is computed locally, not a claim about live server configuration.

| Page | JavaScript decoded, before → after | JavaScript gzip, before → after | CSS decoded, before → after |
| --- | --- | --- | --- |
| Homepage | 511 KB → approximately 441 KB | 161 KB → approximately 143 KB | 83 KB → approximately 67 KB |
| Tutor discovery | 511 KB → approximately 454 KB | 161 KB → approximately 149 KB | 83 KB → approximately 69 KB |
| Login/signup | 638 KB → approximately 559 KB | 200 KB → approximately 179 KB | 96 KB → approximately 55 KB |

Splitting routes creates more, smaller requests: the measured homepage goes from 3 to 13 script resources. Byte reductions are measured; real-user latency/Core Web Vitals are not. No universal speedup percentage is claimed.

## Verification

The final progress/acceptance checkpoint records passing checks. Dedicated regressions cover assigned/unassigned application visibility; more than 200 tutor candidates; eligibility beyond record 100; cursor progression and retry; retained public profile fields; invalid search input; more than 100 classes/plans; exact payment/refund/month totals and missing/zero dates; concurrent job leases and retries; asset grace periods and invalid manifest paths; fresh desktop/mobile public and role routes, labels, accessibility and overflow.

Visual evidence: `docs/visual-qa/repository-improvements/`. Ignored measurements and comparison files: `.local/repository-audit/`. Existing screenshot baselines are not promoted automatically. Test databases remain retained.

## Operational limits

Geographic filtering still scans eligible candidates to preserve per-tutor service-radius semantics; memory is bounded to a page. A geospatial/index redesign should follow production query-plan measurements. Other legacy callers of `storage.Many` still have its 100-record bound and need endpoint-specific pagination as those datasets grow.

Historical release directories still occupy disk; deleting them requires an operator-reviewed retention decision. After the 30-day retired-asset compatibility window, an older tab may need a refresh. No production migration, deployment, provider operation or deletion was run for this work.
