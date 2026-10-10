import { verifiedSignup } from './signup-fixture'
import { test, expect, type APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'

async function write(request: APIRequestContext, path: string, data: unknown) {
  const session = await (await request.get('/api/v1/auth/session')).json()
  const response = await request.post(`/api/v1${path}`, {
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

test('child progress spans tutors and packages, filters by learner and records tutor evidence', async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      email: `progress-${crypto.randomUUID()}@example.test`,
      password,
      name: 'Fictional progress family',
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const owner = (await (await page.request.get('/api/v1/auth/session')).json()).user.id
  const consent = await write(page.request, '/consents', { relationship: 'parent', accepted: true })
  const learner = await write(page.request, '/learners', {
    name: 'Fictional report learner',
    class: 8,
    board: 'CBSE',
    language: 'English',
    kind: 'minor',
    consentId: consent.id,
  })
  const younger = await write(page.request, '/learners', {
    name: 'Fictional primary learner',
    class: 5,
    board: 'CBSE',
    language: 'English',
    kind: 'minor',
    consentId: consent.id,
  })
  const empty = await write(page.request, '/learners', {
    name: 'Fictional new learner',
    class: 7,
    board: 'CBSE',
    language: 'English',
    kind: 'minor',
    consentId: consent.id,
  })
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(runtime.webOrigin).toBe(origin)
  let uri = process.env.MONGODB_URI
  if (!uri)
    uri = (await readFile('.env', 'utf8'))
      .match(/^MONGODB_URI=(.*)$/m)?.[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
  expect(uri).toBeTruthy()
  const database = new MongoClient(uri!)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const day = (offset: number) =>
    new Date(new Date(`${today}T10:00:00+05:30`).getTime() + offset * 86400000)
  const id = crypto.randomUUID()
  const enrollment = (
    suffix: string,
    tutorId: string,
    name: string,
    subject: string,
    count: number,
    status: string,
    child = learner,
  ) => ({
    _id: `${id}-${suffix}`,
    ownerId: owner,
    learnerId: child.id,
    learnerName: child.name,
    class: child.class,
    trialId: `${id}-trial`,
    tutorId,
    tutorName: name,
    mentorId: 'mentor-a',
    status,
    version: 1,
    planVersion: 0,
    createdAt: day(-10),
    paymentIntentId: '',
    agreement: {
      id: `${id}-${suffix}:1`,
      enrollmentId: `${id}-${suffix}`,
      version: 1,
      tutorId,
      subject,
      subjects: [subject],
      mode: 'online',
      timezone: 'Asia/Kolkata',
      sessionCount: count,
      minutes: 60,
      starts: [],
      feePerSessionPaise: 10000,
      packageFeePaise: 240000,
      totalPaise: 240000,
      currency: 'INR',
      cancellationHours: 12,
      terms: 'Fictional recorded-history fixture; no provider payment is claimed.',
      termsVersion: 'test',
      createdAt: day(-10),
    },
  })
  const current = enrollment(
    'current',
    'tutor-arjun',
    'Arjun · sample',
    'Mathematics',
    24,
    'active',
  )
  const previous = enrollment(
    'previous',
    'tutor-meera',
    'Meera · sample',
    'Science',
    6,
    'completed',
  )
  const primary = enrollment(
    'primary',
    'tutor-arjun',
    'Arjun · sample',
    'All Subjects',
    6,
    'active',
    younger,
  )
  const unpaid = enrollment(
    'unpaid',
    'tutor-arjun',
    'Arjun · sample',
    'Mathematics',
    6,
    'awaiting_payment',
  )
  const learning = (score: number, status: string, subject = 'Mathematics') => ({
    subject,
    topics: [
      {
        title: 'Equivalent fractions',
        status,
        evidence: 'Explained fraction models with number lines.',
        practice: 'Apply fractions to word problems.',
      },
    ],
    homeworkStatus: score === 12 ? 'needs_help' : 'completed',
    test: { title: `Fractions quiz ${score}`, score, maximum: 20 },
    feedback:
      score === 12
        ? 'Understands halves with support.'
        : 'Explains equivalent fractions independently.',
    nextSteps: 'Practise comparing thirds and sixths.',
    recordedAt: day(-1),
  })
  const session = (
    en: typeof current,
    number: number,
    offset: number,
    status: string,
    progress?: ReturnType<typeof learning>,
  ) => ({
    _id: `${en._id}-${number}`,
    enrollmentId: en._id,
    tutorId: en.tutorId,
    start: day(offset),
    end: new Date(day(offset).getTime() + 3600000),
    status,
    timezone: 'Asia/Kolkata',
    bufferMinutes: 0,
    version: 1,
    attendance: status === 'completed' ? 'present' : status === 'missed' ? 'absent' : '',
    notes: ['completed', 'missed'].includes(status)
      ? 'Recorded fraction lesson with worked examples.'
      : '',
    homework: status === 'completed' ? 'Practise fractions using number lines.' : '',
    review: '',
    reason: '',
    ...(progress ? { progress } : {}),
  })
  try {
    await database.connect()
    const db = database.db(runtime.databaseName)
    // Recorded-history fixtures only, confined to this exact isolated database.
    // Booking/payment activation is covered by separate real API tests.
    await db
      .collection<{ _id: string; [key: string]: unknown }>('enrollments')
      .insertMany([current, previous, primary, unpaid])
    await db
      .collection<{ _id: string; [key: string]: unknown }>('classes')
      .insertMany([
        ...Array.from({ length: 24 }, (_, i) =>
          session(
            current,
            i,
            i - 3,
            i < 2 ? 'completed' : i === 2 ? 'missed' : 'scheduled',
            i < 2 ? learning(i === 0 ? 12 : 18, i === 0 ? 'practising' : 'independent') : undefined,
          ),
        ),
        ...Array.from({ length: 6 }, (_, i) => session(previous, i, i - 20, 'completed')),
        session(primary, 0, -1, 'completed', learning(16, 'practising', 'Science')),
        session(unpaid, 0, 1, 'held'),
      ])
    await db.collection<{ _id: string; [key: string]: unknown }>('trials').insertOne({
      _id: `${id}-trial`,
      ownerId: owner,
      learnerId: learner.id,
      learnerName: learner.name,
      tutorId: 'tutor-meera',
      mentorId: 'mentor-a',
      subject: 'Science',
      subjects: ['Science'],
      class: 8,
      start: day(-40),
      end: new Date(day(-40).getTime() + 3600000),
      status: 'completed',
      notes: 'Trial identified a need to practise scientific explanations.',
      nextSteps: 'Practise describing observations clearly.',
      review: '',
      feePaise: 0,
      terms: 'Fictional trial history',
      termsVersion: 'test',
      createdAt: day(-42),
    })
    await db.collection<{ _id: string; [key: string]: unknown }>('learning_plans').insertOne({
      _id: `${previous._id}:1`,
      enrollmentId: previous._id,
      version: 1,
      startingPoint: 'Learner identifies simple scientific observations.',
      goals: 'Explain evidence clearly using scientific vocabulary.',
      topics: [
        {
          title: 'Observations',
          status: 'practising',
          evidence: 'Explains simple observations with prompts.',
          practice: 'Describe changes in a growing plant.',
        },
      ],
      nextSteps: 'Practise explaining cause and effect.',
      reviewDate: day(14),
      authorId: 'mentor-a',
      createdAt: day(-18),
    })
    await db.collection<{ _id: string; [key: string]: unknown }>('handovers').insertOne({
      _id: `${id}-handover`,
      enrollmentId: current._id,
      oldTutorId: 'tutor-meera',
      newTutorId: 'tutor-arjun',
      status: 'accepted',
      reason: 'Fictional family-approved tutor change.',
      nextSteps: 'Continue the saved learning record with the new tutor.',
      familyConsentAt: day(-5),
      createdAt: day(-5),
    })
  } finally {
    await database.close()
  }
  await mkdir('docs/visual-qa/learner-progress', { recursive: true })
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `docs/visual-qa/learner-progress/${name}.png`, fullPage: true })
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/workspace?view=learners&learner=${learner.id}`)
    await expect(page.getByRole('heading', { name: learner.name, exact: true })).toBeVisible()
    await expect(page.locator('.child-report-summary')).toContainText('89%')
    await expect(page.locator('.child-report-summary')).toContainText('1/2')
    await expect(page.getByText('2 of 24 classes completed', { exact: true })).toBeVisible()
    await expect(page.getByText('21 classes remaining', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Find a tutor', exact: true }),
    ).toHaveCount(0)
    await capture(`overview-${width}`)
    await page.getByRole('tab', { name: 'Overview', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Subjects', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.getByRole('tab', { name: 'Subjects', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Recorded test scores' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Fractions quiz 18' })).toContainText(
      '18/20',
    )
    await capture(`subjects-${width}`)
    await page.getByLabel('Subject', { exact: true }).selectOption('Science')
    await expect(page.getByText('No topic progress recorded yet', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Explain evidence clearly using scientific vocabulary.', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await page.getByRole('tab', { name: 'Class history', exact: true }).click()
    await expect(page.locator('.child-report-lesson')).toHaveCount(30)
    await capture(`history-${width}`)
    await page.getByRole('tab', { name: 'Feedback', exact: true }).click()
    await expect(
      page.getByText('Trial identified a need to practise scientific explanations.', {
        exact: true,
      }),
    ).toBeVisible()
    await capture(`feedback-${width}`)
    await page.getByLabel('Tutor', { exact: true }).selectOption('tutor-meera')
    await expect(page.locator('.child-report-lesson')).toHaveCount(6)
    await page.reload()
    await expect(page.getByLabel('Tutor', { exact: true })).toHaveValue('tutor-meera')
    await page.getByLabel('Learner', { exact: true }).selectOption(younger.id)
    await expect(page.getByLabel('Tutor', { exact: true })).toHaveValue('')
    await expect(page.getByText('No feedback recorded yet', { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Subjects', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'All Subjects', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Science', exact: true })).toBeVisible()
    await page.getByLabel('Learner', { exact: true }).selectOption(empty.id)
    await expect(page.getByText('No topic progress recorded yet', { exact: true })).toBeVisible()
    await capture(`empty-${width}`)
  }
  await page.goto(`/workspace?view=learners&learner=${learner.id}`)
  await page.getByLabel('Report period').selectOption('month')
  await expect(page.getByText('2 of 24 classes completed', { exact: true })).toBeVisible()
  await page.getByLabel('Report period').selectOption('custom')
  await page
    .getByLabel('From', { exact: true })
    .fill(day(-2).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  await page
    .getByLabel('To', { exact: true })
    .fill(day(-1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  await expect(page.locator('.child-report-summary')).toContainText('50%')
  await expect(page.getByText('2 of 24 classes completed', { exact: true })).toBeVisible()
  await page.getByLabel('From', { exact: true }).fill(today)
  await expect(page.getByRole('alert')).toContainText('Choose an end date')
  await page.getByRole('button', { name: 'Reset filters' }).click()
  const tutor = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 1000 },
  })
  try {
    const login = await tutor.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'tutor-arjun@example.test', password },
    })
    expect(login.status()).toBe(200)
    const av = await (await tutor.request.get('/api/v1/availability')).json()
    const availabilitySaved = await tutor.request.put('/api/v1/availability', {
      headers: {
        Origin: origin,
        'X-CSRF-Token': (await (await tutor.request.get('/api/v1/auth/session')).json()).csrf,
      },
      data: {
        version: av.version,
        timezone: 'Asia/Kolkata',
        windows: [{ day: 1, startMinute: 540, endMinute: 1020 }],
        leaveDates: [],
        dailyCapacity: 12,
        bufferMinutes: 0,
        paused: false,
      },
    })
    expect(availabilitySaved.status()).toBe(200)
    const tutorPage = await tutor.newPage()
    tutorPage.on('pageerror', (e) => errors.push(e.message))
    await tutorPage.goto(`/tuition/${current._id}`)
    // Completed classes already have progress; edit the first lesson's recorded marks.
    const first = tutorPage
      .locator('.tu-session')
      .filter({
        has: tutorPage.getByRole('button', { name: 'Update learning progress', exact: true }),
      })
      .first()
    await first.getByRole('button', { name: 'Update learning progress', exact: true }).click()
    await first.getByLabel('Marks obtained', { exact: true }).fill('21')
    await first.getByLabel('Homework status', { exact: true }).selectOption('completed')
    await first
      .getByLabel('Parent feedback', { exact: true })
      .fill('Tutor recorded improved fraction explanations after practice.')
    expect((await new AxeBuilder({ page: tutorPage }).analyze()).violations).toEqual([])
    await first.screenshot({ path: 'docs/visual-qa/learner-progress/tutor-progress-390.png' })
    await tutorPage.setViewportSize({ width: 1440, height: 1000 })
    await first.screenshot({ path: 'docs/visual-qa/learner-progress/tutor-progress-1440.png' })
    const rejected = tutorPage.waitForResponse(
      (r) =>
        r.url().endsWith(`/classes/${current._id}-0/action`) && r.request().method() === 'POST',
    )
    await first.getByRole('button', { name: 'Save progress', exact: true }).click()
    expect((await rejected).status()).toBe(422)
    await expect(first.getByRole('alert')).toContainText(
      'Test marks must be between zero and the maximum',
    )
    await first.getByLabel('Marks obtained', { exact: true }).fill('14')
    const saved = tutorPage.waitForResponse(
      (r) =>
        r.url().endsWith(`/classes/${current._id}-0/action`) && r.request().method() === 'POST',
    )
    await first.getByRole('button', { name: 'Save progress', exact: true }).click()
    expect((await saved).status()).toBe(200)
    const persisted = await (
      await page.request.get(`/api/v1/learners/${learner.id}/progress`)
    ).json()
    expect(
      persisted.sessions.find((s: { id: string }) => s.id === `${current._id}-0`).progress.test
        .score,
    ).toBe(14)
    await page.reload()
    await expect(page.locator('.child-report-summary')).toContainText('2/2')
    await page.getByRole('tab', { name: 'Feedback', exact: true }).click()
    await expect(
      page.getByText('Tutor recorded improved fraction explanations after practice.', {
        exact: true,
      }),
    ).toBeVisible()
    await tutorPage.goto(`/tuition/${current._id}`)
    const scheduled = tutorPage
      .locator('.tu-session')
      .filter({ has: tutorPage.getByRole('button', { name: 'Record lesson', exact: true }) })
      .first()
    await scheduled.getByRole('button', { name: 'Record lesson', exact: true }).click()
    await scheduled
      .getByLabel('Lesson notes', { exact: true })
      .fill('Recorded a new lesson using fraction word problems.')
    await scheduled
      .getByLabel('Practice for next time', { exact: true })
      .fill('Practise five fraction word problems.')
    await scheduled.getByLabel('Use the development timeline', { exact: false }).check()
    await scheduled.getByLabel('Topic', { exact: true }).fill('Word problems')
    await scheduled
      .getByLabel('Tutor observation', { exact: true })
      .fill('Solved one word problem independently.')
    await scheduled
      .getByLabel('Practice', { exact: true })
      .fill('Solve five fraction word problems.')
    await scheduled
      .getByLabel('Parent feedback', { exact: true })
      .fill('Connects fractions to everyday problems.')
    await scheduled
      .getByLabel('What to practise next', { exact: true })
      .fill('Practise choosing the right fraction operation.')
    const recorded = tutorPage.waitForResponse(
      (r) =>
        r.url().endsWith(`/classes/${current._id}-3/action`) && r.request().method() === 'POST',
    )
    await scheduled.getByRole('button', { name: 'Confirm', exact: true }).click()
    expect((await recorded).status()).toBe(200)
    await page.goto(`/workspace?view=learners&learner=${learner.id}`)
    await expect(page.getByText('3 of 24 classes completed', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Connects fractions to everyday problems.', { exact: true }).first(),
    ).toBeVisible()
  } finally {
    await tutor.close()
  }
  const reportUrl = `/api/v1/learners/${learner.id}/progress`
  await page.route(`**${reportUrl}`, (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'unavailable', message: 'Fixture service interruption' },
    }),
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await page.unroute(`**${reportUrl}`)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
