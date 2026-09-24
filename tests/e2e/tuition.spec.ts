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
test('recurring tuition, learning plan and consented handover stay connected across roles', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        baseURL: origin,
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'Asia/Kolkata',
      }),
    ),
  )
  const [parent, tutor, mentor, replacement] = await Promise.all(contexts.map((c) => c.newPage()))
  try {
    const signup = await parent.request.post('/api/v1/auth/signup', {
      headers: { Origin: origin },
      data: {
        email: `tuition-family-${Date.now()}@example.test`,
        password: 'E2E-only learning passphrase 426!',
        name: 'Fictional tuition family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signup.status()).toBe(201)
    await signIn(tutor, 'tutor-meera')
    await signIn(mentor, 'mentor-a')
    await signIn(replacement, 'tutor-arjun')
    // Set up the already-covered trial through actual authenticated Go endpoints.
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
        name: 'Naina · fictional learner',
        class: 8,
        board: 'CBSE',
        language: 'Hindi',
        kind: 'minor',
        consentId: consent.id,
      },
      201,
    )
    const requirement = await write(
      parent,
      '/requirements',
      {
        learnerId: learner.id,
        goal: 'Build confidence explaining equivalent fractions.',
        locality: 'Purnea',
      },
      201,
    )
    const trial = await write(
      parent,
      '/trials',
      {
        requirementId: requirement.id,
        tutorId: 'tutor-meera',
        start: new Date(Date.now() + 86400000).toISOString(),
        termsAccepted: true,
      },
      201,
    )
    await write(tutor, `/trials/${trial.id}/action`, { action: 'accept' })
    await write(tutor, `/trials/${trial.id}/action`, {
      action: 'complete',
      notes: 'Fictional learner compared equivalent fractions using number lines.',
      nextSteps: 'Continue with thirds and sixths using worked examples.',
    })
    await write(mentor, `/trials/${trial.id}/action`, {
      action: 'review',
      review: 'The observed explanation supports continued practice with equivalent fractions.',
    })
    const first = new Date(Date.now() + 3 * 86400000),
      day = first.getDay(),
      date = first.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    for (const teacher of [tutor, replacement]) {
      const previous = await (await teacher.request.get('/api/v1/availability')).json()
      await teacher.goto('/availability')
      await expect(teacher.getByLabel('Fee per class (₹)', { exact: true })).toHaveCount(0)
      await expect(teacher.locator('.tutor-fees')).toBeVisible()
      while (await teacher.getByRole('button', { name: /^Remove teaching time / }).count()) {
        await teacher
          .getByRole('button', { name: /^Remove teaching time / })
          .first()
          .click()
      }
      await teacher.getByRole('button', { name: 'Add teaching time' }).click()
      await teacher.getByLabel('Day', { exact: true }).selectOption(String(day))
      await teacher.getByLabel('From', { exact: true }).fill('09:00')
      await teacher.getByLabel('Until', { exact: true }).fill('18:00')
      await teacher.getByLabel('Break between classes').fill('15')
      await teacher.getByRole('button', { name: 'Save schedule' }).click()
      await expect(teacher.getByRole('button', { name: 'Save schedule' })).toBeEnabled()
      await expect
        .poll(
          async () => (await (await teacher.request.get('/api/v1/availability')).json()).version,
        )
        .toBe(previous.version + 1)
    }
    await inspect(tutor, 'tuition-availability-en-desktop')
    await tutor.setViewportSize({ width: 390, height: 844 })
    await expect(tutor.locator('.language-button')).toHaveCount(0)
    await inspect(tutor, 'tuition-availability-en-mobile')
    await expect(tutor.locator('.language-button')).toHaveCount(0)
    await tutor.setViewportSize({ width: 1440, height: 1000 })
    await parent.goto('/tuition')
    await parent.getByText('Start regular classes', { exact: true }).click()
    await parent.getByLabel('Choose a completed trial', { exact: true }).selectOption(trial.id)
    await parent.getByLabel('Start date').fill(date)
    await parent.getByLabel('Class time (India)').fill('10:00')
    await parent
      .getByLabel(first.toLocaleDateString('en-IN', { weekday: 'long' }), { exact: true })
      .check()
    await parent.getByLabel('Number of classes').fill('3')
    await parent.getByLabel('I have reviewed the schedule').check()
    await inspect(parent, 'tuition-agreement-en-desktop')
    const staffContext = await browser.newContext({ baseURL: origin })
    try {
      const staff = await staffContext.newPage()
      await signIn(staff, 'admin-a')
      const review = await (
        await staff.request.get('/api/v1/staff/applications/tutor-meera')
      ).json()
      await write(staff, '/applications/tutor-meera/decision', {
        action: 'fees',
        version: review.application.version,
        feePlans: [{ mode: 'online', period: 'hour', amountPaise: 0, classes: 1, minutes: 60 }],
      })
    } finally {
      await staffContext.close()
    }
    const stale = parent.waitForResponse(
      (r) => r.url().endsWith('/api/v1/enrollments') && r.request().method() === 'POST',
    )
    await parent.getByRole('button', { name: 'Send class request' }).click()
    expect((await stale).status()).toBe(409)
    await expect(parent.getByLabel('I have reviewed the schedule')).not.toBeChecked()
    await expect(parent.getByRole('button', { name: 'Send class request' })).toBeEnabled()
    await parent.getByLabel('I have reviewed the schedule').check()
    await parent.getByRole('button', { name: 'Send class request' }).click()
    await expect(parent).toHaveURL(/\/tuition\/.+/)
    const tuitionURL = new URL(parent.url()).pathname
    await tutor.goto(tuitionURL)
    await tutor.getByRole('tab', { name: 'Schedule & fees', exact: true }).click()
    await tutor.getByRole('button', { name: 'Accept & book classes' }).click()
    await expect(tutor.getByText('Active tuition', { exact: true })).toBeVisible()
    await parent.reload()
    await inspect(parent, 'tuition-calendar-en-desktop')
    await parent.keyboard.press('Tab')
    await parent.setViewportSize({ width: 390, height: 844 })
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await inspect(parent, 'tuition-calendar-en-mobile')
    for (const width of [360, 768, 1024]) {
      await parent.setViewportSize({ width, height: 1000 })
      await expect(parent.getByRole('tab', { name: 'Classes', exact: true })).toBeVisible()
      expect(await parent.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await parent.setViewportSize({ width: 1440, height: 1000 })
    const firstClass = parent.locator('.tu-session').first()
    await firstClass.getByRole('button', { name: 'Propose a new time' }).click()
    await firstClass.getByLabel('Proposed date and time (India)').fill(`${date}T12:00`)
    await firstClass
      .getByLabel('Reason', { exact: true })
      .fill('The family needs a later teaching time.')
    await firstClass.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(firstClass.getByText('Proposed time:', { exact: false })).toBeVisible()
    await tutor.reload()
    await tutor.getByRole('tab', { name: 'Classes', exact: true }).click()
    await tutor.getByRole('button', { name: 'Accept proposed time' }).click()
    await expect(tutor.getByRole('button', { name: 'Accept proposed time' })).toHaveCount(0)
    const lesson = tutor.locator('.tu-session').first()
    await lesson.getByRole('button', { name: 'Record lesson' }).click()
    await lesson
      .getByLabel('Lesson notes', { exact: true })
      .fill('Naina explained thirds and sixths using three accurate number-line examples.')
    await lesson
      .getByLabel('Practice for next time')
      .fill('Explain sixths independently and write two worked examples.')
    await lesson.getByLabel('Use the development timeline').check()
    await lesson.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(lesson.getByText('Awaiting academic review', { exact: true })).toBeVisible()
    await mentor.goto(tuitionURL)
    await mentor.getByRole('button', { name: 'Academic review', exact: true }).click()
    await mentor
      .getByLabel('Review evidence and next steps')
      .fill(
        'Evidence supports independent comparison of thirds and sixths; introduce mixed numbers next.',
      )
    await mentor.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(
      mentor.locator('.tu-session').first().getByText('Reviewed', { exact: true }),
    ).toBeVisible()
    await mentor.getByRole('tab', { name: 'Learning plan', exact: true }).click()
    await mentor.getByText('Create the next plan version', { exact: true }).click()
    await mentor
      .getByLabel('Starting point', { exact: true })
      .fill('Naina compares halves, thirds and sixths with visual support.')
    await mentor
      .getByLabel('Learning goals', { exact: true })
      .fill('Explain equivalent fractions independently in worked examples.')
    await mentor.getByLabel('Topic title').fill('Equivalent fractions')
    await mentor.getByLabel('Learning status').selectOption('practising')
    await mentor
      .getByLabel('Evidence', { exact: true })
      .fill('Three accurate examples on a number line.')
    await mentor
      .getByLabel('Suggested practice')
      .fill('Compare thirds and sixths without a prepared diagram.')
    await mentor
      .getByLabel('Next teaching steps', { exact: true })
      .fill('Move from number lines to symbols with short explanations.')
    await mentor
      .getByLabel('Next review date')
      .fill(new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10))
    await inspect(mentor, 'tuition-plan-editor-en-desktop')
    await mentor.getByRole('button', { name: 'Save academic plan' }).click()
    await expect(mentor.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible()
    await parent.reload()
    await parent.getByRole('tab', { name: 'Learning plan', exact: true }).click()
    await expect(parent.getByText('Three accurate examples on a number line.')).toBeVisible()
    await parent.getByRole('tab', { name: 'Change tutor', exact: true }).click()
    await parent.getByLabel('Proposed tutor', { exact: true }).selectOption('tutor-arjun')
    await parent
      .getByLabel('Reason', { exact: true })
      .first()
      .fill('The family requests a supported change of tutor.')
    await parent.getByLabel('I authorise sharing').check()
    await parent.getByRole('button', { name: 'Request tutor change' }).click()
    await expect(parent.getByText('Requested', { exact: true })).toBeVisible()
    await mentor.goto(`${tuitionURL}?tab=handover`)
    await mentor
      .getByLabel('Next teaching steps', { exact: true })
      .fill('Preserve the fraction plan and begin with independent number-line examples.')
    await mentor.getByRole('button', { name: 'Prepare handover' }).click()
    await replacement.goto('/tuition')
    await expect(replacement.getByRole('button', { name: 'Accept handover' })).toBeVisible()
    await inspect(replacement, 'tuition-handover-en-desktop')
    await replacement.getByRole('button', { name: 'Accept handover' }).click()
    await expect(replacement).toHaveURL(new RegExp(tuitionURL))
    expect(
      (await tutor.request.get(`/api/v1/enrollments/${tuitionURL.split('/').pop()}`)).status(),
    ).toBe(404)
    await parent.reload()
    await parent.getByRole('tab', { name: 'Learning plan', exact: true }).click()
    await parent.setViewportSize({ width: 390, height: 844 })
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await inspect(parent, 'tuition-plan-en-mobile')
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
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
