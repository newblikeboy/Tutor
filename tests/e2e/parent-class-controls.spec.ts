import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  request as requestFactory,
} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase, verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
async function login(context: APIRequestContext, id: string) {
  const response = await context.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password },
  })
  expect(response.status()).toBe(200)
  return { Origin: origin, 'X-CSRF-Token': (await response.json()).csrf }
}
async function capture(page: Page, name: string) {
  const folder = 'docs/visual-qa/parent-class-controls'
  await mkdir(folder, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${folder}/${name}-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
test('parent class tabs, private message attachments and admin-led tutor changes', async ({
  page,
}) => {
  test.setTimeout(210000)
  test.skip(process.env.E2E_CLOUDINARY !== '1', 'Explicit isolated Cloudinary fixture required')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional class family',
      email: `class-controls-${crypto.randomUUID()}@example.test`,
      password,
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json(),
    headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const learnerResponse = await page.request.post('/api/v1/learners', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: 'Fictional class student',
      class: 8,
      board: 'CBSE',
      language: 'English',
      kind: 'adult_self',
    },
  })
  expect(learnerResponse.status()).toBe(201)
  const learner = await learnerResponse.json()
  const admin = await requestFactory.newContext({ baseURL: origin }),
    tutor = await requestFactory.newContext({ baseURL: origin }),
    replacement = await requestFactory.newContext({ baseURL: origin })
  try {
    await login(admin, 'admin-a')
    const tutorHeaders = await login(tutor, 'tutor-meera'),
      replacementHeaders = await login(replacement, 'tutor-arjun')
    for (const [context, h] of [
      [tutor, tutorHeaders],
      [replacement, replacementHeaders],
    ] as const) {
      const current = await (await context.get('/api/v1/availability')).json()
      const saved = await context.put('/api/v1/availability', {
        headers: h,
        data: {
          version: current.version,
          timezone: 'Asia/Kolkata',
          windows: Array.from({ length: 7 }, (_, day) => ({
            day,
            startMinute: 0,
            endMinute: 1440,
          })),
          leaveDates: [],
          bufferMinutes: 0,
          dailyCapacity: 10,
          paused: false,
        },
      })
      expect(saved.status(), await saved.text()).toBe(200)
    }
    const id = `class-controls-${crypto.randomUUID()}`,
      start = new Date(Date.now() + 4 * 86400000),
      end = new Date(start.getTime() + 3600000)
    const agreement = {
      _id: `${id}:1`,
      id: `${id}:1`,
      enrollmentId: id,
      version: 1,
      tutorId: 'tutor-meera',
      subject: 'Mathematics',
      subjects: ['Mathematics'],
      mode: 'home',
      timezone: 'Asia/Kolkata',
      sessionCount: 1,
      minutes: 60,
      starts: [start],
      feePerSessionPaise: 0,
      totalPaise: 0,
      currency: 'INR',
      cancellationHours: 12,
      terms: 'Fictional retained test booking',
      termsVersion: 'fixture',
      createdAt: new Date(),
    }
    const { client, database } = await signupDatabase()
    try {
      await database.collection('applications').updateMany(
        { _id: { $in: ['tutor-meera', 'tutor-arjun'] } as never },
        {
          $set: {
            'scope.modes': ['online', 'home'],
            fees: {
              version: 2,
              setBy: 'mentor-a',
              setAt: new Date(),
              plans: [
                { mode: 'online', period: 'hour', classes: 1, minutes: 60, amountPaise: 0 },
                { mode: 'home', period: 'week', classes: 6, minutes: 60, amountPaise: 0 },
              ],
            },
          },
        },
      )
      // Retained fictional active booking; all requested actions use the actual API.
      await database.collection('enrollments').insertOne({
        _id: id as never,
        ownerId: auth.user.id,
        learnerId: learner.id,
        learnerName: learner.name,
        class: 8,
        tutorId: 'tutor-meera',
        tutorName: 'Meera',
        mentorId: 'mentor-a',
        status: 'active',
        agreement,
        planVersion: 0,
        version: 1,
        paymentSimulated: true,
        createdAt: new Date(),
      })
      await database.collection('agreements').insertOne(agreement as never)
      await database.collection('classes').insertOne({
        _id: `${id}-lesson` as never,
        enrollmentId: id,
        tutorId: 'tutor-meera',
        start,
        end,
        bufferMinutes: 0,
        status: 'scheduled',
        timezone: 'Asia/Kolkata',
        notes: '',
        homework: '',
        review: '',
        attendance: '',
        reason: '',
        version: 1,
        proposal: null,
      })
    } finally {
      await client.close()
    }
    await page.goto(`/tuition/${id}`)
    await expect(page.getByRole('tab', { name: 'Learning plan', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Files', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toBeVisible()
    await capture(page, 'classes')
    await page.goto(`/tuition/${id}?tab=plan`)
    await expect(page.getByRole('tab', { name: 'Classes', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.goto(`/tuition/${id}?tab=files`)
    await expect(page.getByRole('tab', { name: 'Classes', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('tab', { name: /Agreement|Schedule/ }).click()
    await expect(page.getByText('Pause classes', { exact: true })).toHaveCount(0)
    const detail = await (await page.request.get(`/api/v1/enrollments/${id}`)).json()
    expect(
      (
        await page.request.post(`/api/v1/enrollments/${id}/action`, {
          headers,
          data: {
            action: 'pause',
            version: detail.enrollment.version,
            reason: 'The API must reject pausing',
          },
        })
      ).status(),
    ).toBe(422)
    await page.getByRole('tab', { name: 'Messages', exact: true }).click()
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    )
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
      'base64',
    )
    await page.getByLabel('Message attachments', { exact: true }).setInputFiles([
      { name: 'fictional-homework.pdf', mimeType: 'application/pdf', buffer: pdf },
      { name: 'fictional-work.png', mimeType: 'image/png', buffer: png },
    ])
    await page
      .getByLabel('Your message', { exact: true })
      .fill('Please see the attached homework and working photo.')
    await capture(page, 'message-draft')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(page.locator('.conversation-attachments')).toContainText('fictional-homework.pdf')
    await expect(page.locator('.conversation-attachments img')).toBeVisible()
    await capture(page, 'message-sent')
    await page.reload()
    await expect(page.locator('.conversation-attachments')).toContainText('fictional-work.png')
    const messages = await (await page.request.get(`/api/v1/enrollments/${id}/messages`)).json(),
      file = messages.items[0].attachments[0]
    const parentCookies = await page.context().cookies()
    await page.context().clearCookies()
    await page.context().addCookies((await tutor.storageState()).cookies)
    const teacher = page
    await teacher.goto(`/tuition/${id}?tab=messages`)
    await expect(teacher.locator('.conversation-attachments')).toContainText(
      'fictional-homework.pdf',
    )
    const downloading = teacher.waitForEvent('download')
    await teacher
      .getByRole('button', { name: 'Download fictional-homework.pdf', exact: true })
      .click()
    expect(await (await downloading).failure()).toBeNull()
    await page.context().clearCookies()
    await page.context().addCookies(parentCookies)
    await page.goto(`/tuition/${id}?tab=handover`)
    await expect(
      page.getByRole('button', { name: 'Request tutor change', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Replacement tutor', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Request tutor change', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Request tutor change', exact: true })
    await dialog
      .getByLabel('Reason for tutor change')
      .fill('We need a replacement tutor for a better teaching fit.')
    await dialog.getByRole('checkbox').check()
    await capture(page, 'tutor-change-request')
    const requested = page.waitForResponse(
      (r) => r.url().endsWith(`/enrollments/${id}/handovers`) && r.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Send request to admin', exact: true }).click()
    const response = await requested
    expect(response.status()).toBe(201)
    const handover = await response.json()
    expect(handover.newTutorId).toBe('')
    await expect(page.getByText(/Your tutor-change request is being handled/)).toBeVisible()
    expect((await page.request.get('/api/v1/admin/tutor-changes')).status()).toBe(403)
    await page.context().clearCookies()
    await page.context().addCookies((await admin.storageState()).cookies)
    const operator = page
    operator.on('pageerror', (e) => errors.push(e.message))
    await operator.goto('/tutor-changes')
    await expect(operator.getByRole('table')).toContainText(learner.name)
    await capture(operator, 'admin-request-queue')
    await operator
      .getByRole('link', { name: `Review request for ${learner.name}`, exact: true })
      .click()
    await operator.getByLabel('Replacement tutor', { exact: true }).selectOption('tutor-arjun')
    await operator
      .getByLabel('Handover instructions')
      .fill('Continue the booked Mathematics classes and keep the saved progress report.')
    await capture(operator, 'admin-request-review')
    await operator.getByRole('button', { name: 'Invite replacement tutor', exact: true }).click()
    await expect(
      operator.getByText('The replacement has been invited.', { exact: false }),
    ).toBeVisible()
    expect((await admin.get(`/api/v1/enrollments/${id}/messages`)).status()).toBe(403)
    const accepted = await replacement.post(`/api/v1/handovers/${handover.id}/action`, {
      headers: replacementHeaders,
      data: { action: 'accept' },
    })
    expect(accepted.status(), await accepted.text()).toBe(200)
    expect(
      (await tutor.get(`/api/v1/files/${file.id}/download`, { maxRedirects: 0 })).status(),
    ).toBe(404)
    expect((await replacement.get(`/api/v1/enrollments/${id}/messages`)).status()).toBe(200)
    await page.context().clearCookies()
    await page.context().addCookies(parentCookies)
    await page.goto(`/tuition/${id}?tab=handover`)
    await expect(page.getByText('Completed', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await Promise.allSettled([admin.dispose(), tutor.dispose(), replacement.dispose()])
  }
})
