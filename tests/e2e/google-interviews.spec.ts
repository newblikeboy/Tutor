import { verifiedSignup } from './signup-fixture'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const captureRoot = 'docs/visual-qa/google-interviews'
async function capture(page: Page, name: string) {
  await mkdir(captureRoot, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${captureRoot}/${name}-${width}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
test('Google connection, persisted scheduling, tutor access, assessment and cancellation', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'mentor-a@example.test', password },
  })
  expect(login.status()).toBe(200)
  const auth = await login.json()
  await page.goto('/workspace?view=interviews')
  await expect(
    page.getByRole('button', { name: 'Connect Google Account', exact: true }),
  ).toBeVisible()
  await capture(page, 'mentor-disconnected')
  await page.getByRole('button', { name: 'Connect Google Account', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Google Account Connected', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('fictional-mentor@example.test')).toBeVisible()
  const tutorContext = await browser.newContext({ baseURL: origin })
  const tutor = await tutorContext.newPage()
  try {
    const tutorLogin = await verifiedSignup(tutor.request, {
      headers: { Origin: origin },
      data: {
        email: `google-applicant-${Date.now()}@example.test`,
        password,
        role: 'tutor',
        name: 'Fictional Google applicant',
        adult: true,
      },
    })
    expect(tutorLogin.status()).toBe(201)
    const tutorAuth = await tutorLogin.json()
    const tutorId = tutorAuth.user.id as string
    const profile = applicationProfile('Fictional Google applicant')
    profile.teachingAreas = profile.teachingAreas.map((area) => ({ ...area, modes: ['online'] }))
    const submit = await tutor.request.put('/api/v1/application', {
      headers: { Origin: origin, 'X-CSRF-Token': tutorAuth.csrf },
      data: { version: 0, step: 5, profile, submit: true },
    })
    expect(submit.status(), await submit.text()).toBe(200)
    await page.goto(`/workspace?view=assessments&application=${tutorId}&tab=review`)
    await expect(
      page.getByRole('button', { name: 'Schedule Google Meet', exact: true }),
    ).toBeVisible()
    await capture(page, 'mentor-scheduling')
    // Schedule through the actual form, then reschedule through the actual form.
    const form = page.getByRole('form', { name: 'Schedule interview', exact: true })
    await form.getByLabel('Interview details').fill('Discuss the fictional teaching approach.')
    await form.getByRole('button', { name: 'Schedule Google Meet' }).click()
    await expect(page.getByRole('link', { name: 'Join Meeting' })).toBeVisible({
      timeout: 20_000,
    })
    await capture(page, 'mentor-confirmed')
    await tutor.goto('/apply')
    await expect(tutor.getByText('Meeting code: abc-defg-hij')).toBeVisible()
    await capture(tutor, 'tutor-confirmed')
    const adminContext = await browser.newContext({ baseURL: origin })
    try {
      const adminPage = await adminContext.newPage()
      const login = await adminPage.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email: 'admin-a@example.test', password },
      })
      expect(login.status()).toBe(200)
      await adminPage.goto(`/workspace?view=applications&application=${tutorId}&tab=review`)
      await expect(
        adminPage.getByText('Google integration: connected', { exact: false }),
      ).toBeVisible()
      await expect(adminPage.getByRole('button', { name: 'Schedule Google Meet' })).toHaveCount(0)
      await expect(adminPage.getByRole('link', { name: 'Join Meeting' })).toHaveCount(0)
      await expect(
        adminPage.getByRole('button', { name: 'Approve tutor', exact: true }),
      ).toHaveCount(0)
      await capture(adminPage, 'admin-read-only')
    } finally {
      await adminContext.close()
    }
    const join = await tutor.request.get(`/api/v1/applications/${tutorId}/interview/join`, {
      maxRedirects: 0,
    })
    expect(join.status()).toBe(303)
    expect(join.headers().location).toBe('https://meet.google.com/abc-defg-hij')
    await page.getByText('Reschedule interview', { exact: true }).click()
    const reschedule = page.getByRole('form', { name: 'Reschedule interview', exact: true })
    const next = new Date(Date.now() + 2 * 86400000 + 19800000).toISOString().slice(0, 16)
    await reschedule.getByLabel('Interview date and time (IST)').fill(next)
    await reschedule.getByLabel('Reason').fill('Fictional applicant requested another time.')
    await reschedule.getByRole('button', { name: 'Reschedule Google Meet' }).click()
    await expect(page.getByText('Rescheduled ', { exact: false })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Join Meeting' })).toBeVisible({
      timeout: 20_000,
    })
    // Set a soon-to-start interview through the same versioned API so manual assessment can be exercised without waiting a day.
    const detail = await page.request.get(`/api/v1/staff/applications/${tutorId}`)
    const current = (await detail.json()).application
    const start = new Date(Date.now() + 3000)
    const changed = await page.request.post(`/api/v1/applications/${tutorId}/decision`, {
      headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
      data: {
        action: 'reschedule',
        version: current.version,
        reason: 'Bring forward this closed-loop test interview.',
        interview: {
          start: start.toISOString(),
          end: new Date(start.getTime() + 30 * 60000).toISOString(),
          timezone: 'Asia/Kolkata',
          joinUrl: '',
          status: 'scheduled',
        },
      },
    })
    expect(changed.status(), await changed.text()).toBe(200)
    await expect
      .poll(
        async () => {
          const detail = (
            await (await page.request.get(`/api/v1/staff/applications/${tutorId}`)).json()
          ).application
          return (
            detail.interview.syncStatus === 'ready' &&
            Date.now() >= Date.parse(detail.interview.start)
          )
        },
        { timeout: 20000 },
      )
      .toBe(true)
    await page.reload()
    const assessment = page.getByRole('form', { name: 'Interview assessment', exact: true })
    await expect(assessment).toBeVisible({ timeout: 20_000 })
    for (const label of [
      'Subject knowledge',
      'Teaching ability',
      'Communication skills',
      'Professionalism',
    ])
      await assessment.getByLabel(label, { exact: true }).selectOption('4')
    await assessment
      .getByLabel('Mentor feedback')
      .fill('Fictional observed teaching feedback for a second interview.')
    await assessment.getByLabel('Recommendation', { exact: true }).selectOption('reinterview')
    await assessment.getByLabel('I conducted this interview').check()
    await capture(page, 'mentor-assessment')
    await assessment.getByRole('button', { name: 'Submit assessment' }).click()
    await expect(
      page.getByRole('heading', { name: 'Interview assessment submitted' }),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByText('Recommendation: Re-interview required')).toBeVisible()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.getByText('Interview assessment submitted', { exact: true })).toBeVisible()
    await page.getByText('Interview feedback and ratings', { exact: true }).click()
    await expect(page.getByText('Recommendation: Re-interview', { exact: true })).toBeVisible()
    await capture(page, 'mentor-assessment-history')
    await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
    await tutor.reload()
    await expect(tutor.getByText('Your mentor recommends another interview.')).toBeVisible()
    await capture(tutor, 'tutor-feedback')
    await page.getByRole('button', { name: 'Schedule Google Meet', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join Meeting' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Cancel interview', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Reason').fill('Fictional applicant requested cancellation.')
    await dialog.getByRole('button', { name: 'Cancel interview', exact: true }).click()
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Join Meeting' })).toHaveCount(0)
    await capture(page, 'mentor-cancelled')
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/v1/staff/applications/${tutorId}`)
          return (await response.json()).application.interview.syncStatus
        },
        { timeout: 20000 },
      )
      .toBe('ready')
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Connect Google Account', exact: true }),
    ).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await tutorContext.close()
  }
})
