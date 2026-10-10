import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'

test('tutor daily teaching, scoped reports, planning, feedback, archives and Zoom', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000)
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(runtime.webOrigin).toBe(origin)
  // Recorded-history presentation fixtures only, confined to the exact isolated database.
  // This fixture does not claim a provider-confirmed payment.
  expect(process.env.MONGODB_URI).toBeTruthy()
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  try {
    const db = mongo.db(runtime.databaseName)
    const id = crypto.randomUUID(),
      learner = `${id}-learner`,
      en = `${id}-current`,
      archive = `${id}-archive`
    const now = new Date(),
      soon = new Date(now.getTime() + 5 * 60000),
      tomorrow = new Date(now.getTime() + 86400000)
    const progress = {
      subject: 'Mathematics',
      topics: [
        {
          title: 'Fractions',
          status: 'practising',
          evidence: 'Explains the examples independently.',
          practice: 'Complete five worked examples.',
        },
      ],
      homeworkStatus: 'completed',
      feedback: 'Explains fractions with growing confidence.',
      nextSteps: 'Practise fraction word problems.',
      recordedAt: now,
    }
    const agreement = (e: string, count: number) => ({
      _id: e + ':1',
      id: e + ':1',
      enrollmentId: e,
      version: 1,
      tutorId: 'tutor-arjun',
      subject: 'Mathematics',
      subjects: ['Mathematics', 'Science'],
      mode: 'online',
      timezone: 'Asia/Kolkata',
      sessionCount: count,
      minutes: 60,
      starts: [soon, tomorrow],
      feePerSessionPaise: 10000,
      totalPaise: count * 10000,
      packageFeePaise: 5000,
      currency: 'INR',
      cancellationHours: 24,
      terms: 'Fictional recorded-history fixture',
      termsVersion: 'test',
      createdAt: now,
    })
    await db.collection('applications').updateOne(
      { _id: 'tutor-arjun' },
      {
        $set: {
          'scope.subjects': ['Mathematics', 'Science'],
          'scope.modes': ['online', 'home'],
          fees: {
            version: 1,
            setAt: now,
            setBy: 'mentor-a',
            plans: [
              { mode: 'online', period: 'hour', amountPaise: 5000, minutes: 60, classes: 1 },
              { mode: 'home', period: 'week', amountPaise: 60000, minutes: 60, classes: 6 },
              { mode: 'home', period: 'month', amountPaise: 240000, minutes: 60, classes: 24 },
            ],
          },
        },
      },
    )
    await db.collection('learners').insertOne({
      _id: learner,
      ownerId: 'parent-a',
      name: 'Tutor workflow learner',
      class: 8,
      board: 'CBSE',
      language: 'English',
      kind: 'adult_self',
      version: 1,
    })
    for (const [e, status, count] of [
      [en, 'active', 2],
      [archive, 'completed', 125],
    ] as const) {
      await db.collection('enrollments').insertOne({
        _id: e,
        ownerId: 'parent-a',
        learnerId: learner,
        learnerName: 'Tutor workflow learner',
        class: 8,
        tutorId: 'tutor-arjun',
        tutorName: 'Arjun sample',
        mentorId: 'mentor-a',
        status,
        agreement: agreement(e, count),
        version: 1,
        planVersion: 0,
        createdAt: now,
      })
      await db.collection('agreements').insertOne(agreement(e, count))
    }
    const session = (
      sid: string,
      e: string,
      start: Date,
      status: string,
      record?: typeof progress,
    ) => ({
      _id: sid,
      enrollmentId: e,
      tutorId: 'tutor-arjun',
      start,
      end: new Date(start.getTime() + 3600000),
      bufferMinutes: 0,
      status,
      timezone: 'Asia/Kolkata',
      notes: status === 'completed' ? 'Recorded fraction examples.' : '',
      homework: status === 'completed' ? 'Complete the next examples.' : '',
      review: '',
      attendance: status === 'completed' ? 'present' : '',
      reason: '',
      version: 1,
      proposal: null,
      ...(record ? { progress: record } : {}),
    })
    await db
      .collection('classes')
      .insertMany([
        session(en + '-today', en, soon, 'scheduled'),
        session(en + '-future', en, tomorrow, 'scheduled'),
        ...Array.from({ length: 125 }, (_, i) =>
          session(
            `${archive}-${String(i).padStart(3, '0')}`,
            archive,
            new Date(now.getTime() - (125 - i) * 86400000),
            'completed',
            i === 124 ? progress : undefined,
          ),
        ),
      ])
    for (const status of ['completed', 'cancelled', 'declined'])
      await db.collection('trials').insertOne({
        _id: id + '-' + status,
        ownerId: 'parent-a',
        learnerId: learner,
        tutorId: 'tutor-arjun',
        mentorId: 'mentor-a',
        learnerName: 'Tutor workflow learner',
        subject: 'Mathematics',
        subjects: ['Mathematics', 'Science'],
        class: 8,
        mode: 'online',
        start: new Date(now.getTime() - 86400000),
        end: new Date(now.getTime() - 82800000),
        status,
        notes: status === 'completed' ? 'Trial observations submitted by the tutor.' : '',
        nextSteps: status === 'completed' ? 'Practise comparing fractions with pictures.' : '',
        review: status === 'completed' ? 'Tutor recommends practice with everyday fractions.' : '',
        version: 1,
        completedAt: status === 'completed' ? now : undefined,
        feePaise: 0,
        termsVersion: 'test',
        terms: 'Fictional trial history fixture',
        createdAt: now,
      })
    await db.collection('notifications').insertOne({
      _id: id + '-notification',
      ownerId: 'tutor-arjun',
      kind: 'booking_confirmed',
      targetId: en,
      read: false,
      createdAt: now,
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/login')
    await page.getByLabel('Email address', { exact: true }).fill('tutor-arjun@example.test')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/workspace/)
    const inspect = async (p: Page, name: string) => {
      await p.evaluate(() => document.fonts.ready)
      await expect(p.locator('.loading-state')).toHaveCount(0)
      expect((await new AxeBuilder({ page: p }).analyze()).violations).toEqual([])
      expect(
        await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1)
      await mkdir('docs/visual-qa/tutor-workspace', { recursive: true })
      await p.screenshot({
        path: `docs/visual-qa/tutor-workspace/${name}.png`,
        fullPage: !name.includes('history'),
      })
    }
    const capture = async (name: string) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await inspect(page, name + '-1440')
      await page.setViewportSize({ width: 390, height: 844 })
      await inspect(page, name + '-390')
    }
    await expect(page.getByText('Next lesson', { exact: true })).toBeVisible()
    await expect(page.getByText('Regular class · Mathematics, Science')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Confirmed bookings', exact: true }),
    ).toBeVisible()
    await capture('home')
    await page.goto('/workspace?view=sessions&queue=completed')
    await expect(
      page.getByText('Tutor recommends practice with everyday fractions.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Awaiting academic review', { exact: true })).toHaveCount(0)
    await capture('trial-feedback')
    await page.getByRole('button', { name: 'Correct trial feedback', exact: true }).click()
    await page
      .getByLabel('Trial feedback', { exact: true })
      .fill('Tutor corrected the trial feedback with a concrete practice recommendation.')
    const correction = page.waitForResponse(
      (r) => r.url().endsWith(`/trials/${id}-completed/action`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save feedback correction', exact: true }).click()
    expect((await correction).status()).toBe(200)
    await page.goto(`/workspace?view=learners&learner=${learner}`)
    await expect(page.getByRole('heading', { name: 'Teaching brief', exact: true })).toBeVisible()
    await expect(page.getByText('Class 8 · CBSE · Teaching language: English')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit profile', exact: true })).toHaveCount(0)
    await capture('learner-overview')
    await page.getByRole('tab', { name: 'Class history', exact: true }).click()
    await expect(page.locator('#child-report-panel-history .child-report-lesson')).toHaveCount(127)
    await capture('learner-history')
    await page.goto(`/tuition/${en}?class=${en}-future`)
    const future = page.locator(`#class-${en}-future`)
    await future.getByRole('button', { name: 'Plan subject', exact: true }).click()
    await future.getByLabel('Lesson subject', { exact: true }).selectOption('Science')
    await capture('subject-plan')
    const planned = page.waitForResponse(
      (r) => r.url().endsWith(`/classes/${en}-future/action`) && r.request().method() === 'POST',
    )
    await future.getByRole('button', { name: 'Confirm', exact: true }).click()
    expect((await planned).status()).toBe(200)
    await expect(future.getByText('Science', { exact: true }).first()).toBeVisible()
    const today = page.locator(`#class-${en}-today`)
    await today.getByRole('button', { name: 'Prepare Zoom meeting', exact: true }).click()
    await expect(today.getByRole('link', { name: 'Open Zoom', exact: true })).toBeVisible({
      timeout: 30000,
    })
    expect(
      await today.getByRole('link', { name: 'Open Zoom', exact: true }).getAttribute('href'),
    ).toMatch(/^https:\/\/zoom.us\/j\//)
    await page.goto('/tuition?history=1')
    await expect(page.locator('.tu-enrollment')).toHaveCount(1)
    await page.locator('.tu-enrollment').getByRole('link').click()
    await expect(page.locator('.tu-session')).toHaveCount(125)
    await expect(page.getByRole('tab', { name: 'Files', exact: true })).toHaveCount(0)
    const latest = page.locator(`#class-${archive}-124`)
    await latest.getByRole('button', { name: 'Update learning progress', exact: true }).click()
    await latest
      .getByLabel('Parent feedback', { exact: true })
      .fill('Tutor corrected the completed package progress after checking the lesson notes.')
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/classes/${archive}-124/action`) && r.request().method() === 'POST',
    )
    await latest.getByRole('button', { name: 'Save progress', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await page.goto('/availability')
    await expect(page.locator('.tutor-fees')).toContainText('24')
    await capture('staff-fees')
    await page.route('**/api/v1/tutor/workspace', (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Controlled test outage' },
      }),
    )
    await page.goto('/workspace')
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await page.unroute('**/api/v1/tutor/workspace')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByText('Next lesson', { exact: true })).toBeVisible()
    const other = await browser.newContext()
    try {
      const otherPage = await other.newPage()
      await otherPage.goto('/login')
      await otherPage.getByLabel('Email address', { exact: true }).fill('tutor-meera@example.test')
      await otherPage.getByLabel('Password', { exact: true }).fill(password)
      await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(otherPage).toHaveURL(/workspace/)
      expect(
        (await otherPage.request.get(`/api/v1/tutor/learners/${learner}/progress`)).status(),
      ).toBe(404)
    } finally {
      await other.close()
    }
    await db
      .collection('enrollments')
      .updateMany({ _id: { $in: [en, archive] } }, { $set: { tutorId: 'tutor-meera' } })
    expect((await page.request.get(`/api/v1/tutor/learners/${learner}/progress`)).status()).toBe(
      404,
    )
    expect((await page.request.get(`/api/v1/classes/${en}-today/meeting/join`)).status()).toBe(404)
    expect(errors).toEqual([])
  } finally {
    await mongo.close()
  }
})
