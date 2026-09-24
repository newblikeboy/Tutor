import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
const origin = 'http://127.0.0.1:5174'
test.use({ actionTimeout: 12000 })
async function login(page: Page, id: string) {
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(r.status()).toBe(200)
}
async function write(page: Page, path: string, data: unknown, status = 200, method = 'POST') {
  const s = await (await page.request.get('/api/v1/auth/session')).json()
  const r = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: { Origin: origin, 'X-CSRF-Token': s.csrf, 'Idempotency-Key': crypto.randomUUID() },
    data,
  })
  expect(r.status(), await r.text()).toBe(status)
  return r.json()
}
async function capture(page: Page, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => scrollTo(0, 0))
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
test('unconfigured payments stay blocked while family conversation and owned updates persist', async ({
  browser,
}) => {
  test.setTimeout(180000)
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        baseURL: origin,
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'Asia/Kolkata',
      }),
    ),
  )
  const [parent, tutor, finance, admin] = await Promise.all(contexts.map((c) => c.newPage()))
  try {
    const signup = await parent.request.post('/api/v1/auth/signup', {
      headers: { Origin: origin },
      data: {
        email: `billing-family-${Date.now()}@example.test`,
        password: 'E2E-only learning passphrase 426!',
        name: 'Fictional billing family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signup.status()).toBe(201)
    await login(tutor, 'tutor-arjun')
    await login(finance, 'finance-a')
    await login(admin, 'admin-a')
    const review = await (await admin.request.get('/api/v1/staff/applications/tutor-arjun')).json()
    await write(admin, '/applications/tutor-arjun/decision', {
      action: 'fees',
      version: review.application.version,
      feePlans: [{ mode: 'online', period: 'hour', amountPaise: 50000, classes: 1, minutes: 60 }],
    })
    const av = await (await tutor.request.get('/api/v1/availability')).json()
    await write(
      tutor,
      '/availability',
      {
        ...av,
        feePaise: 0,
        feePlan: null,
        feeVersion: 0,
        windows: Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 0, endMinute: 1440 })),
      },
      200,
      'PUT',
    )
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
        name: 'Isha · billing fixture',
        class: 8,
        board: 'CBSE',
        language: 'Hindi',
        kind: 'minor',
        consentId: consent.id,
      },
      201,
    )
    const req = await write(
      parent,
      '/requirements',
      {
        learnerId: learner.id,
        goal: 'Practise equivalent fractions and clear explanations.',
        locality: 'Purnea',
      },
      201,
    )
    const trial = await write(
      parent,
      '/trials',
      {
        requirementId: req.id,
        tutorId: 'tutor-arjun',
        start: new Date(Date.now() + 2 * 86400000).toISOString(),
        termsAccepted: true,
      },
      201,
    )
    await write(tutor, `/trials/${trial.id}/action`, { action: 'accept' })
    await write(tutor, `/trials/${trial.id}/action`, {
      action: 'complete',
      notes: 'Fictional learner compares thirds and sixths with number lines.',
      nextSteps: 'Continue explaining equivalent fractions independently.',
    })
    const mentor = await contexts[2].newPage()
    await login(mentor, 'mentor-a')
    await write(mentor, `/trials/${trial.id}/action`, {
      action: 'review',
      review: 'The evidence supports practice with thirds and sixths.',
    })
    await mentor.close()
    await login(finance, 'finance-a')
    const first = new Date(Date.now() + 4 * 86400000)
    const enrollment = await write(
      parent,
      '/enrollments',
      {
        trialId: trial.id,
        offeringVersion: av.version + 1,
        feeVersion: av.feeVersion,
        accepted: true,
        schedule: {
          startDate: first.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
          time: '14:00',
          timezone: 'Asia/Kolkata',
          weekdays: [first.getDay()],
          count: 2,
          minutes: 60,
        },
      },
      201,
    )
    await write(tutor, `/enrollments/${enrollment.id}/action`, { action: 'accept', version: 1 })
    const path = `/tuition/${enrollment.id}`
    await parent.goto(path)
    await expect(parent.getByText('Checkout is not configured', { exact: true })).toBeVisible()
    await expect(parent.getByRole('button', { name: 'Open Razorpay test checkout' })).toHaveCount(0)
    await capture(parent, 'billing-disabled-en-desktop')
    await parent.setViewportSize({ width: 390, height: 844 })
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await capture(parent, 'billing-disabled-en-mobile')
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await parent.getByRole('tab', { name: 'Messages', exact: true }).click()
    await parent
      .getByLabel('Your message', { exact: true })
      .fill('Please keep the family informed about the next teaching steps.')
    await parent.getByRole('tab', { name: 'Classes', exact: true }).click()
    await expect(parent.getByLabel('Your message', { exact: true })).toBeHidden()
    await parent.getByRole('tab', { name: 'Messages', exact: true }).click()
    await expect(parent.getByLabel('Your message', { exact: true })).toHaveValue(
      'Please keep the family informed about the next teaching steps.',
    )
    await parent.getByRole('button', { name: 'Send message' }).click()
    await expect(parent.getByText('Message sent.')).toBeVisible()
    await parent.reload()
    await expect(
      parent.getByText('Please keep the family informed about the next teaching steps.', {
        exact: true,
      }),
    ).toBeVisible()
    await tutor.goto(`${path}?tab=messages`)
    await expect(
      tutor.getByText('Please keep the family informed about the next teaching steps.', {
        exact: true,
      }),
    ).toBeVisible()
    await tutor
      .getByLabel('Your message', { exact: true })
      .fill('We will begin with number-line examples and share reviewed evidence here.')
    await tutor.getByRole('button', { name: 'Send message' }).click()
    await expect(tutor.getByText('Message sent.')).toBeVisible()
    await capture(tutor, 'conversation-en-desktop')
    await parent.reload()
    await expect(
      parent.getByText('We will begin with number-line examples and share reviewed evidence here.'),
    ).toBeVisible()
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await capture(parent, 'conversation-en-mobile')
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await parent.goto('/notifications')
    await expect(
      parent.getByRole('heading', { name: 'A new message in your family conversation' }).first(),
    ).toBeVisible()
    await parent.getByRole('button', { name: 'Mark as read' }).first().click()
    await finance.goto('/workspace')
    await expect(finance).toHaveURL('/billing')
    expect((await finance.request.get('/api/v1/dashboard')).status()).toBe(403)
    await expect(
      finance.getByRole('heading', { name: 'Payments & records', exact: true }),
    ).toBeVisible()
    await capture(finance, 'finance-records-en-desktop')
    await finance.setViewportSize({ width: 390, height: 844 })
    await expect(finance.locator('.language-button')).toHaveCount(0)
    await capture(finance, 'finance-records-en-mobile')
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
