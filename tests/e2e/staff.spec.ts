import { connectGoogle, conductInterview } from './helpers/google'
import { verifiedSignup } from './signup-fixture'
import { applicationProfile, fillStaffFees } from './helpers/application'
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
  await mkdir('docs/visual-qa/mentor-approval/lifecycle', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: `docs/visual-qa/mentor-approval/lifecycle/${name}.png`,
    fullPage: true,
  })
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

test('staff reviews a real application, schedules Google Meet, approves and manages the tutor lifecycle', async ({
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
    const signup = await verifiedSignup(tutor.request, {
      headers: { Origin: origin },
      data: { email, password, role: 'tutor', name: 'Fictional staff-flow applicant', adult: true },
    })
    expect(signup.status()).toBe(201)
    const account = await signup.json()
    const id = account.user.id as string
    const profile = applicationProfile('Fictional staff-flow applicant')
    profile.about.location = {
      address: 'Fictional test location',
      locality: 'Line Bazar',
      city: 'Purnea',
      district: 'Purnea',
      state: 'Bihar',
      country: 'India',
      postalCode: '854301',
      latitude: 25.77,
      longitude: 87.47,
      accuracyMeters: 100,
      source: 'manual',
    }
    const submitted = await tutor.request.put('/api/v1/application', {
      headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
      data: { version: 0, step: 5, profile, submit: true },
    })
    expect(submitted.status(), await submitted.text()).toBe(200)
    expect((await submitted.json()).assessorId).toBe('mentor-a')
    await tutor.goto('/apply')
    await expect(tutor.getByText('Submitted', { exact: true })).toBeVisible()
    expect((await tutor.request.get('/api/v1/staff/overview')).status()).toBe(403)

    await signIn(page, 'mentor-a@example.test')
    await connectGoogle(page)
    await page.goto('/workspace?view=assessments&status=submitted')
    await page
      .locator('.staff-row')
      .filter({ hasText: 'Fictional staff-flow applicant' })
      .last()
      .click()
    await expect(page).toHaveURL(new RegExp(`application=${id}`))
    await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
    await page
      .getByLabel('Interview date and time (IST)')
      .fill(new Date(Date.now() + 86_400_000 + 19_800_000).toISOString().slice(0, 16))
    await expect(page.getByLabel('Meeting join link', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Schedule Google Meet', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join Meeting' })).toBeVisible()
    const meeting = (await (await page.request.get(`/api/v1/staff/applications/${id}`)).json())
      .application.interview.joinUrl
    expect(meeting).toMatch(/^https:\/\/meet\.google\.com\/[a-z-]+$/)
    await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toBeDisabled()
    await capture(page, 'interview-en-desktop')

    await tutor.reload()
    await expect(tutor.getByRole('link', { name: 'Join Meeting' })).toHaveAttribute(
      'href',
      `/api/v1/applications/${id}/interview/join`,
    )
    const download = tutor.waitForEvent('download')
    await tutor.getByRole('button', { name: 'Add to calendar' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('tutor-interview.ics')
    const contents = await readFile((await file.path())!, 'utf8')
    expect(contents).toContain('BEGIN:VEVENT')
    expect(contents).toContain(meeting)
    await capture(tutor, 'applicant-interview-en-desktop')

    await conductInterview(page, id)
    await fillStaffFees(page)
    const fees = (await (await page.request.get(`/api/v1/staff/applications/${id}`)).json())
      .application.fees
    expect(fees.plans.map((plan: { amountPaise: number }) => plan.amountPaise)).toEqual([
      40000, 150000, 500000,
    ])
    await page.reload()
    await expect(
      page
        .locator('.staff-fee-form')
        .getByRole('group', { name: 'Home Tuition · monthly', exact: true })
        .getByLabel('Classes included'),
    ).toHaveValue('24')
    await mkdir('docs/visual-qa/mentor-approval/fees', { recursive: true })
    await page
      .locator('.staff-fee-form')
      .screenshot({ path: 'docs/visual-qa/mentor-approval/fees/fees-en-desktop.png' })
    await page.setViewportSize({ width: 390, height: 1000 })
    await expect(page.locator('.language-button')).toHaveCount(0)
    await page
      .locator('.staff-fee-form')
      .screenshot({ path: 'docs/visual-qa/mentor-approval/fees/fees-en-mobile.png' })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.language-button')).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const approval = page.getByRole('form', { name: 'Approve tutor', exact: true })
    await approval.getByLabel('From class', { exact: true }).fill('8')
    await approval.getByLabel('To class', { exact: true }).fill('9')
    await approval.getByRole('button', { name: 'Approve tutor', exact: true }).click()
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Approved')
    await capture(page, 'approved-en-desktop')
    const publicTutor = await (await page.request.get(`/api/v1/tutors/${id}`)).json()
    expect(publicTutor.feePlans.map((plan: { amountPaise: number }) => plan.amountPaise)).toEqual([
      40000, 150000, 500000,
    ])
    expect(
      (await (await page.request.get('/api/v1/tutors')).json()).some(
        (v: { id: string }) => v.id === id,
      ),
    ).toBe(true)

    expect((await tutor.request.get('/api/v1/enrollments')).status()).toBe(200)

    await signIn(page)
    await page.goto(`/workspace?view=tutors&application=${id}&tab=review`)
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

    await page
      .locator('.desk-sidebar')
      .getByRole('link', { name: 'Tutor network', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click()
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
      action: 'suspend',
      version: snapshot.application.version,
      reason: 'Another operator paused this sample tutor.',
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
  ).toBe('suspended')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Suspend tutor', exact: true })).toBeFocused()
  const latest = (await (await page.request.get('/api/v1/staff/applications/tutor-arjun')).json())
    .application
  const restored = await page.request.post('/api/v1/applications/tutor-arjun/decision', {
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
    data: {
      action: 'reinstate',
      version: latest.version,
      reason: 'Restore this isolated sample after the stale-decision check.',
    },
  })
  expect(restored.status(), await restored.text()).toBe(200)
})
