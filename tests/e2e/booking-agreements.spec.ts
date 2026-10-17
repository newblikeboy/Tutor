import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  request as requestFactory,
} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createDecipheriv } from 'node:crypto'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
async function login(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200)
  const me = await (await request.get('/api/v1/me')).json()
  return { Origin: origin, 'X-CSRF-Token': me.csrf }
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/booking-agreements', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(page.frames()).toHaveLength(1)
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `docs/visual-qa/booking-agreements/${name}-${width}.png`,
      fullPage: (await page.getByRole('dialog').count()) === 0,
    })
  }
}
test('admin agreements, paid tutor signing, directions, completion and parent concerns', async ({
  page,
}) => {
  test.skip(process.env.E2E_PAYMENT_SIMULATION !== '1', 'Explicit isolated simulation required')
  test.setTimeout(240000)
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(runtime.webOrigin).toBe(origin)
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const db = mongo.db(runtime.databaseName)
  const parentContext = await requestFactory.newContext({ baseURL: origin }),
    tutorContext = await requestFactory.newContext({ baseURL: origin }),
    adminContext = await requestFactory.newContext({ baseURL: origin })
  // Switch one rendered page between independent real sessions on memory-limited hosts.
  const parent = page,
    tutor = page
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    const adminHeaders = await login(adminContext, 'admin-a@example.test')
    await page.context().addCookies((await adminContext.storageState()).cookies)
    await page.goto('/account?tab=agreements')
    await expect(
      page.getByRole('heading', { name: 'Agreement Builder', exact: true, level: 1 }),
    ).toBeVisible()
    const builder = (mode: string) => page.locator(`#agreement-mode-panel-${mode}`)
    const fill = async (mode: string) => {
      const panel = builder(mode)
      await panel
        .getByLabel('Agreement title', { exact: true })
        .fill(`Fictional ${mode} teaching agreement`)
      await panel
        .getByLabel(/Tutor responsibilities/)
        .fill(
          `Fictional ${mode} conditions: teach the agreed subjects, record each actual lesson and respect the family’s privacy.`,
        )
      await panel
        .getByLabel('Privacy policy conditions', { exact: true })
        .fill('Fictional test policy: do not share student information or the household address.')
      await panel
        .getByLabel('Education policy conditions', { exact: true })
        .fill('Fictional test policy: teach approved subjects and provide accurate lesson records.')
    }
    await fill('online')
    await builder('online').getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(
      page.getByText('Draft saved. The published agreement is unchanged.', { exact: true }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Home Tuition (offline)', exact: true }).click()
    await fill('home')
    await page.getByRole('tab', { name: 'Online', exact: true }).click()
    await expect(builder('online').getByLabel('Agreement title', { exact: true })).toHaveValue(
      'Fictional online teaching agreement',
    )
    await builder('online').getByRole('checkbox').check()
    await builder('online').getByRole('button', { name: 'Publish agreement', exact: true }).click()
    await expect(builder('online').getByText('Published version 3', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Home Tuition (offline)', exact: true }).click()
    await expect(builder('home').getByLabel('Agreement title', { exact: true })).toHaveValue(
      'Fictional home teaching agreement',
    )
    await builder('home').getByRole('checkbox').check()
    await builder('home').getByRole('button', { name: 'Publish agreement', exact: true }).click()
    await expect(builder('home').getByText('Published version 2', { exact: true })).toBeVisible()
    await capture(page, 'admin-builder')

    const parentHeaders = await login(parentContext, 'parent-a@example.test')
    const tutorHeaders = await login(tutorContext, 'tutor-arjun@example.test')
    const id = crypto.randomUUID()
    const first = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    })
    // Fictional prerequisites only, in the exact isolated database. Payment and signing use the real API.
    await db.collection('applications').updateOne(
      { _id: 'tutor-arjun' as never },
      {
        $set: {
          'scope.modes': ['online', 'home'],
          fees: {
            version: 2,
            setBy: 'mentor-a',
            setAt: new Date(),
            plans: [
              { mode: 'home', period: 'week', classes: 6, minutes: 60, amountPaise: 75000 },
              { mode: 'online', period: 'hour', classes: 1, minutes: 60, amountPaise: 12500 },
            ],
          },
        },
      },
    )
    const available = await tutorContext.put('/api/v1/availability', {
      headers: tutorHeaders,
      data: {
        timezone: 'Asia/Kolkata',
        windows: Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 0, endMinute: 1440 })),
        leaveDates: [],
        bufferMinutes: 0,
        dailyCapacity: 10,
        paused: false,
        version: 0,
      },
    })
    expect(available.status(), await available.text()).toBe(200)
    const av = await available.json()
    const consent = await (
      await parentContext.post('/api/v1/consents', {
        headers: parentHeaders,
        data: { relationship: 'parent', accepted: true },
      })
    ).json()
    const learnerResponse = await parentContext.post('/api/v1/learners', {
      headers: { ...parentHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: 'Booking agreement student',
        class: 8,
        board: 'CBSE',
        language: 'English',
        kind: 'minor',
        consentId: consent.id,
      },
    })
    expect(learnerResponse.status(), await learnerResponse.text()).toBe(201)
    const learner = await learnerResponse.json()
    await db.collection('preferences').updateOne(
      { _id: 'parent-a' as never },
      {
        $set: {
          language: 'en',
          version: 1,
          location: {
            latitude: 25.75,
            longitude: 87.45,
            address: 'Fictional teaching address',
            locality: 'Test locality',
            city: 'Purnea',
            country: 'India',
            source: 'browser',
          },
        },
      },
      { upsert: true },
    )
    await db.collection('trials').insertOne({
      _id: id as never,
      ownerId: 'parent-a',
      tutorId: 'tutor-arjun',
      mentorId: 'mentor-a',
      learnerId: learner.id,
      learnerName: learner.name,
      class: 8,
      subject: 'Mathematics',
      subjects: ['Mathematics'],
      mode: 'home',
      status: 'completed',
      version: 1,
      start: new Date(Date.now() - 7200000),
      end: new Date(Date.now() - 3600000),
    })
    const booked = await parentContext.post('/api/v1/enrollments', {
      headers: { ...parentHeaders, 'Idempotency-Key': id },
      data: {
        trialId: id,
        subjects: ['Mathematics'],
        packageMode: 'home',
        packagePeriod: 'week',
        offeringVersion: av.version,
        feeVersion: 2,
        accepted: true,
        schedule: {
          startDate: first,
          time: '10:00',
          timezone: 'Asia/Kolkata',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          count: 6,
          minutes: 60,
        },
      },
    })
    expect(booked.status(), await booked.text()).toBe(201)
    const enrollment = await booked.json()
    const checkout = await parentContext.post(`/api/v1/enrollments/${enrollment.id}/payment`, {
      headers: { ...parentHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { retry: false },
    })
    expect(checkout.status(), await checkout.text()).toBe(200)
    const intent = (await checkout.json()).intent
    expect(
      (
        await parentContext.post(`/api/v1/billing/${intent.id}/simulate`, {
          headers: parentHeaders,
          data: { confirmed: true },
        })
      ).status(),
    ).toBe(200)
    await page.context().addCookies((await tutorContext.storageState()).cookies)
    await tutor.goto('/tuition')
    await expect(tutor.getByRole('cell', { name: /^Awaiting tutor acceptance/ })).toBeVisible()
    await expect(tutor.getByRole('link', { name: /Directions to/ })).toHaveCount(0)
    await tutor.getByRole('link', { name: /Booking agreement student View booking/ }).click()
    await tutor.getByRole('button', { name: 'Review agreement and accept', exact: true }).click()
    await expect(
      tutor.getByRole('heading', { name: 'Fictional home teaching agreement', exact: true }),
    ).toBeVisible()
    await expect(
      tutor.getByRole('button', { name: 'Send signing code', exact: true }),
    ).toBeDisabled()
    await tutor.getByRole('checkbox', { name: /I have read and agree/ }).check()
    const requested = tutor.waitForResponse(
      (r) => r.url().endsWith('/signing-code') && r.request().method() === 'POST',
    )
    await tutor.getByRole('button', { name: 'Send signing code', exact: true }).click()
    const challengeResponse = await requested
    expect(challengeResponse.status()).toBe(202)
    const challenge = (await challengeResponse.json()).challengeId
    await capture(tutor, 'signing-code')
    const job = await db.collection('outbox').findOne({ _id: `email-code:${challenge}` as never })
    const encrypted = Buffer.from(job!.payload.encryptedCode, 'base64')
    const decrypt = createDecipheriv('aes-256-gcm', Buffer.alloc(32), encrypted.subarray(0, 12))
    decrypt.setAAD(Buffer.from(challenge))
    decrypt.setAuthTag(encrypted.subarray(-16))
    const code = Buffer.concat([
      decrypt.update(encrypted.subarray(12, -16)),
      decrypt.final(),
    ]).toString()
    await tutor.getByLabel('Email signing code', { exact: true }).fill(code)
    await tutor.getByRole('button', { name: 'Verify code and sign agreement', exact: true }).click()
    await expect(tutor.getByText(/Signed by Arjun/)).toBeVisible()
    await expect(tutor.getByRole('button', { name: 'Accept booking', exact: true })).toBeVisible()
    await capture(tutor, 'signed-agreement')
    // Publishing a new version cannot change the signed booking.
    const latest = await (await adminContext.get('/api/v1/admin/teaching-agreements')).json()
    const home = latest.items.find((v: { mode: string }) => v.mode === 'home')
    expect(
      (
        await adminContext.put('/api/v1/admin/teaching-agreements/home', {
          headers: adminHeaders,
          data: {
            version: home.version,
            action: 'publish',
            content: {
              ...home.draft,
              body: 'Fictional replacement agreement for future bookings only.',
            },
          },
        })
      ).status(),
    ).toBe(200)
    await tutor.reload()
    await expect(
      tutor.getByText('Fictional replacement agreement for future bookings only.', { exact: true }),
    ).toHaveCount(0)
    await tutor.getByRole('button', { name: 'Accept booking', exact: true }).click()
    await expect(
      tutor.getByRole('heading', { name: 'Awaiting tutor acceptance', exact: true }),
    ).toHaveCount(0)
    await tutor.goto('/tuition')
    const directions = tutor.getByRole('link', {
      name: "Directions to Booking agreement student's teaching address",
      exact: true,
    })
    await expect(directions).toHaveAttribute('href', /destination=25.75%2C87.45/)
    await capture(tutor, 'current-booking-directions')
    const detail = await (await tutorContext.get(`/api/v1/enrollments/${enrollment.id}`)).json()
    const session = detail.sessions[0]
    await tutor.goto(`/tuition/${enrollment.id}?class=${encodeURIComponent(session.id)}`)
    await tutor.getByRole('button', { name: 'Mark class completed', exact: true }).click()
    const complete = tutor.getByRole('dialog', { name: 'Mark class completed', exact: true })
    await complete
      .getByLabel('What did you teach today?', { exact: true })
      .fill('We practised adding fractions with equal denominators.')
    await complete.getByRole('checkbox', { name: 'Did you give homework?', exact: true }).check()
    await complete
      .getByLabel('Homework assigned', { exact: true })
      .fill('Complete the five fraction practice questions.')
    await complete.getByRole('checkbox', { name: /Development test recording/ }).check()
    await capture(tutor, 'completion-dialog')
    await complete.getByRole('button', { name: 'Complete class', exact: true }).click()
    await expect(complete).toHaveCount(0)
    expect(
      await db.collection('outbox').countDocuments({
        'payload.event': 'class_completed',
        'payload.targetId': session.id,
        'payload.recipientId': 'parent-a',
      }),
    ).toBe(1)
    await tutor.goto('/tuition')
    await expect(
      tutor.getByRole('table', { name: 'Current regular class bookings', exact: true }),
    ).toBeVisible()
    for (const lesson of detail.sessions.slice(1)) {
      const result = await tutorContext.post(
        `/api/v1/classes/${encodeURIComponent(lesson.id)}/action`,
        {
          headers: tutorHeaders,
          data: {
            action: 'complete',
            version: lesson.version,
            notes: 'Fictional test lesson covering the agreed fraction exercises.',
            homeworkGiven: false,
            developmentRecord: true,
          },
        },
      )
      expect(result.status(), await result.text()).toBe(200)
    }
    await tutor.goto('/tuition')
    await expect(
      tutor.getByRole('table', { name: 'Current regular class bookings', exact: true }),
    ).toHaveCount(0)
    await tutor.getByRole('link', { name: 'Past bookings', exact: true }).click()
    await expect(
      tutor.getByRole('table', { name: 'Past regular class bookings', exact: true }),
    ).toBeVisible()
    await expect(tutor.getByRole('link', { name: /Directions to/ })).toHaveCount(0)
    await capture(tutor, 'past-bookings')
    await page.context().addCookies((await parentContext.storageState()).cookies)
    await parent.goto(`/tuition/${enrollment.id}?class=${encodeURIComponent(session.id)}&report=1`)
    const report = parent.getByRole('dialog', { name: 'Report a class concern', exact: true })
    await expect(report).toBeVisible()
    await report
      .getByLabel('What happened?', { exact: true })
      .fill('Please check whether this class was marked completed by mistake.')
    await capture(parent, 'parent-report')
    await report.getByRole('button', { name: 'Submit report', exact: true }).click()
    await expect(parent).toHaveURL(/\/cases\//)
    await expect(
      parent.getByText(/Please check whether this class was marked completed by mistake/),
    ).toBeVisible()
    await capture(parent, 'parent-ticket')
    expect(errors).toEqual([])
  } finally {
    await parentContext.dispose()
    await tutorContext.dispose()
    await adminContext.dispose()
    await mongo.close()
  }
})
