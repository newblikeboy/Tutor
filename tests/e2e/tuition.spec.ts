import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
test.use({ actionTimeout: 12_000 })
async function signIn(page: Page, id: string) {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(response.status()).toBe(200)
}
async function write(page: Page, path: string, data: unknown, status = 200) {
  const session = await (await page.request.get('/api/v1/auth/session')).json()
  const response = await page.request.post(`/api/v1${path}`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': session.csrf,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data,
  })
  expect(response.status(), await response.text()).toBe(status)
  return response.json()
}
async function inspect(page: Page, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('docs/visual-qa/english-only/product-ux', { recursive: true })
  await page.screenshot({
    path: `docs/visual-qa/english-only/product-ux/${name}.png`,
    fullPage: true,
  })
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
}
test('staff fee changes require renewed consent before payment and tutors only edit availability', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext({ baseURL: origin })),
  )
  const [parent, tutor, staff] = await Promise.all(contexts.map((context) => context.newPage()))
  try {
    const signup = await parent.request.post('/api/v1/auth/signup', {
      headers: { Origin: origin },
      data: {
        email: `tuition-family-${crypto.randomUUID()}@example.test`,
        password: 'E2E-only learning passphrase 426!',
        name: 'Fictional tuition family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signup.status()).toBe(201)
    await signIn(tutor, 'tutor-meera')
    await signIn(staff, 'admin-a')
    const setPrice = async (amountPaise: number) => {
      const review = await (
        await staff.request.get('/api/v1/staff/applications/tutor-meera')
      ).json()
      await write(staff, '/applications/tutor-meera/decision', {
        action: 'fees',
        version: review.application.version,
        feePlans: [{ mode: 'online', period: 'hour', amountPaise, classes: 1, minutes: 60 }],
        reason: 'Explicit staff price for isolated fictional fixture.',
      })
    }
    await setPrice(200000)
    const consent = await write(
      parent,
      '/consents',
      { relationship: 'parent', accepted: true },
      201,
    )
    const learner = await write(
      parent,
      '/learners',
      {
        name: 'Fictional tuition learner',
        class: 8,
        board: 'CBSE',
        language: 'English',
        kind: 'minor',
        consentId: consent.id,
      },
      201,
    )
    await tutor.goto('/availability')
    await expect(tutor.getByRole('button', { name: 'Save schedule', exact: true })).toBeEnabled()
    await expect(tutor.getByLabel('Fee per class', { exact: true })).toHaveCount(0)
    while (await tutor.getByRole('button', { name: /^Remove teaching time / }).count())
      await tutor
        .getByRole('button', { name: /^Remove teaching time / })
        .first()
        .click()
    const first = new Date(Date.now() + 7 * 86400000)
    const day = first.getDay()
    await tutor.getByRole('button', { name: 'Add teaching time' }).click()
    await tutor.getByLabel('Day', { exact: true }).selectOption(String(day))
    await tutor.getByLabel('From', { exact: true }).fill('09:00')
    await tutor.getByLabel('Until', { exact: true }).fill('18:00')
    await tutor.getByLabel('Break between classes').fill('15')
    const saved = tutor.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/availability') && response.request().method() === 'PUT',
    )
    await tutor.getByRole('button', { name: 'Save schedule' }).click()
    expect((await saved).status()).toBe(200)
    await inspect(tutor, 'tuition-availability-en-desktop')
    await tutor.setViewportSize({ width: 390, height: 844 })
    await inspect(tutor, 'tuition-availability-en-mobile')
    const date = first.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const trial = await write(
      parent,
      '/trials',
      {
        learnerId: learner.id,
        subjects: ['Mathematics'],
        mode: 'online',
        tutorId: 'tutor-meera',
        start: `${date}T09:00:00+05:30`,
        termsAccepted: true,
      },
      201,
    )
    await write(tutor, `/trials/${trial.id}/action`, { action: 'accept' })
    await write(tutor, `/trials/${trial.id}/action`, {
      action: 'complete',
      notes: 'The learner compared fractions using number lines.',
      nextSteps: 'Continue practising fractions with worked examples.',
      review: 'The tutor recommends continuing regular classes.',
    })
    await parent.goto('/tuition')
    const card = parent.locator('.tu-teacher-booking-card').filter({ hasText: 'Meera' })
    await card.getByRole('button', { name: 'Book Now', exact: true }).click()
    await card.getByRole('radio').check()
    await card.locator('.trial-date.available').nth(1).click()
    await card.locator('.parent-trial-times button:enabled').first().click()
    const consentBox = card.getByRole('checkbox', { name: 'I have reviewed the schedule' })
    await consentBox.check()
    await inspect(parent, 'tuition-agreement-en-desktop')
    await setPrice(250000)
    const stale = parent.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/enrollments' &&
        response.request().method() === 'POST',
    )
    await card.getByRole('button', { name: 'Continue to payment', exact: true }).click()
    expect((await stale).status()).toBe(409)
    await expect(consentBox).not.toBeChecked()
    await expect(card.locator('.tu-quote')).toContainText('2,500')
    await consentBox.check()
    await card.getByRole('button', { name: 'Continue to payment', exact: true }).click()
    await expect(
      parent.getByRole('heading', { name: 'Complete your booking', exact: true }),
    ).toBeVisible()
    await expect(parent.getByText('Waiting for tutor', { exact: true })).toHaveCount(0)
    await inspect(parent, 'tuition-payment-pending-en-desktop')
    await parent.setViewportSize({ width: 390, height: 844 })
    await inspect(parent, 'tuition-payment-pending-en-mobile')
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('tuition has genuine empty, loading, error and keyboard states', async ({ page }) => {
  await signIn(page, 'parent-b')
  await page.goto('/tuition')
  await expect(page.getByRole('heading', { name: 'No regular classes yet' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await inspect(page, 'tuition-empty-en-desktop')
  await page.route('**/api/v1/enrollments?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'unavailable', message: 'Controlled outage' }),
    })
  })
  await page.reload()
  await expect(page.getByText('Loading', { exact: false }).first()).toBeAttached()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await inspect(page, 'tuition-error-en-desktop')
  await page.unroute('**/api/v1/enrollments?*')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'No regular classes yet' })).toBeVisible()
})
