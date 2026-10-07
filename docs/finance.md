# Tutor earnings and platform finance

## Commercial policy

The user approved a guaranteed **75% tutor bank payout**, with **25% reserved for the platform inclusive of applicable tax costs**. All calculations use integer paise. Staff still set hourly Online and weekly/monthly Home package prices. Tutors cannot edit pricing. Existing agreement prices do not change.

The split uses the captured class/package fee after any refunds completed **before** the tax allocation is reviewed. The tutor's 75% is rounded once at booking level. Cumulative allocation distributes rounding across classes so the class totals exactly match the booking. This is a bank-payout guarantee, not a guarantee about a tutor's final annual personal income-tax liability.

The platform's allocation is not profit. Commission GST is extracted inclusively from that allocation. Reviewed TDS, GST TCS, platform-funded tuition GST and actual gateway costs reduce the platform contribution, never the tutor's bank amount. A loss is displayed as a negative contribution; it is not hidden by reducing the tutor share. Gateway input-tax credit is not automatically claimed.

## Admin business setup

`/billing?tab=business` is linked as **Business & taxes** in the administrator sidebar. The initial, unsaved form contains **Synqvest System LLP** and Delhi state code **07**, as provided by the operator. No GSTIN, address, SAC or tax rate is invented. Admins enter registered details, the platform GST rate and accountant-approved marketplace policy. Finance can read, but cannot change, business settings. Version checks prevent overwriting concurrent edits. Each reviewed booking retains a full immutable settings snapshot.

The registered business must verify its actual supplier/invoicing model. This implementation supports a reviewed marketplace allocation; it does not automatically decide education exemptions or the LLP's legal status as supplier of tuition. Each booking requires finance to record verified tax bases/rates and evidence before earnings can be released. Evidence must cover PAN verification, tax-year turnover and threshold eligibility, supplier GST, place of supply, timing, and any required gross-up. Entering zero is an explicit assessment, not an unconfigured fallback.

Current primary reference: [Income-tax Act 2025, section 393](https://www.incometaxindia.gov.in/w/section-393-6), including e-commerce withholding and exceptions. Rate/threshold applicability, tax registration validation, return filing, tax deposits and certificates remain accountant/operator responsibilities. The application calculates reviewed amounts; it does not claim that a tax has been filed or paid.

## Payment, earnings and payout lifecycle

1. Existing Razorpay order/HMAC/provider-fetch/webhook verification collects the full price before scheduled tuition activates. A browser callback alone never activates a class.
2. A usable capture creates one `finance_bookings` allocation with `tax_review` status. Future classes remain family prepaid funds, not recognized platform revenue.
3. Finance approves the immutable booking tax assessment. A class becomes earned only after its actual end, present attendance and mentor review. Absent, disputed, makeup and future classes do not release earnings. A delayed development timeline cannot release future earnings early.
4. Equal debit/credit journal entries recognize tutor payable, commission revenue, commission GST components and the reviewed platform-funded costs. Cost allocations in the class journal are management/accrual accounting; statutory reporting periods and advance-tax treatment require the reviewed policy, not the class date alone.
5. Earnings become due Wednesday at 09:00 IST after the week in which they were recognized (Monday–Sunday). Delayed reviews therefore move the due date. Finance prepares a batch of up to 100 due classes for one tutor. Additional due classes remain available for another batch.
6. A batch is a payment instruction, **not a bank transfer**. The operator transfers the money through the bank using separately verified tutor payout details, records the actual UTR/time, and a different admin/finance user verifies the settlement. Only then is the batch `paid` and the bank journal posted. No Razorpay Route or bank API sends payouts in this version.

Idempotent preparation, transactions on payment/earning records, unique bank references and immutable settlement journals prevent duplicate application-recorded payouts. Bank confirmation is a two-person manual attestation, not provider verification. See [Razorpay Route](https://razorpay.com/docs/payments/route/) for a potential separately configured automated settlement integration; it is not enabled here.

## Refunds and handovers

Refund reservations cannot consume already earned class value. Pending refunds hold new earnings and batch preparation; rejection or provider completion retries reviewed classes. Refunds after allocation cannot create unfunded earnings: classes exceeding the remaining prepaid balance enter an explicit finance hold. These cases require reconciliation of class entitlements/refunds; no money is fabricated to cover the gap.

Consented handovers preserve historical tutor earnings. A replacement tutor's completed classes require a separate immutable class tax review, preserving the original class's exact gross fee and net tutor share while recording the new supplier's tax treatment. The replacement sees only their own class earnings. Holds are visible to finance and the affected tutor and can be rechecked after resolution.

## Parent records and invoices

Parents list only provider-captured payments and cannot read internal journals or finance endpoints. Finance may record a supplier's approved paid invoice, including its original number, supplier/customer addresses, SAC, place of supply and inclusive GST rate. The server fixes the invoice total to the actual captured payment, calculates CGST/SGST or IGST, records the verified actor and prevents overwrites/duplicate supplier invoice numbers. The parent can print/save that private invoice as PDF. This records an approved invoice; it does not automatically determine the legal supplier, register an IRN, issue credit notes or substitute a payment receipt for a tax invoice. Until an approved invoice is recorded the existing payment receipt remains explicitly labelled as such. Refund history remains separate from the original invoice.

## Release boundary

Production Razorpay remains gated by the existing release controls. No real charge, refund, payout or tax filing is authorized by local development tests. Before enabling real transactions, complete accountant-reviewed business/supplier details, invoice/credit-note and tax-remittance operating procedures, verified tutor bank onboarding, Razorpay sandbox acceptance and the existing production payment release checklist. Paid trial pricing is unchanged; the existing trial fee gate remains.
