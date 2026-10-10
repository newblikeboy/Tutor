# Product audit browser evidence — 10 October 2026

See [the audit index](../../product-audit/README.md). This is diagnostic evidence, not approved visual baselines or a release certification.

## Environment and coverage

- Current React/Vite frontend on `127.0.0.1:5174`, actual Go API on isolated port 8081 and exact local MongoDB replica-set database named in the main manifest.
- Fictional sample accounts, two learners (classes 4 and 8), approved tutor scopes/staff prices, recorded trial/class feedback, six-class active presentation package, unpaid Home checkout and support case. Direct fixture insertion does not establish provider-verified paid activation.
- Public, parent, tutor, applicant, admin, mentor, support and finance journeys. Fifty-eight successful views/states at 1440×1000 and 390×844, producing 116 paired screenshots.
- [Main manifest](evidence.json): 49 successful pairs and three initial drawer attempts that used the wrong accessible-name selector (`Menu` instead of `Open menu`). Those are audit-tool failures, not application errors; partial desktop artifacts remain. [Follow-up manifest](followup-evidence.json): nine successful pairs, including all three corrected drawers and actual email-delivery tab `mail` (the earlier `emails` URL captured Account profile).
- Full screenshots are `screen-name-width.png`. Twenty `contact-width-number.jpg` sheets show the top viewport of all successful captures. All contact sheets were inspected; representative full-height parent Home/report/booking/feedback and finance screenshots were also inspected. This is not individual full-height review of every baseline.

## Results

| Check | Result and limit |
| --- | --- |
| JavaScript page errors | None observed in the successful captured states |
| Document horizontal overflow | None at 390/1440; report tab additionally checked at 360/768/1024 |
| Axe | Public profile: nested/duplicate/unique-main landmark findings at both widths. Public results, including multi-subject variant: mobile heading-order finding. Empty admin Decision history: heading-order finding at both widths. Other captured states have no reported axe violations |
| Private signed-out route | Redirected directly to login with `/tuition/audit-active` preserved in `return` |
| Parent drawer keyboard | Escape closed drawer and restored trigger focus |
| Report tabs | ArrowRight focused Subjects; Enter activated it; selection survived reload |
| Report outage | Deliberately intercepted progress request returned 503, displaying a visible retry state. The two recorded 503 responses belong to this simulation |
| Multiple-subject discovery | Public Mathematics + English/class 8 returned a tutor approved for Mathematics/Science: a confirmed matching defect |
| Regular booking | Form opened and packages/subject selection inspected; no quote accepted, checkout submitted or payment made |

No unexpected API failure was observed in these fixtures. This does not verify all backend routes or boundary cases. The local payment provider was disabled; that screen correctly showed payment unavailable. The audit did not test a real Razorpay charge, Zoom host, Cloudinary upload, SMTP acceptance/inbox arrival, production latency, screen reader, 200% zoom or real-device network performance.

Background reminder scheduling may create pending jobs from fictional dates; isolated provider configuration points to loopback fixtures. No real-recipient email/code request or live provider operation was made. The database is retained. Only audit-owned services are stopped after review; normal development services are preserved.

No personal production records, authentication codes, passwords or provider credentials are included in these artifacts. Sample identifiers and `example.test` addresses are fictional.
