import { fillApplication } from './helpers/application'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'

const password = 'E2E-only learning passphrase 426!'
const origin = 'http://127.0.0.1:5174'
async function signIn(page: Page, email = 'admin-a@example.test') {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email, password },
  })
  expect(response.status()).toBe(200)
  return response.json()
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/staff-tabs/lifecycle', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `docs/visual-qa/staff-tabs/lifecycle/${name}.png`, fullPage: true })
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function decide(page: Page, label: string, reason: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Reason / feedback', { exact: true }).fill(reason)
  if (label === 'Terminate tutor') await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: label, exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('staff reviews a real application, schedules Zoom, approves and manages the tutor lifecycle', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tutorContext = await browser.newContext({ baseURL: origin, timezoneId: 'Asia/Kolkata' })
  try {
    const tutor = await tutorContext.newPage()
    const email = `staff-applicant-${Date.now()}@example.test`
    const signup = await tutor.request.post('/api/v1/auth/signup', {
      headers: { Origin: origin },
      data: { email, password, role: 'tutor', name: 'Fictional staff-flow applicant', adult: true },
    })
    expect(signup.status()).toBe(201)
    const account = await signup.json()
    const id = account.user.id as string
    await tutor.goto('/apply')
    await fillApplication(tutor, 'Fictional staff-flow applicant')
    await expect(tutor.getByText('Submitted', { exact: true })).toBeVisible()
    expect((await tutor.request.get('/api/v1/staff/overview')).status()).toBe(403)

    await signIn(page)
    await page.goto('/workspace?view=applications&status=submitted')
    await page
      .locator('.staff-row')
      .filter({ hasText: 'Fictional staff-flow applicant' })
      .last()
      .click()
    await expect(page).toHaveURL(new RegExp(`application=${id}`))
    await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
    await page.getByRole('checkbox', { name: 'I have no conflict of interest' }).check()
    await page.getByRole('button', { name: 'Start review', exact: true }).click()
    await page
      .getByLabel('Interview date and time (IST)')
      .fill(new Date(Date.now() + 86_400_000 + 19_800_000).toISOString().slice(0, 16))
    await expect(page.getByLabel('Zoom join link', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Create Zoom meeting', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join Zoom meeting' })).toBeVisible()
    const zoom = (await page.getByRole('link', { name: 'Join Zoom meeting' }).getAttribute('href'))!
    expect(zoom).toMatch(/^https:\/\/zoom\.us\/j\/\d+\?pwd=fictional-test-only$/)
    await expect(page.getByRole('button', { name: 'Save assessment', exact: true })).toBeDisabled()
    await capture(page, 'interview-en-desktop')

    await tutor.reload()
    await expect(tutor.getByRole('link', { name: 'Join Zoom meeting' })).toHaveAttribute(
      'href',
      zoom,
    )
    const download = tutor.waitForEvent('download')
    await tutor.getByRole('button', { name: 'Add to calendar' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('tutor-interview.ics')
    const contents = await readFile((await file.path())!, 'utf8')
    expect(contents).toContain('BEGIN:VEVENT')
    expect(contents).toContain(zoom)
    await capture(tutor, 'applicant-interview-en-desktop')

    await page.getByText('Reschedule interview', { exact: true }).click()
    const reschedule = page.getByRole('form', { name: 'Reschedule interview', exact: true })
    await reschedule
      .getByLabel('Interview date and time (IST)')
      .fill(new Date(Date.now() - 60_000 + 19_800_000).toISOString().slice(0, 16))
    await reschedule
      .getByLabel('Reason / feedback', { exact: true })
      .fill('Fictional applicant is ready; bring forward the sample interview.')
    await reschedule.getByRole('button', { name: 'Reschedule Zoom meeting', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join Zoom meeting' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save assessment', exact: true })).toBeEnabled()
    for (const label of [
      'Subject knowledge',
      'Explanation',
      'Misconceptions',
      'Patience',
      'Planning',
      'Reliability',
    ]) {
      await page
        .getByRole('form', { name: 'Assessment', exact: true })
        .getByLabel(label, { exact: true })
        .selectOption('4')
    }
    await page
      .getByLabel('Assessment evidence', { exact: true })
      .fill(
        'Explained equivalent fractions using a number line and checked the denominator misconception.',
      )
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.locator('.language-button').click()
    await capture(page, 'assessment-hi-mobile')
    await page.locator('.language-button').click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'Save assessment', exact: true }).click()
    const approval = page.getByRole('form', { name: 'Approve tutor', exact: true })
    await approval.getByLabel('Academic mentor for ongoing learning').selectOption('mentor-a')
    await approval.getByLabel('From class', { exact: true }).fill('8')
    await approval.getByLabel('To class', { exact: true }).fill('9')
    await approval
      .getByLabel('Reason / feedback', { exact: true })
      .fill('Evidence supports classes eight and nine online Mathematics with mentor oversight.')
    await approval.getByRole('button', { name: 'Approve tutor', exact: true }).click()
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Approved')
    await capture(page, 'approved-en-desktop')
    expect(
      (await (await page.request.get('/api/v1/tutors')).json()).some(
        (v: { id: string }) => v.id === id,
      ),
    ).toBe(true)

    await page
      .locator('summary')
      .filter({ hasText: /^Internal note$/ })
      .click()
    await page
      .getByLabel('Internal note', { exact: true })
      .fill('Private operator note for the next scope review.')
    await page.getByRole('button', { name: 'Save note', exact: true }).click()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.locator('.staff-history')).toContainText(
      'Private operator note for the next scope review.',
    )
    await tutor.reload()
    await expect(tutor.getByText('Private operator note for the next scope review.')).toHaveCount(0)
    await tutor.goto('/workspace')
    await expect(tutor.locator('.desk-sidebar a[href="/availability"]')).toBeVisible()
    await expect(
      tutor.locator('.desk-sidebar').getByRole('link', { name: 'Trial lessons', exact: true }),
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
    await decide(page, 'Suspend tutor', 'Sample conduct review requires teaching access to pause.')
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Suspended')
    expect((await tutor.request.get('/api/v1/dashboard')).status()).toBe(401)
    await signIn(tutor, email)
    expect((await tutor.request.get('/api/v1/enrollments')).status()).toBe(403)
    expect((await tutor.request.get('/api/v1/dashboard')).status()).toBe(200)
    expect(
      (await (await page.request.get('/api/v1/tutors')).json()).some(
        (v: { id: string }) => v.id === id,
      ),
    ).toBe(false)
    await decide(
      page,
      'Reinstate tutor',
      'Sample review completed and existing approval remains valid.',
    )
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Approved')
    await decide(
      page,
      'Terminate tutor',
      'Sample final conduct decision ends the tutor relationship.',
    )
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Terminated')
    await expect(page.getByRole('button', { name: 'Reinstate tutor', exact: true })).toHaveCount(0)
    await capture(page, 'terminated-en-desktop')
    await page.reload()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.locator('.staff-history')).toContainText('Tutor terminated')

    await page.goto('/workspace?view=followups')
    const followup = page
      .locator('.staff-followups article')
      .filter({ hasText: 'Fictional staff-flow applicant' })
      .last()
    await expect(followup).toContainText('0 open trials')
    await followup
      .locator('summary')
      .filter({ hasText: /^Record follow-up outcome$/ })
      .click()
    await followup
      .getByLabel('Outcome and next steps')
      .fill('No existing bookings. Sample tutor notified during the manual operator review.')
    await followup.getByRole('checkbox').check()
    const resolved = page.waitForResponse(
      (response) => response.url().includes('/resolve') && response.request().method() === 'POST',
    )
    await followup.getByRole('button', { name: 'Record follow-up outcome', exact: true }).click()
    expect((await resolved).status()).toBe(200)
    await page.getByLabel('Status', { exact: true }).selectOption('resolved_operator')
    await expect(page.locator('.staff-followups')).toContainText('No existing bookings.')
    await capture(page, 'followup-en-desktop')
    expect(errors).toEqual([])
  } finally {
    await tutorContext.close()
  }
})

test('staff errors are recoverable and stale decisions cannot overwrite another reviewer', async ({
  page,
}) => {
  const auth = await signIn(page)
  await page.route('**/api/v1/staff/overview', (route) => route.abort())
  await page.goto('/workspace')
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await page.unroute('**/api/v1/staff/overview')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.staff-metrics')).toBeVisible()
  await page.goto('/workspace?view=tutors&application=tutor-arjun')
  await expect(page.locator('.staff-person-heading')).toContainText('Arjun')
  await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
  const snapshot = await (await page.request.get('/api/v1/staff/applications/tutor-arjun')).json()
  const concurrent = await page.request.post('/api/v1/applications/tutor-arjun/decision', {
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
    data: {
      action: 'note',
      version: snapshot.application.version,
      reason: 'Another operator recorded a sample update.',
    },
  })
  expect(concurrent.status()).toBe(200)
  await page.getByRole('button', { name: 'Suspend tutor', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Reason / feedback', { exact: true })
    .fill('This stale attempt must not change the active approval.')
  await dialog.getByRole('button', { name: 'Suspend tutor', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('This record changed.')
  expect(
    (await (await page.request.get('/api/v1/staff/applications/tutor-arjun')).json()).application
      .status,
  ).toBe('approved')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Suspend tutor', exact: true })).toBeFocused()
})
