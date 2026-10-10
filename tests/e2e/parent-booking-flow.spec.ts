import { verifiedSignup } from './signup-fixture'
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
test.use({ actionTimeout: 12_000 })

async function write(request: APIRequestContext, path: string, body: unknown, method = 'POST') {
  const session = await (await request.get('/api/v1/auth/session')).json()
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      'X-CSRF-Token': session.csrf,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: body,
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
async function login(request: APIRequestContext, id: string) {
  const response = await request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password },
  })
  expect(response.status()).toBe(200)
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await mkdir('docs/visual-qa/parent-booking-flow', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/parent-booking-flow/${name}.png`, fullPage: true })
}

test('parent finder, direct tutor feedback and payment booking follow the learner class', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const staffContext = await browser.newContext({ baseURL: origin })
  const tutorContext = await browser.newContext({ baseURL: origin })
  try {
    const staff = staffContext.request
    await login(staff, 'mentor-a')
    for (const fixture of [
      { id: 'tutor-meera', subjects: ['Mathematics', 'Science'], minClass: 6, maxClass: 12 },
      { id: 'tutor-arjun', subjects: ['All Subjects'], minClass: 1, maxClass: 5 },
    ]) {
      let application = (await (await staff.get(`/api/v1/staff/applications/${fixture.id}`)).json())
        .application
      // Explicit staff decisions affect fictional fixtures only in the isolated E2E database.
      await write(staff, `/applications/${fixture.id}/decision`, {
        action: 'fees',
        version: application.version,
        feePlans: [
          { mode: 'online', period: 'hour', amountPaise: 200000, classes: 1, minutes: 60 },
        ],
        reason: 'Staff-confirmed price for fictional booking fixture.',
      })
      application = (await (await staff.get(`/api/v1/staff/applications/${fixture.id}`)).json())
        .application
      await write(staff, `/applications/${fixture.id}/decision`, {
        action: 'approve',
        version: application.version,
        subjects: fixture.subjects,
        minClass: fixture.minClass,
        maxClass: fixture.maxClass,
        modes: ['online'],
        mentorId: 'mentor-a',
        reason: 'Explicit assessed subject scope for fictional test fixture.',
      })
    }
    await login(tutorContext.request, 'tutor-meera')
    const availability = await (await tutorContext.request.get('/api/v1/availability')).json()
    await write(
      tutorContext.request,
      '/availability',
      {
        version: availability.version,
        timezone: availability.timezone,
        windows: Array.from({ length: 7 }, (_, day) => ({
          day,
          startMinute: 360,
          endMinute: 1320,
        })),
        dailyCapacity: 12,
        bufferMinutes: 0,
        leaveDates: [],
        paused: false,
      },
      'PUT',
    )
    const signup = await verifiedSignup(page.request, {
      headers: { Origin: origin },
      data: {
        email: `parent-booking-${crypto.randomUUID()}@example.test`,
        password,
        name: 'Fictional booking family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signup.status()).toBe(201)
    const consent = await write(page.request, '/consents', {
      relationship: 'parent',
      accepted: true,
    })
    const learners = []
    for (const classNumber of [5, 6])
      learners.push(
        await write(page.request, '/learners', {
          name: `Fictional Class ${classNumber} learner`,
          class: classNumber,
          board: 'CBSE',
          language: 'English',
          kind: 'minor',
          consentId: consent.id,
        }),
      )
    const [younger, older] = learners
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/match?learner=${younger.id}`)
      await expect(page.getByLabel('Subject', { exact: true }).locator('option')).toHaveText([
        'All Subjects',
      ])
      await expect(page.getByText('Add learning needs', { exact: true })).toHaveCount(0)
      await capture(page, `all-subjects-${width}`)
      await page.getByLabel('Learner', { exact: true }).selectOption(older.id)
      await page.locator('.parent-finder summary').click()
      await page.getByRole('checkbox', { name: 'Mathematics', exact: true }).check()
      await page.getByRole('checkbox', { name: 'Science', exact: true }).check()
      await page.locator('.parent-finder summary').click()
      await page.getByRole('button', { name: 'Search tutors', exact: true }).click()
      const card = page.getByRole('article').filter({ hasText: 'Meera' })
      await expect(card).toHaveCount(1)
      await expect(card).toContainText('Mathematics, Science')
      await page.reload()
      await expect(page.locator('.parent-finder summary')).toHaveText('Mathematics, Science')
      await expect(card).toHaveCount(1)
      await capture(page, `finder-results-${width}`)
    }
    const card = page.getByRole('article').filter({ hasText: 'Meera' })
    await card.getByRole('button', { name: 'Book trial', exact: true }).click()
    await card.locator('.trial-date.available').first().click()
    await card.locator('.parent-trial-times button:enabled').first().click()
    await card.getByRole('checkbox').check()
    const booked = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/trials' &&
        response.request().method() === 'POST',
    )
    await card.getByRole('button', { name: 'Book trial', exact: true }).last().click()
    const trial = await (await booked).json()
    expect(trial.subjects).toEqual(['Mathematics', 'Science'])
    expect(trial.requirementId).toBe('')
    await write(tutorContext.request, `/trials/${trial.id}/action`, { action: 'accept' })
    await write(tutorContext.request, `/trials/${trial.id}/action`, {
      action: 'complete',
      notes: 'Tutor explained the learner questions with worked examples.',
      nextSteps: 'Practise the examples in both selected subjects.',
      review: 'Tutor feedback: the learner explained both sets of examples clearly.',
    })
    await page.goto(`/workspace?view=sessions&learner=${older.id}&tab=completed`)
    await expect(page.getByText('Feedback ready', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Tutor feedback: the learner explained both sets of examples clearly.'),
    ).toBeVisible()
    await capture(page, 'tutor-feedback-390')
    await page.getByRole('main').getByRole('link', { name: 'Book tutor', exact: true }).click()
    const regular = page.locator('.tu-teacher-booking-card').filter({ hasText: 'Meera' })
    await regular.getByRole('button', { name: 'Book Now', exact: true }).click()
    await regular.getByRole('radio').check()
    const today = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeZone: 'Asia/Kolkata',
    }).format(new Date())
    await expect(regular.getByRole('button', { name: today, exact: true })).toBeDisabled()
    // The development trial was recorded before its future scheduled time.
    // Keep that protected reservation and book a later day.
    await regular.locator('.trial-date.available').nth(1).click()
    await regular.locator('.parent-trial-times button:enabled').first().click()
    await expect(regular.locator('.tu-quote')).toContainText('4,000')
    await regular.getByRole('checkbox', { name: 'I have reviewed the schedule' }).check()
    await capture(page, 'regular-package-390')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await capture(page, 'regular-package-1440')
    const enrollmentResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/enrollments' &&
        response.request().method() === 'POST',
    )
    await regular.getByRole('button', { name: 'Continue to payment', exact: true }).click()
    const response = await enrollmentResponse
    expect(response.status(), await response.text()).toBe(201)
    const enrollment = await response.json()
    expect(enrollment.status).toBe('awaiting_payment')
    expect(enrollment.agreement.totalPaise).toBe(400000)
    await expect(
      page.getByRole('heading', { name: 'Complete your booking', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Waiting for tutor', { exact: true })).toHaveCount(0)
    await capture(page, 'payment-pending-1440')
    await page.setViewportSize({ width: 390, height: 1000 })
    await capture(page, 'payment-pending-390')
    await expect(page.getByRole('tab', { name: 'Classes', exact: true })).toHaveCount(0)
    await expect(page.getByText('Classes left', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Payment is pending', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Payment is unavailable', { exact: true })).toBeVisible()
    await expect(page.getByText(/configure Razorpay/)).toHaveCount(0)
    await page.getByRole('link', { name: 'All classes', exact: true }).click()
    await expect(page.locator('.tu-enrollment')).toHaveCount(0)
    const incomplete = page.getByRole('region', { name: 'Complete your booking', exact: true })
    await expect(incomplete).toContainText('4,000')
    await capture(page, 'incomplete-checkout-390')
    await incomplete.getByRole('link', { name: 'Continue to payment', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Complete your booking', exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Complete your booking', exact: true }),
    ).toBeVisible()
    // Move only the browser clock past the server's checkout deadline.
    // This must show expiry without manufacturing a payment or server confirmation.
    await page.clock.setFixedTime(new Date(new Date(enrollment.holdUntil).getTime() + 1000))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Choose new dates', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay & confirm/ })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Classes', exact: true })).toHaveCount(0)
    await capture(page, 'expired-checkout-390')
    expect(errors).toEqual([])
  } finally {
    await staffContext.close()
    await tutorContext.close()
  }
})
