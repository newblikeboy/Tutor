import { connectGoogle } from './helpers/google'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { applicationProfile } from './helpers/application'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'

test('tutor daily teaching, scoped reports, planning, feedback, archives and Google Meet', async ({
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
      trialStudent = `${id}-trial-student`,
      en = `${id}-current`,
      archive = `${id}-archive`
    const now = new Date(),
      soon = new Date(now.getTime() + 5 * 60000),
      tomorrow = new Date(now.getTime() + 86400000)
    const savedLocation = (latitude: number, name: string) => ({
      address: `${name}, fictional address`,
      locality: name,
      city: 'Purnea',
      district: 'Purnea',
      state: 'Bihar',
      country: 'India',
      postalCode: '854301',
      latitude,
      longitude: 87.45,
      accuracyMeters: 20,
      source: 'browser',
    })
    const tutorProfile = applicationProfile('Arjun sample')
    tutorProfile.about.location = savedLocation(25.75, 'Original teaching base')
    await db.collection('preferences').updateOne(
      { _id: 'parent-a' },
      {
        $set: { language: 'en', version: 0, location: savedLocation(25.76, 'Student household') },
      },
      { upsert: true },
    )
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
          profile: tutorProfile,
          'scope.subjects': ['Mathematics', 'Science'],
          'scope.minClass': 6,
          'scope.maxClass': 10,
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
    await db.collection('learners').insertOne({
      _id: trialStudent,
      ownerId: 'parent-b',
      name: 'Trial student sample',
      class: 7,
      board: 'CBSE',
      language: 'English',
      kind: 'adult_self',
      version: 1,
    })
    await db.collection('trials').insertOne({
      _id: `${id}-requested`,
      ownerId: 'parent-b',
      learnerId: trialStudent,
      tutorId: 'tutor-arjun',
      mentorId: 'mentor-a',
      learnerName: 'Trial student sample',
      subject: 'Mathematics',
      subjects: ['Mathematics'],
      class: 7,
      mode: 'online',
      start: tomorrow,
      end: new Date(tomorrow.getTime() + 3600000),
      status: 'requested',
      notes: '',
      nextSteps: '',
      review: '',
      version: 1,
      feePaise: 0,
      termsVersion: 'test',
      terms: 'Fictional requested trial fixture',
      createdAt: now,
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
      if ((p.viewportSize()?.width ?? 0) <= 760) {
        for (const strip of await p.locator('.workspace-tabs-scrollable:visible').all()) {
          const rows = await strip
            .getByRole('tab')
            .evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)))
          expect(new Set(rows).size).toBe(1)
          await expect
            .poll(async () => {
              const bar = await strip.boundingBox()
              const tab = await strip.locator('[aria-selected="true"]').boundingBox()
              return !!bar && !!tab && tab.x >= bar.x && tab.x + tab.width <= bar.x + bar.width
            })
            .toBe(true)
        }
      }
      const accessibility = new AxeBuilder({ page: p })
      if (name.includes('history')) {
        // Inspect the repeated history component once; retain the full 127-record assertion.
        accessibility.exclude('.child-report-lesson ~ .child-report-lesson')
      }
      expect((await accessibility.analyze()).violations).toEqual([])
      expect(
        await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1)
      const directory = name.startsWith('google-')
        ? 'docs/visual-qa/google-lessons'
        : 'docs/visual-qa/tutor-workspace'
      await mkdir(directory, { recursive: true })
      await p.screenshot({
        path: `${directory}/${name}.png`,
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
    ).toHaveCount(0)
    await capture('home')
    await page.goto('/workspace?view=sessions&queue=completed')
    await expect(
      page.getByRole('table', { name: 'Tutor trial classes', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
    await expect(
      page.getByRole('columnheader', { name: 'Feedback status', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Distance', exact: true })).toHaveCount(0)
    await capture('trial-table')
    await page.getByRole('link', { name: /Tutor workflow learner View trial/ }).click()
    await expect(page).toHaveURL(new RegExp(`queue=completed&trial=${id}-completed`))
    await expect(page.getByText('Completed', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Trial feedback', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Feedback', exact: true })).toHaveCount(0)
    await expect(
      page.getByText('Tutor recommends practice with everyday fractions.', { exact: true }),
    ).toHaveCount(0)
    await capture('trial-completed')
    await page.getByRole('link', { name: 'Back to Trial classes', exact: true }).click()
    await expect(page).toHaveURL('/workspace?view=sessions&queue=completed')
    await page.goto('/workspace?view=sessions&queue=requested')
    await page.getByRole('link', { name: /Trial student sample View trial/ }).click()
    await expect(
      page.getByRole('button', { name: 'Accept & confirm time', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel trial', exact: true })).toBeVisible()
    await capture('trial-request-detail')
    await page.goto('/workspace?view=sessions&queue=requested&trial=unassigned-trial')
    await expect(page.getByText('This trial is not available.', { exact: true })).toBeVisible()
    await expect(page.locator('.record-card')).toHaveCount(0)
    await page.goto('/workspace?view=learners')
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
    const studentRow = page.getByRole('row').filter({ hasText: 'Tutor workflow learner' })
    await expect(studentRow).toContainText('Class 8')
    await expect(studentRow).toContainText('Mathematics, Science')
    await expect(studentRow).toContainText('Active')
    await expect(studentRow).toContainText('1.1 km')
    await expect(page.getByRole('row').filter({ hasText: 'Trial student sample' })).toContainText(
      'Student location not set',
    )
    await expect(page.locator('.child-report')).toHaveCount(0)
    await capture('student-table')
    await page.context().grantPermissions(['geolocation'], { origin })
    await page.context().setGeolocation({ latitude: 25.7, longitude: 87.45 })
    await page.route('**/api/v1/location/reverse?**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          ...savedLocation(25.7, 'New teaching base'),
          location: 'New teaching base, Purnea',
          primary: 'New teaching base',
          secondary: 'Purnea',
        },
      }),
    )
    await page.getByRole('button', { name: 'Your teaching location', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Tutor location', exact: true })).toBeVisible()
    await capture('tutor-location-dialog')
    const updatedLocation = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/account') && response.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: 'Update to my current location', exact: true }).click()
    expect((await updatedLocation).status()).toBe(200)
    await expect(
      page.getByText('Tutor location saved. Student distances are updated.', { exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(studentRow).toContainText('6.7 km')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(studentRow).toContainText('6.7 km')
    const storedAccount = await (await page.request.get('/api/v1/account')).json()
    expect(storedAccount.preferences.location.latitude).toBe(25.7)
    const storedApplication = await db.collection('applications').findOne({ _id: 'tutor-arjun' })
    expect(storedApplication!.profile.about.location.latitude).toBe(25.75)
    expect(storedApplication!.teachingLocation.latitude).toBe(25.7)
    await capture('student-distances-updated')
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .locator('.student-table-scroll')
      .evaluate((element) => (element.scrollLeft = element.scrollWidth))
    await inspect(page, 'student-distance-mobile-scrolled')
    await page.locator('.student-table-scroll').evaluate((element) => (element.scrollLeft = 0))
    await page.unroute('**/api/v1/location/reverse?**')
    await page.getByRole('link', { name: /Trial student sample View student/ }).click()
    await expect(page).toHaveURL(new RegExp(`learner=${trialStudent}`))
    await expect(page.getByRole('heading', { name: 'No regular-class progress yet' })).toBeVisible()
    await expect(page.locator('.child-report')).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to My students', exact: true }).click()
    await studentRow.getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`learner=${learner}`))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Student progress report', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Teaching brief', exact: true })).toBeVisible()
    await expect(page.getByText('Class 8 · CBSE · Teaching language: English')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit profile', exact: true })).toHaveCount(0)
    await capture('learner-overview')
    await page.getByRole('tab', { name: 'Class history', exact: true }).click()
    await expect(page.locator('#child-report-panel-history .child-report-lesson')).toHaveCount(127)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`learner=${learner}.*reportTab=history`))
    await expect(page.locator('#child-report-panel-history .child-report-lesson')).toHaveCount(127)
    await capture('learner-history')
    await page.goto('/workspace?view=learners&learner=unassigned-student')
    await expect(
      page.getByText('This student is no longer in your current assignments.', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('.child-report')).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to My students', exact: true }).click()
    await expect(page).toHaveURL('/workspace?view=learners')
    await expect(page.getByRole('table')).toBeVisible()
    await page.goto('/tuition')
    await expect(
      page.getByRole('table', { name: 'Current regular class bookings', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
    await capture('regular-booking-table')
    await page.getByRole('link', { name: /Tutor workflow learner View booking/ }).click()
    await expect(
      page.getByRole('table', { name: 'Classes in this booking', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
    for (const label of ['Learning plan', 'Messages', 'Files', 'Schedule & fees', 'Change tutor']) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible()
    }
    await capture('regular-class-table')
    await page.locator(`a[href*="class=${en}-future"]`).click()
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
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.tu-session')).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: 'Record attendance or detailed progress', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Propose a new time', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel this class', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Back to class list', exact: true }).click()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(2)
    await page.goto(`/tuition/${en}?class=unassigned-class`)
    await expect(
      page.getByText('This class is not available in this booking.', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('.tu-session')).toHaveCount(0)
    await page.goto('/workspace?view=home')
    await capture('google-disconnected')
    await connectGoogle(page, 'tutor')
    await capture('google-connected')
    await page.goto(`/tuition/${en}?class=${en}-today`)
    const today = page.locator(`#class-${en}-today`)
    await today.getByRole('button', { name: 'Prepare Google Meet', exact: true }).click()
    await expect(today.getByRole('link', { name: 'Open Google Meet', exact: true })).toBeVisible({
      timeout: 30000,
    })
    expect(
      await today.getByRole('link', { name: 'Open Google Meet', exact: true }).getAttribute('href'),
    ).toMatch(/^https:\/\/meet\.google\.com\//)
    await capture('google-lesson-ready')
    await page.goto('/tuition?history=1')
    await expect(
      page.getByRole('table', { name: 'Past regular class bookings', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(1)
    await capture('regular-history-table')
    await page.getByRole('link', { name: /Tutor workflow learner View booking/ }).click()
    await expect(page.locator('.student-table tbody tr')).toHaveCount(125)
    await expect(page.getByRole('tab', { name: 'Files', exact: true })).toHaveCount(0)
    await page.locator(`a[href*="class=${archive}-124"]`).click()
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
    await page.locator('.tu-back').click()
    await expect(page).toHaveURL('/tuition?history=1')
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
