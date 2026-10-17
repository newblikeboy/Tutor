import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase, verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const output = 'docs/visual-qa/parent-tables'

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: name !== 'current-bookings',
    })
  }
}

test('parent tables preserve ownership, booking history, progress, class reports and mobile tabs', async ({
  page,
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional table family',
      email: `parent-tables-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const consent = await page.request.post('/api/v1/consents', {
    headers,
    data: { relationship: 'parent', accepted: true },
  })
  expect(consent.status()).toBe(201)
  const created = await page.request.post('/api/v1/learners', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: 'Fictional table student',
      class: 8,
      board: 'CBSE',
      language: 'English',
      kind: 'minor',
      consentId: (await consent.json()).id,
    },
  })
  expect(created.status()).toBe(201)
  const learner = await created.json()
  const prefix = crypto.randomUUID()
  const day = (offset: number) => new Date(Date.now() + offset * 86400000)
  const end = (offset: number) => new Date(day(offset).getTime() + 3600000)
  const booking = (suffix: string, status: string, ownerId = auth.user.id) => {
    const id = `${prefix}-${suffix}`
    return {
      _id: id,
      ownerId,
      learnerId: learner.id,
      learnerName: learner.name,
      class: 8,
      tutorId: 'tutor-arjun',
      tutorName: 'Arjun · sample',
      mentorId: 'mentor-a',
      trialId: `${prefix}-trial`,
      status,
      version: 1,
      planVersion: 0,
      createdAt: day(-4),
      paymentSimulated: true,
      agreement: {
        id: `${id}:1`,
        enrollmentId: id,
        version: 1,
        tutorId: 'tutor-arjun',
        subject: 'Mathematics',
        subjects: ['Mathematics'],
        mode: 'online',
        timezone: 'Asia/Kolkata',
        sessionCount: 3,
        minutes: 60,
        starts: [day(-2), day(1), day(2)],
        feePerSessionPaise: 12500,
        packageFeePaise: 12500,
        totalPaise: 37500,
        currency: 'INR',
        cancellationHours: 12,
        terms: 'Fictional retained design-test agreement; no payment was taken.',
        termsVersion: 'test',
        createdAt: day(-4),
      },
    }
  }
  const current = booking('a-current', 'active')
  const past = booking('z-past', 'completed')
  const { client, database } = await signupDatabase()
  try {
    // Recorded fixtures, scoped to the exact isolated local database; no provider actions.
    await database
      .collection('enrollments')
      .insertMany([
        current,
        past,
        booking('z-cancelled', 'cancelled'),
        booking('a-foreign', 'active', 'unrelated-household'),
        ...Array.from({ length: 25 }, (_, index) =>
          booking(`b-current-${String(index).padStart(2, '0')}`, 'paused'),
        ),
      ] as never[])
    await database.collection('classes').insertMany([
      {
        _id: `${current._id}-completed`,
        enrollmentId: current._id,
        tutorId: 'tutor-arjun',
        start: day(-2),
        end: end(-2),
        status: 'completed',
        attendance: 'present',
        notes: 'Fictional class covered equivalent fractions.',
        homeworkGiven: false,
        version: 1,
        timezone: 'Asia/Kolkata',
      },
      {
        _id: `${current._id}-makeup`,
        enrollmentId: current._id,
        tutorId: 'tutor-arjun',
        start: day(1),
        end: end(1),
        status: 'makeup_due',
        version: 1,
        timezone: 'Asia/Kolkata',
      },
      {
        _id: `${current._id}-scheduled`,
        enrollmentId: current._id,
        tutorId: 'tutor-arjun',
        start: day(2),
        end: end(2),
        status: 'scheduled',
        version: 1,
        timezone: 'Asia/Kolkata',
      },
    ] as never[])
    await database.collection('trials').insertOne({
      _id: `${prefix}-trial`,
      ownerId: auth.user.id,
      learnerId: learner.id,
      learnerName: learner.name,
      class: 8,
      tutorId: 'tutor-arjun',
      mentorId: 'mentor-a',
      subject: 'Mathematics',
      subjects: ['Mathematics'],
      mode: 'online',
      start: day(-3),
      end: end(-3),
      status: 'completed',
      notes: 'Fictional tutor used fraction diagrams.',
      nextSteps: 'Practise equivalent fractions.',
      review: 'Fictional tutor feedback: clear understanding of fractions.',
      version: 1,
      feePaise: 0,
      createdAt: day(-4),
    } as never)
    await database.collection('payment_intents').insertOne({
      _id: `${prefix}-payment`,
      ownerId: auth.user.id,
      enrollmentId: current._id,
      provider: 'simulation',
      state: 'captured',
      amountPaise: 37500,
      currency: 'INR',
      orderId: `${prefix}-order`,
      paymentId: `${prefix}-capture`,
      capturedAt: day(-3),
      refundReservedPaise: 0,
      refundedPaise: 0,
      createdAt: day(-3),
    } as never)
  } finally {
    await client.close()
  }

  // Filters must apply on the server before pagination and retain household ownership.
  const active = await (await page.request.get('/api/v1/enrollments?history=0')).json()
  expect(active.items).toHaveLength(25)
  expect(
    active.items.every((item: { status: string }) => ['active', 'paused'].includes(item.status)),
  ).toBe(true)
  const next = await (
    await page.request.get(
      `/api/v1/enrollments?history=0&cursor=${encodeURIComponent(active.nextCursor)}`,
    )
  ).json()
  expect(next.items).toHaveLength(1)
  const history = await (await page.request.get('/api/v1/enrollments?history=1')).json()
  expect(history.items.map((item: { status: string }) => item.status).sort()).toEqual([
    'cancelled',
    'completed',
  ])
  expect((await page.request.get('/api/v1/enrollments?history=unexpected')).status()).toBe(422)
  expect((await page.request.get(`/api/v1/enrollments/${prefix}-a-foreign`)).status()).toBe(404)

  await page.goto('/workspace?view=learners')
  await expect(page.getByRole('table', { name: 'Your learners', exact: true })).toBeVisible()
  await capture(page, 'learners')
  await page.getByRole('link', { name: /Fictional table student View progress/ }).click()
  await expect(page.locator('.child-report-summary')).toBeVisible()
  await page.getByRole('tab', { name: 'Feedback', exact: true }).click()
  await expect(
    page.getByText('Fictional tutor feedback: clear understanding of fractions.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Feedback', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await capture(page, 'progress')
  await page.getByRole('link', { name: 'Back to Learners', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Your learners', exact: true })).toBeVisible()

  await page.goto(`/workspace?view=sessions&learner=${learner.id}&tab=completed`)
  await expect(page.getByRole('table', { name: 'Your trial lessons', exact: true })).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Feedback status', exact: true }),
  ).toBeVisible()
  await capture(page, 'trials')
  await page.getByRole('link', { name: /View trial/ }).click()
  await expect(page.getByRole('heading', { name: 'Trial details', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Feedback', exact: true })).toHaveCount(0)
  await capture(page, 'trial-details')
  await expect(
    page.getByText('Fictional tutor feedback: clear understanding of fractions.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to Trial lessons', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`tab=completed$`))

  await page.goto('/tuition')
  await expect(
    page.getByRole('table', { name: 'Current regular class bookings', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(25)
  await capture(page, 'current-bookings')
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
  await page.getByRole('link', { name: /View booking/ }).click()
  await page.getByRole('link', { name: 'All classes', exact: true }).click()
  await expect(page).toHaveURL(/cursor=/)
  await page.getByRole('link', { name: 'Past bookings', exact: true }).click()
  await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
  await capture(page, 'past-bookings')
  await page
    .getByRole('link', { name: /View booking/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'All classes', exact: true }).click()
  await expect(page).toHaveURL('/tuition?history=1')

  await page.goto(`/tuition/${current._id}`)
  await expect(
    page.getByRole('table', { name: 'Classes in this booking', exact: true }),
  ).toBeVisible()
  await capture(page, 'class-list')
  await page
    .getByRole('link', { name: /View class/ })
    .first()
    .click()
  await expect(
    page.getByText('Fictional class covered equivalent fractions.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark class completed', exact: true })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Report a class concern', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Report a class concern', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Back to class list', exact: true }).click()
  await expect(
    page.getByRole('table', { name: 'Classes in this booking', exact: true }),
  ).toBeVisible()

  await page.goto('/billing')
  await expect(page.getByRole('table', { name: 'Your payments', exact: true })).toBeVisible()
  await expect(page.getByText('Test payment', { exact: true })).toBeVisible()
  await capture(page, 'payments')
  await page.getByRole('link', { name: /View payment/ }).click()
  await expect(page).toHaveURL(new RegExp(`/billing/${prefix}-payment$`))

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await capture(page, 'profile')
  const tablist = page.getByRole('tablist')
  const lastTab = tablist.getByRole('tab').last()
  await lastTab.click()
  const box = await lastTab.boundingBox(),
    strip = await tablist.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(strip!.x)
  expect(box!.x + box!.width).toBeLessThanOrEqual(strip!.x + strip!.width)
  const rows = await tablist
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().top))
  expect(new Set(rows).size).toBe(1)
  for (const width of [360, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const main = await page
      .locator('.desk-main')
      .evaluate(
        (node) =>
          node.clientWidth -
          parseFloat(getComputedStyle(node).paddingLeft) -
          parseFloat(getComputedStyle(node).paddingRight),
      )
    expect((await page.locator('.account-page').boundingBox())!.width).toBeGreaterThanOrEqual(
      main - 2,
    )
  }
  expect(errors).toEqual([])
})
