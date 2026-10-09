# Class-count package schedule verification (2026-10-10)

The latest four captures show weekly packages with 6 classes and monthly packages with 24 classes at desktop (1440px) and mobile (390px). The tutor offers one teaching day per week and has planned leave on the second date. Both schedules retain their full count, skip that leave and extend beyond calendar periods. All four captures were individually inspected; axe, horizontal overflow and page-error checks passed.

`tests/e2e/package-schedule.spec.ts` uses the real Go API and an isolated local MongoDB database identified by the ignored runtime manifest. Authenticated staff fees/approval, guardian consent, trial feedback and both saved Home enrollments use real APIs. Each saved immutable agreement matches every reviewed date, class count and package price. No provider payment or activation is fabricated; bookings remain awaiting verified payment. Fixture databases are retained.

Frontend unit tests cover 6/24 classes across calendar boundaries, leave, duration, the scheduling horizon and Online hourly behavior. API coverage includes immutable legacy prices/counts, subject multipliers, staff fee validation, approval, reservations and verified payment activation. Home-only offerings expose their staff fee version.

Older `invalid-weekly-*` and `valid-monthly-*` captures are historical evidence of the superseded calendar-period rule. The operator explicitly replaced that rule with class-count packages; these older captures do not describe current behavior.
