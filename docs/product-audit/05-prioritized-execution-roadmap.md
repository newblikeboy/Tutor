# Prioritized Execution Roadmap

This roadmap is reviewable implementation scope following the audit. No application changes are part of this checkpoint. Preserve the approved authentication design, current stack, saved records and all server gates.

Effort **S** means a focused copy/semantic/component change; **M** spans a few related views or an existing data flow; **L** includes a new server contract, migration/index/performance work or several dependent journeys. These are relative estimates, not promised delivery dates. Frontend work remains React/TypeScript; backend work remains Go/chi/MongoDB. No Docker, platform migration, paid provisioning or deployment is proposed here.

## Implementation order

| Batch | Work / finding IDs | Priority and expected impact | Dependencies | Effort / risk | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| A1 | Correct public missing English keys; useful support action; remove obsolete needs/mentor-review promises (UX-07, UX-18) | P1; truthful service explanation and usable help | Operator supplies/reviews actual policy information; existing support destination | S–M / low technical, content dependency | No raw translation keys; public copy matches direct feedback and learner-first flow; Help reaches help |
| A2 | Fix nested main and heading outlines (UX-06) | P1; assistive navigation | Existing public shell/history empty state | S / low | Axe findings resolved at both widths; keyboard/heading review; visual layout preserved |
| A3 | Remove unsupported time question/generated goal context; use exact class and class-appropriate subjects; accurate approval wording (UX-02, UX-04) | P1; honest criteria | Copy/filter review and existing All Subjects rule | S–M / low | No time-filter promise; class 6 is searched as class 6; primary subjects fixed; existing availability selection unchanged; no unsupported badge |
| A4 | Enforce all requested subjects in public matching (UX-17) | P1; eligible shortlist | Explicit API semantics and class 1–5 All Subjects rule; existing indexed approved-scope query | M / medium backend | Tutor missing one selected subject excluded; pagination complete; single subject and private finder regressions pass |
| A5 | Named confirmation and real reason for mentor status actions (UX-05) | P1; operational accountability | Existing server action/reason contract | M / medium consequential workflow | Cancel sends nothing; confirmed action names account and persists authored reason; conflict/error visible; permissions unchanged |
| B1 | Preserve search/learner/trial/tutor context through profile, auth and regular booking (UX-03, UX-09) | P1/P2; fewer re-selections | Define safe URL-context contract; A4 eligibility semantics | M / medium | Back/reload works; correct tutor/learner opens; tampered/stale references rejected server-side; family-wide payments remain clear |
| B2 | Add next regular lesson and valid checkout notice to parent Home (UX-01) | P1; recurring daily task | Authorised existing tuition/trial reads and selection context; B1 exact lesson links | M / medium | Next trial/regular ordering; first use; no upcoming class; valid/expired checkout; no unpaid active card |
| B3 | Contextual finder controls and selected-mode prices (UX-08, UX-11) | P2; simpler search | Current saved location, scope and staff prices | M / medium | Online has no distance task; Home coordinates required; class 4 fixed All Subjects; class 8 total multiplier correct |
| C1 | Next lesson first; Upcoming/History groups; compact report overview/mobile filters (UX-10) | P2; easier teaching/progress tasks | B1 links, existing full history and report state | M / medium | Full records retained; `?class=` works; report tabs/filters/reload; no inferred results; corrections/handover unchanged |
| C2 | Focused tutor selected-lesson entry and payout summary (UX-12) | P2; daily tutor clarity | Existing next-lesson/deep-link/record/payout APIs | M / medium | Actual attendance/progress; correction deadline; net/pending/paid reconciles with saved finance detail |
| D1 | Group staff navigation and expose admin email-monitoring shortcut (UX-13) | P2; operations findability | Role-by-role route inventory and permission review | M / medium | Admin/mentor/support/finance task destinations reachable; no new permission; uncertain email retry still guarded |
| D2 | Static code-sign-in eligibility copy (UX-14) | P2; fewer staff login misunderstandings | Existing approved auth layout and generic server response | S / low | Parent/tutor boundary clear; staff password only; account enumeration remains prevented |
| E1 | Establish task/performance baselines and long-history profiling (UX-15) | P2; validated scaling decisions | Privacy-reviewed analytics/participant plan and realistic fixtures | M / low if read-only | Route/API bytes/latency/cadence measured; actual task failures/times recorded; no fabricated improvement numbers |
| E2 | Server-side matching/report pagination or summaries, only if measurements justify | P2; growth performance | E1, contracts/index design, complete-history/access guarantees | L / high | Complete authorised results/history; cursor/summary consistency; measured benefit; stale/version/handover coverage |
| F | Optional mobile destination-bar prototype (UX-16) | P3; hypothesis only | B/C task fixes and user observation | S–M / medium layout | Demonstrated task benefit; no covered form/keyboard controls; no duplicate Find a tutor menu entry |

A1–A3 are small, reviewable correctness improvements; A4 and A5 require focused behaviour checks. B delivers the greatest cross-screen parent benefit. C builds on the recently improved tutor/report features. D improves operational coherence. E prevents an unmeasured backend rewrite; F remains optional.

## Release-sized milestones

**Milestone 1: accurate public journey and safe staff intent.** Complete A, plus an operator-reviewed content list for any policy material still pending. Ship semantic/copy fixes without a style overhaul. Public matching has explicit all-subject semantics. Staff actions preserve auditability and permission gates.

**Milestone 2: continuous parent journey.** Complete B with selected-learner continuity, a truthful next-class Home and mode-aware discovery. Verify trial feedback → regular checkout end to end in isolated fixtures. Keep payment confirmation automatic after server verification and regular tutor acceptance absent.

**Milestone 3: teaching and report clarity.** Complete C with retained full history, optional test evidence, mandatory present-progress and appropriate correction/archive access. Review both parent and tutor views before considering them complete.

**Milestone 4: operations and measurement.** Complete D/E1. Decide E2/F from actual evidence. No new rating system, learner ranking, live chat, AI-generated academic result, analytics suite or mobile app is required to accomplish these milestones.

## Verification matched to changed behaviour

| Change | Necessary checks |
| --- | --- |
| Documentation/copy/semantics | Broken links/keys, relevant browser views, heading/landmark/contrast review; do not add implementation-mirroring tests |
| Discovery/context | Single/multiple subjects, complete pagination, approved scope/expiry/suspension, learner ownership, Back/refresh/auth destination and no-results recovery |
| Parent Home/booking | Multiple learners, trial versus regular order, tomorrow minimum, All Subjects versus subject multipliers, 6/24 dates across boundaries, leave/conflicts, expired holds, server-verified activation and retry idempotency |
| Tutor/report | Assignment isolation, actual attendance/homework/topic/test evidence, missing data, seven-day correction/version conflict, completed archive, consented handover and old-tutor revocation |
| Staff/status | Role/assignment denial, deliberate named confirmation, reason persistence, cancel/no mutation, stale version and audit result |
| Email/navigation | Admin-only metadata, no codes exposed, retry safeguards; code-worker/update independence retained; no real delivery for navigation-only checks |
| Shared responsive components | 390/1440 screenshots, 360/768/1024/reflow samples, keyboard-only, focus/menus/tabs, relevant axe findings and manual accessibility review |
| Backend contract/performance | Generated OpenAPI/types reproduce, appropriate Go tests/vet with isolated MongoDB, measured complete-history and API-load behaviour |

Use `npm run typecheck`, `npm run lint`, `npm run build` and relevant existing frontend tests for application changes. Use Go tests/vet and targeted real isolated MongoDB/browser tests where API or business flow changes. Broaden tests when new failures or shared behaviour justify it. Do not rerun unrelated large suites for prose-only audit updates.

## Risks and dependencies

- **Payments:** Live gateway configuration/acceptance is distinct from local UI correctness. Neither a nicer status label nor a provider client callback may bypass verified activation/reservation gates.
- **Location:** A typed address is not valid geography. Any manual location alternative needs a real supported resolution path, persisted coordinates and truthful error handling; do not add a dummy fallback.
- **History/access:** Shorter screens must not imply shorter records. Preserve complete history and private assignment rules, especially after completion/handover.
- **Finance:** Changing hierarchy must not change saved percentages, tax treatment, release conditions or agreement prices.
- **Staff actions:** Test consequential changes on isolated staff fixtures. Navigation changes must not broaden authority or create public staff provisioning.
- **Policies:** Actual terms/refund/privacy statements come from the operator's business practices; their absence is a content dependency, not permission to invent them.
- **Providers/email:** Zoom, Cloudinary, Razorpay and Google inbox delivery each require their own real acceptance evidence. Local fixture success is not provider success.
- **Scope:** Preserve current worktree changes, service/database/session identifiers and historical records. No public deployment or real charges are part of this roadmap checkpoint.

## Decision record

Proceed with incremental correction and journey work after review of these documents. Retain the current visual identity. Establish actual task baselines before numerical improvement targets. Treat E2/F and any new feature as evidence-dependent proposals. The original prompt's broader product ambition is achievable through these existing journeys without changing the technology stack or introducing speculative functionality.
