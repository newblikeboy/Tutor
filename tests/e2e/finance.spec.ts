import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
async function login(page: Page, id: string) {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).csrf as string
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await mkdir('docs/visual-qa/finance', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/finance/${name}.png`, fullPage: true })
}

test('admin business settings persist and finance/tutor/parent access stays separate', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page, 'admin-a')
  await page.goto('/billing?tab=business')
  await expect(page.getByRole('heading', { name: 'Business & taxes', exact: true })).toBeVisible()
  await expect(page.getByLabel('Legal business name', { exact: true })).toHaveValue(
    'Synqvest System LLP',
  )
  await page.getByLabel('Legal business name', { exact: true }).fill('Sample Synqvest System LLP')
  await page.getByLabel('GSTIN', { exact: true }).fill('07AAAAA0000A1Z5')
  await page.getByLabel('Platform service SAC', { exact: true }).fill('999293')
  await page.getByLabel('GST on platform commission (%)', { exact: true }).fill('18')
  await page
    .getByLabel('Registered billing address', { exact: true })
    .fill('Fictional test office, New Delhi 110001')
  await page
    .getByLabel('Accountant-approved tax policy', { exact: true })
    .fill(
      'Test-only marketplace policy. PAN, annual thresholds, GST status and platform-funded withholding must be reviewed for every booking.',
    )
  await page
    .getByLabel(
      'These details and the marketplace tax treatment have been reviewed by our accountant.',
    )
    .check()
  await page.getByRole('button', { name: 'Save business details', exact: true }).click()
  await expect(page.getByText('Business settings saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Legal business name', { exact: true })).toHaveValue(
    'Sample Synqvest System LLP',
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await capture(page, `business-${width}`)
    await page.getByRole('tab', { name: 'Revenue & payouts', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Revenue from completed classes', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'No payout batches yet', exact: true }),
    ).toBeVisible()
    await capture(page, `revenue-${width}`)
    await page.getByRole('tab', { name: 'Business & taxes', exact: true }).click()
  }
  await page.context().clearCookies()
  await login(page, 'finance-a')
  await page.goto('/billing?tab=business')
  await expect(page.getByLabel('GSTIN', { exact: true })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save business details', exact: true }),
  ).toHaveCount(0)
  await page.context().clearCookies()
  await login(page, 'tutor-meera')
  await page.goto('/billing')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.getByRole('heading', { name: 'Your earnings', exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'No payout batches yet', exact: true }),
    ).toBeVisible()
    await capture(page, `tutor-${width}`)
  }
  expect((await page.request.get('/api/v1/finance/business')).status()).toBe(403)
  await page.context().clearCookies()
  await login(page, 'parent-a')
  await page.goto('/billing')
  await expect(page.getByRole('tab', { name: 'Revenue & payouts', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Business & taxes', exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/v1/finance/earnings')).status()).toBe(403)
  expect(errors).toEqual([])
})

test('paid invoice layout is private and printable (render-only sample fixture)', async ({ page }) => {
  await login(page, 'parent-a')
  const createdAt = '2026-10-01T05:00:00Z'
  // Financial persistence/permissions are covered against MongoDB in finance_test.go.
  // This clearly fictional response isolates invoice rendering from external payments.
  await page.route('**/api/v1/billing/sample-invoice', route => route.fulfill({
    json: {
      intent: { id: 'sample-invoice', enrollmentId: 'sample-enrollment', amountPaise: 100000, currency: 'INR', state: 'captured', orderId: 'order_sample', paymentId: 'pay_sample', refundReservedPaise: 0, refundedPaise: 0, createdAt },
      refunds: [], ledger: [], sandbox: true,
      invoice: { id: 'sample-invoice', number: 'SAMPLE/26/001', issuerName: 'Fictional sample tuition supplier', issuerAddress: 'Sample supplier address, New Delhi 110001', issuerGstin: '07AAAAA0000A1Z5', customerName: 'Sample parent', customerAddress: 'Fictional family address, Delhi 110002', supplyState: '07', sac: '999293', description: 'Sample invoice for two Mathematics lessons', gstBps: 1800, totalPaise: 100000, taxablePaise: 84746, cgstPaise: 7627, sgstPaise: 7627, igstPaise: 0, issuedAt: createdAt },
    },
  }))
  await page.goto('/billing/sample-invoice')
  await expect(page.getByRole('heading', {name: 'Paid invoice · SAMPLE/26/001', exact: true})).toBeVisible()
  await expect(page.getByRole('heading', {name:'Payment journal', exact:true})).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:1000})
    await capture(page, `invoice-sample-${width}`)
  }
  await page.emulateMedia({media:'print'})
  await expect(page.getByRole('button',{name:'Print / save PDF',exact:true})).toBeHidden()
  await expect(page.getByRole('heading', {name: 'Paid invoice · SAMPLE/26/001', exact: true})).toBeVisible()
})
