import { verifiedSignup } from './signup-fixture'
import { test, expect, type APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
async function login(request: APIRequestContext, id: string) {
  const response = await request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password },
  })
  expect(response.status()).toBe(200)
}
async function write(request: APIRequestContext, path: string, data: unknown, method = 'POST') {
  const session = await (await request.get('/api/v1/auth/session')).json()
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      'X-CSRF-Token': session.csrf,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data,
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test('weekly books six classes and monthly books twenty-four across calendar periods and planned leave', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  const staff = await browser.newContext({ baseURL: origin })
  const tutor = await browser.newContext({ baseURL: origin })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await login(staff.request, 'mentor-a')
    await login(tutor.request, 'tutor-arjun')
    const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
    expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
    expect(runtime.webOrigin).toBe(origin)
    let uri = process.env.MONGODB_URI
    if (!uri) {
      const config = await readFile('.env', 'utf8')
      uri = config
        .match(/^MONGODB_URI=(.*)$/m)?.[1]
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
    expect(uri).toBeTruthy()
    const database = new MongoClient(uri!)
    try {
      await database.connect()
      // Convert only the fictional seed approval to a Home scope in this isolated run.
      // Staff prices/decisions, the trial and enrollment still use the real Go API.
      const updated = await database
        .db(runtime.databaseName)
        .collection<{ _id: string; sample: boolean }>('applications')
        .updateOne(
          { _id: 'tutor-arjun', sample: true },
          { $set: { 'scope.mode': 'home', 'scope.modes': ['home'] } },
        )
      expect(updated.matchedCount).toBe(1)
    } finally {
      await database.close()
    }
    let application = (
      await (await staff.request.get('/api/v1/staff/applications/tutor-arjun')).json()
    ).application
    await write(staff.request, '/applications/tutor-arjun/decision', {
      action: 'fees',
      version: application.version,
      feePlans: [
        { mode: 'home', period: 'week', classes: 6, minutes: 60, amountPaise: 300000 },
        { mode: 'home', period: 'month', classes: 24, minutes: 60, amountPaise: 500000 },
      ],
      reason: 'Staff pricing for isolated fictional schedule regression.',
    })
    application = (await (await staff.request.get('/api/v1/staff/applications/tutor-arjun')).json())
      .application
    await write(staff.request, '/applications/tutor-arjun/decision', {
      action: 'approve',
      version: application.version,
      subjects: ['Mathematics'],
      minClass: 6,
      maxClass: 10,
      modes: ['home'],
      mentorId: 'mentor-a',
      reason: 'Explicit assessed scope for isolated fictional schedule regression.',
    })
    const first = new Date(Date.now() + 7 * 86400000)
    const date = first.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const leave = new Date(first.getTime() + 7 * 86400000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    })
    const availability = await (await tutor.request.get('/api/v1/availability')).json()
    await write(
      tutor.request,
      '/availability',
      {
        version: availability.version,
        timezone: 'Asia/Kolkata',
        windows: [{ day: first.getDay(), startMinute: 540, endMinute: 1080 }],
        dailyCapacity: 12,
        bufferMinutes: 0,
        leaveDates: [leave],
        paused: false,
      },
      'PUT',
    )
    const signup = await verifiedSignup(page.request, {
      headers: { Origin: origin },
      data: {
        email: `package-schedule-${crypto.randomUUID()}@example.test`,
        password,
        name: 'Fictional schedule family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signup.status()).toBe(201)
    const consent = await write(page.request, '/consents', {
      relationship: 'parent',
      accepted: true,
    })
    const learner = await write(page.request, '/learners', {
      name: 'Fictional schedule learner',
      class: 8,
      board: 'CBSE',
      language: 'English',
      kind: 'minor',
      consentId: consent.id,
    })
    const trial = await write(page.request, '/trials', {
      learnerId: learner.id,
      subjects: ['Mathematics'],
      tutorId: 'tutor-arjun',
      mode: 'home',
      start: `${date}T09:00:00+05:30`,
      termsAccepted: true,
    })
    await write(tutor.request, `/trials/${trial.id}/action`, { action: 'accept' })
    await write(tutor.request, `/trials/${trial.id}/action`, {
      action: 'complete',
      notes: 'Worked through fictional examples with the learner.',
      nextSteps: 'Practise the examples before regular classes.',
      review: 'Tutor feedback is ready for the parent.',
    })
    await page.goto('/tuition')
    const card = page.locator('.tu-teacher-booking-card').filter({ hasText: 'Arjun' })
    await card.getByRole('button', { name: 'Book Now', exact: true }).click()
    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/enrollments' && request.method() === 'POST')
        requests.push(request.url())
    })
    for (const [label, count, minuteIndex, total] of [
      ['weekly', 6, 2, 300000],
      ['monthly', 24, 4, 500000],
    ] as const) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await card.getByRole('radio', { name: new RegExp(`Home Tuition.*${label}`) }).check()
        await card.locator('.trial-date.available').first().click()
        await card.locator('.parent-trial-times button:enabled').nth(minuteIndex).click()
        await expect(card.getByRole('alert')).toHaveCount(0)
        const schedule = card.locator('.tu-regular-booking-summary .tu-disclosure')
        if (!(await schedule.evaluate((element) => element.hasAttribute('open'))))
          await schedule.locator('summary').click()
        await expect(schedule.locator('li')).toHaveCount(count)
        await card.getByRole('checkbox', { name: 'I have reviewed the schedule' }).check()
        await expect(
          card.getByRole('button', { name: 'Continue to payment', exact: true }),
        ).toBeEnabled()
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        await mkdir('docs/visual-qa/package-schedule', { recursive: true })
        await page.screenshot({
          path: `docs/visual-qa/package-schedule/${label}-${count}-classes-${width}.png`,
          fullPage: true,
        })
      }
      const displayedDates = await card
        .locator('.tu-regular-booking-summary .tu-dates li')
        .allTextContents()
      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/enrollments' &&
          response.request().method() === 'POST',
      )
      await card.getByRole('button', { name: 'Continue to payment', exact: true }).click()
      const response = await created
      expect(response.status(), await response.text()).toBe(201)
      const enrollment = await response.json()
      expect(enrollment.status).toBe('awaiting_payment')
      expect(enrollment.agreement.sessionCount).toBe(count)
      expect(enrollment.agreement.totalPaise).toBe(total)
      const format = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      expect(
        enrollment.agreement.starts.map((start: string) => `${format.format(new Date(start))} IST`),
      ).toEqual(displayedDates)
      expect(
        enrollment.agreement.starts.map((start: string) =>
          new Date(start).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        ),
      ).not.toContain(leave)
      const elapsed =
        new Date(enrollment.agreement.starts.at(-1)).getTime() -
        new Date(enrollment.agreement.starts[0]).getTime()
      expect(elapsed).toBeGreaterThan((label === 'weekly' ? 7 : 31) * 86400000)
      await expect(
        page.getByRole('heading', { name: 'Complete your booking', exact: true }),
      ).toBeVisible()
      if (label === 'weekly') {
        await page.getByRole('link', { name: 'All classes', exact: true }).click()
        await card.getByRole('button', { name: 'Book Now', exact: true }).click()
      }
    }
    expect(requests).toHaveLength(2)
    expect(errors).toEqual([])
  } finally {
    await staff.close()
    await tutor.close()
  }
})
