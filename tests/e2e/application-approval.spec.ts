import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { applicationProfile } from './helpers/application'

const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'

async function legacyApplicant(minClass = 5) {
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(runtime.webOrigin).toBe(origin)
  const uri =
    process.env.MONGODB_URI ||
    (await readFile('.env', 'utf8'))
      .match(/^MONGODB_URI=(.*)$/m)?.[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
  expect(uri).toBeTruthy()
  const client = new MongoClient(uri!)
  await client.connect()
  const database = client.db(runtime.databaseName)
  const applications = database.collection<{ _id: string; sample: boolean }>('applications')
  const original = await applications.findOne({ _id: 'tutor-arjun', sample: true })
  expect(original).toBeTruthy()
  const profile = applicationProfile('Fictional legacy applicant')
  profile.teachingAreas[0] = {
    ...profile.teachingAreas[0],
    subject: 'All Subjects',
    minClass,
    maxClass: 10,
  }
  const result = await database
    .collection<{ _id: string; sample: boolean }>('applications')
    .updateOne(
      { _id: 'tutor-arjun', sample: true },
      {
        $set: {
          status: 'assessed',
          version: 18,
          assessorId: 'mentor-a',
          conflictClear: false,
          mentorId: '',
          profile,
          scope: { subject: '', minClass: 0, maxClass: 0, mode: '', expiresAt: new Date(0) },
          interview: {
            start: new Date(Date.now() - 60_000),
            end: new Date(Date.now() + 29 * 60_000),
            timezone: 'Asia/Kolkata',
            status: 'completed',
            provider: 'google',
            syncStatus: 'ready',
            meetingId: 'fictional-historical-google-event',
            mentorId: 'mentor-a',
            joinUrl: 'https://meet.google.com/abc-defg-hij',
          },
          interviewAssessment: {
            scores: [4, 4, 4, 4],
            recommendation: 'approve',
            comments: 'Fictional historical interview assessment for scope presentation.',
            mentorId: 'mentor-a',
            submittedAt: new Date(),
          },
          eligibility: { status: 'pending' },
          fees: {
            version: 18,
            setBy: 'admin-a',
            setAt: new Date(),
            plans: [
              { mode: 'online', period: 'hour', amountPaise: 40000, classes: 1, minutes: 60 },
              { mode: 'home', period: 'week', amountPaise: 150000, classes: 6, minutes: 60 },
              { mode: 'home', period: 'month', amountPaise: 500000, classes: 24, minutes: 60 },
            ],
          },
        },
      },
    )
  expect(result.matchedCount).toBe(1)
  return {
    client,
    restore: () => applications.replaceOne({ _id: 'tutor-arjun', sample: true }, original!),
  }
}

test('legacy All Subjects request approves only its primary-class overlap and explains 422 errors', async ({
  page,
}) => {
  const { client, restore } = await legacyApplicant()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const login = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'mentor-a@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    const session = await login.json()
    const invalid = await page.request.post('/api/v1/applications/tutor-arjun/decision', {
      headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
      data: {
        action: 'approve',
        version: 18,
        subjects: ['All Subjects'],
        minClass: 5,
        maxClass: 10,
        modes: ['home', 'online'],
      },
    })
    expect(invalid.status()).toBe(422)
    expect((await invalid.json()).message).toMatch(/All Subjects approval is limited/)
    await page.goto('/workspace?view=assessments&application=tutor-arjun&tab=review')
    const approval = page.getByRole('form', { name: 'Approve tutor', exact: true })
    await expect(approval.getByLabel('From class', { exact: true })).toHaveValue('5')
    await expect(approval.getByLabel('To class', { exact: true })).toHaveValue('5')
    await expect(approval.getByText(/All Subjects is limited to Classes 1/)).toBeVisible()
    await expect(page.locator('.staff-approval-grid > section')).toHaveCount(3)
    await expect(
      approval.getByRole('button', { name: 'Reject application', exact: true }),
    ).toBeVisible()
    await expect(approval.getByLabel('Academic mentor for ongoing learning')).toHaveCount(0)
    await expect(approval.getByLabel('Reason / feedback', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('form', { name: 'Assessment', exact: true })).toHaveCount(0)
    await approval.getByLabel('To class', { exact: true }).fill('10')
    await expect(
      approval.getByRole('button', { name: 'Approve tutor', exact: true }),
    ).toBeDisabled()
    await expect(approval.getByRole('alert')).toHaveText(
      'Choose an approved class range within Classes 1–5.',
    )
    await approval.getByLabel('To class', { exact: true }).fill('5')
    // Forward an invalid scope to the real API once to verify its actionable 422 is visible.
    await page.route('**/api/v1/applications/tutor-arjun/decision', async (route) => {
      const data = route.request().postDataJSON()
      await route.continue({
        postData: JSON.stringify({ ...data, subjects: ['All Subjects', 'All Subjects'] }),
      })
      await page.unroute('**/api/v1/applications/tutor-arjun/decision')
    })
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith('/decision') && r.request().method() === 'POST',
    )
    await approval.getByRole('button', { name: 'Approve tutor', exact: true }).click()
    expect((await rejected).status()).toBe(422)
    await expect(approval.getByRole('alert')).toHaveText('Choose unique teaching subjects.')
    await expect(approval.getByLabel('To class', { exact: true })).toHaveValue('5')
    await mkdir('docs/visual-qa/mentor-approval', { recursive: true })
    for (const [name, width] of [
      ['desktop', 1440],
      ['mobile', 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `docs/visual-qa/mentor-approval/validation-${name}.png`,
        fullPage: true,
      })
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const accepted = page.waitForResponse(
      (r) => r.url().endsWith('/decision') && r.request().method() === 'POST',
    )
    await approval.getByRole('button', { name: 'Approve tutor', exact: true }).click()
    expect((await accepted).status()).toBe(200)
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Approved')
    await page.reload()
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Approved')
    const saved = (await (await page.request.get('/api/v1/staff/applications/tutor-arjun')).json())
      .application
    expect(saved?.scope.subjects).toEqual(['All Subjects'])
    expect([saved?.scope.minClass, saved?.scope.maxClass]).toEqual([5, 5])
    expect(saved?.profile.teachingAreas[0].maxClass).toBe(10)
    expect(saved?.mentorId).toBe('mentor-a')
    expect(saved?.version).toBe(19)
    expect(saved?.interview.status).toBe('completed')
    expect(saved?.scores).toEqual([4, 4, 4, 4, 4, 4])
    expect(saved?.eligibility.status).toBe('pending')
    expect(errors).toEqual([])
  } finally {
    await restore()
    await client.close()
  }
})

test('All Subjects request wholly above Class 5 offers no approval scope', async ({ page }) => {
  const { client, restore } = await legacyApplicant(6)
  try {
    expect(
      (
        await page.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: 'mentor-a@example.test', password: 'E2E-only learning passphrase 426!' },
        })
      ).status(),
    ).toBe(200)
    await page.goto('/workspace?view=assessments&application=tutor-arjun&tab=review')
    await expect(page.getByRole('form', { name: 'Approve tutor', exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Reject application', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Choose only subject, class and mode combinations within an eligible requested teaching area.',
      ),
    ).toBeVisible()
  } finally {
    await restore()
    await client.close()
  }
})

test('admin sees mentor approval details without academic decision controls', async ({ page }) => {
  const { client, restore } = await legacyApplicant()
  try {
    const login = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'admin-a@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    const session = await login.json()
    for (const action of ['schedule', 'fees', 'approve', 'decline']) {
      const denied = await page.request.post('/api/v1/applications/tutor-arjun/decision', {
        headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
        data: { action, version: 18 },
      })
      expect(denied.status()).toBe(403)
    }
    await page.goto('/workspace?view=applications&application=tutor-arjun&tab=review')
    await expect(page.locator('.staff-approval-grid > section')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Save fees', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reject application', exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole('button', { name: 'Schedule Google Meet', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText('Change assigned mentor', { exact: true })).toBeVisible()
    await mkdir('docs/visual-qa/mentor-approval', { recursive: true })
    await page.screenshot({
      path: 'docs/visual-qa/mentor-approval/admin-readonly-desktop.png',
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  } finally {
    await restore()
    await client.close()
  }
})

test('mentor rejects a pending application without an interview or fees and the tutor sees the reason', async ({
  page,
}) => {
  const { client, restore } = await legacyApplicant()
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  const applications = client.db(runtime.databaseName).collection<{ _id: string }>('applications')
  const reason = 'The requested teaching scope does not match the experience in this application.'
  const actions: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/decision')) {
      actions.push(request.postDataJSON().action)
    }
  })
  try {
    await applications.updateOne(
      { _id: 'tutor-arjun' },
      { $set: { status: 'submitted' }, $unset: { interview: '', fees: '' } },
    )
    const login = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'mentor-a@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    await page.goto('/workspace?view=assessments&application=tutor-arjun&tab=review')
    await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Reject application', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Reject application', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Reason / feedback', { exact: true }).fill(reason)
    await mkdir('docs/visual-qa/mentor-approval', { recursive: true })
    for (const [name, width] of [
      ['desktop', 1440],
      ['mobile', 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.screenshot({
        path: `docs/visual-qa/mentor-approval/rejection-${name}.png`,
        fullPage: true,
      })
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const decision = page.waitForResponse(
      (response) =>
        response.url().endsWith('/decision') &&
        response.request().postDataJSON().action === 'decline',
    )
    await dialog.getByRole('button', { name: 'Reject application', exact: true }).click()
    expect((await decision).status()).toBe(200)
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Declined')
    await page.reload()
    await expect(page.locator('.staff-person-heading .badge')).toHaveText('Declined')
    await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reject application', exact: true })).toHaveCount(
      0,
    )
    const saved = (await (await page.request.get('/api/v1/staff/applications/tutor-arjun')).json())
      .application
    expect(saved.status).toBe('declined')
    expect(saved.reason).toBe(reason)
    expect(saved.version).toBe(19)
    // Opening/submitting the portal dialog must not submit its surrounding approval form.
    expect(actions).toEqual(['decline'])
    expect((await page.request.get('/api/v1/tutors/tutor-arjun')).status()).toBe(404)
    const tutorLogin = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'tutor-arjun@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(tutorLogin.status()).toBe(200)
    await page.goto('/apply')
    await expect(page.getByText(reason, { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await restore()
    await client.close()
  }
})
