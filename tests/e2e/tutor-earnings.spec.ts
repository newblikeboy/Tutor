import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import type { Schema } from '../../apps/web/src/lib/api'

const origin = 'http://127.0.0.1:5174'
const createdAt = '2026-10-01T05:00:00Z'
const dueAt = '2026-10-14T03:30:00Z'
const amounts = (grossPaise: number): Schema['FinancialAmounts'] => ({
  grossPaise,
  tutorNetPaise: grossPaise * 0.75,
  platformPaise: grossPaise * 0.25,
  gstPaise: 3800,
  tuitionGstPaise: 0,
  tdsPaise: 1000,
  tcsPaise: 500,
  gatewayCostPaise: 0,
  revenuePaise: 0,
  contributionPaise: 0,
})
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/tutor-earnings', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    if (width === 390 && ['class-earnings', 'payout-history'].includes(name)) {
      const amount = await page.getByRole('cell', { name: '₹750.00', exact: true }).boundingBox()
      expect(amount).not.toBeNull()
      expect(amount!.x).toBeGreaterThanOrEqual(0)
      expect(amount!.x + amount!.width).toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({
      path: `docs/visual-qa/tutor-earnings/${name}-${width}.png`,
      fullPage: true,
    })
  }
}

test('tutor earnings tables distinguish allocations, earnings and settlement (render-only sample fixtures)', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'tutor-meera@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(login.status()).toBe(200)
  // Financial persistence and permissions remain covered by the real Go/MongoDB
  // finance lifecycle tests. These labelled samples exercise only UI rendering;
  // they do not collect money, release earnings or record a bank transfer.
  const earning = (id: string, gross: number, batchId = ''): Schema['ClassEarning'] => ({
    id,
    intentId: 'sample-payment',
    enrollmentId: 'sample-booking',
    tutorId: 'tutor-meera',
    amounts: amounts(gross),
    earnedAt: createdAt,
    dueAt,
    batchId,
  })
  const firstPage = [
    earning('sample-class-one', 100000),
    earning('sample-class-two', 200000, 'sample-paid-batch'),
  ]
  const secondPage = [earning('sample-class-three', 40000)]
  let failEarnings = false
  await page.route('**/api/v1/finance/earnings?**', async (route) => {
    if (failEarnings)
      return route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Controlled sample outage' },
      })
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    await route.fulfill({
      json: { items: cursor ? secondPage : firstPage, nextCursor: cursor ? '' : 'sample-page-two' },
    })
  })
  const batch = (
    id: string,
    status: string,
    amountPaise: number,
    reference = '',
  ): Schema['PayoutBatch'] => ({
    id,
    tutorId: 'tutor-meera',
    status,
    amountPaise,
    classIds: ['sample-class-two'],
    createdAt,
    createdBy: 'sample-finance',
    reference,
    recordedBy: reference ? 'sample-finance' : '',
    confirmedBy: status === 'paid' ? 'sample-admin' : '',
    ...(reference ? { paidAt: createdAt } : {}),
  })
  await page.route('**/api/v1/finance/payouts?**', (route) =>
    route.fulfill({
      json: {
        items: [
          batch('sample-prepared-batch', 'prepared', 75000),
          batch('sample-verification-batch', 'verification_pending', 30000, 'SAMPLE-UTR-PENDING'),
          batch('sample-paid-batch', 'paid', 150000, 'SAMPLE-UTR-VERIFIED'),
        ],
        nextCursor: '',
      },
    }),
  )
  const booking = (id: string, status: string): Schema['FinanceBooking'] => ({
    id,
    enrollmentId: 'sample-booking',
    tutorId: 'tutor-meera',
    tutorName: 'Meera · sample',
    createdAt,
    status,
    amounts: amounts(100000),
    reviewedBy: status === 'reviewed' ? 'sample-finance' : '',
  })
  await page.route('**/api/v1/finance/bookings?**', (route) =>
    route.fulfill({
      json: {
        items: [
          booking('sample-reviewed-booking', 'reviewed'),
          booking('sample-review-booking', 'tax_review'),
        ],
        nextCursor: '',
      },
    }),
  )
  await page.route('**/api/v1/finance/holds?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'sample-held-class',
            intentId: 'sample-payment',
            tutorId: 'tutor-meera',
            kind: 'replacement_tax',
            grossPaise: 100000,
            updatedAt: createdAt,
            reason:
              'Sample: the replacement tutor allocation requires finance review before earnings can be released.',
          },
        ],
        nextCursor: '',
      },
    }),
  )
  await page.goto('/billing')
  await expect(page.getByRole('heading', { name: 'Earnings & payouts', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Class earnings', exact: true })).toBeVisible()
  const metrics = page.getByRole('definition')
  await expect(metrics.filter({ hasText: '₹2,250.00' })).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Awaiting payout', exact: true })).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'In payout batch', exact: true })).toHaveCount(1)
  await capture(page, 'class-earnings')
  await page.getByRole('table').getByRole('link').first().click()
  await expect(page.getByRole('heading', { name: 'Class earning details' })).toBeVisible()
  await expect(page.getByText('sample-class-one', { exact: true })).toBeVisible()
  await capture(page, 'class-allocation')
  await page.getByRole('link', { name: 'Back to class earnings', exact: true }).click()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page).toHaveURL(/earningsCursor=sample-page-two/)
  await expect(page.getByRole('definition').filter({ hasText: '₹300.00' })).toHaveCount(2)
  await page.getByRole('table').getByRole('link').first().click()
  await page.reload()
  await expect(page.getByText('sample-class-three', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to class earnings', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Payout history', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Payout history', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Prepared', exact: true })).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Awaiting verification', exact: true })).toHaveCount(
    1,
  )
  await expect(page.getByRole('cell', { name: 'Paid', exact: true })).toHaveCount(1)
  await capture(page, 'payout-history')
  await page.getByRole('table').getByRole('link').nth(2).click()
  await expect(page.getByText('SAMPLE-UTR-VERIFIED', { exact: true })).toBeVisible()
  await expect(page.getByText('Bank settlement verified.', { exact: true })).toBeVisible()
  await capture(page, 'payout-detail')
  await page.getByRole('link', { name: 'Back to payout history', exact: true }).click()
  await page.getByRole('table').getByRole('link').first().click()
  await expect(
    page.getByText('The payout batch is prepared. A bank transfer has not been recorded.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText('Bank settlement verified.', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Class earnings', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'First page', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Paid bookings', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Paid bookings', exact: true })).toBeVisible()
  await capture(page, 'paid-bookings')
  await page.getByRole('table').getByRole('link').nth(1).click()
  await expect(page.getByText('Pending · tutor share reserved', { exact: true })).toBeVisible()
  await expect(page.getByText('GST within platform allocation', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Needs review', exact: true }).click()
  await expect(
    page.getByText(
      'Sample: the replacement tutor allocation requires finance review before earnings can be released.',
      { exact: true },
    ),
  ).toBeVisible()
  await capture(page, 'review-holds')
  for (const label of ['Prepare due payout', 'Record bank transfer', 'Confirm tax allocation']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }
  await page.getByRole('tab', { name: 'Class earnings', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Payout history', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/tab=payouts/)
  await page.goto('/billing?record=unavailable-sample')
  await expect(
    page.getByText('This record is not available on this page.', { exact: true }),
  ).toBeVisible()
  failEarnings = true
  await page.goto('/billing')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.locator('.te-metrics')).toHaveCount(0)
  await capture(page, 'earnings-error')
  failEarnings = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
  expect(errors).toEqual([])
})
