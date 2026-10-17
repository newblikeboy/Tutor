import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase, verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const phase = process.env.JOURNEY_CAPTURE === 'before' ? 'before' : 'after'
const folder = `docs/visual-qa/journey-design/${phase}`
async function capture(page: Page, name: string) {
  await mkdir(folder, { recursive: true })
  await expect(page.locator('.loading-state')).toHaveCount(0)
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${folder}/${name}-${width}.png`, fullPage: true })
    expect(page.frames()).toHaveLength(1)
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
  }
}
test('marketplace journeys keep real records, role boundaries and reachable actions', async ({
  page,
}) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500 && new URL(response.url()).pathname.startsWith('/api/'))
      errors.push(`API ${response.status()}: ${new URL(response.url()).pathname}`)
  })
  for (const [route, name] of [
    ['/', 'home'],
    ['/login', 'sign-in'],
    ['/support', 'support'],
    ['/tutors?searched=1&class=8&subject=Mathematics&mode=online&time=17%3A00', 'discovery'],
    ['/tutors/tutor-meera?class=8&subject=Mathematics&mode=online', 'profile'],
  ]) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await capture(page, name)
    if (name === 'home') {
      await expect(page.getByRole('link', { name: 'Explore online tutors' })).toBeVisible()
      await expect(page.getByText('AI-generated learning scene', { exact: true })).toBeVisible()
    }
    if (name === 'discovery') {
      await page.getByRole('button', { name: 'Remove Mathematics subject filter' }).click()
      await expect(page).toHaveURL(/class=8/)
      expect(new URL(page.url()).searchParams.has('subject')).toBe(false)
    }
  }
  const signed = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional journey family',
      email: `journeys-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      role: 'parent',
      adult: true,
    },
  })
  expect(signed.status()).toBe(201)
  const auth = await signed.json()
  const response = await page.request.post('/api/v1/learners', {
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: 'Fictional journey student',
      kind: 'adult_self',
      class: 8,
      board: 'CBSE',
      language: 'English',
    },
  })
  expect(response.status()).toBe(201)
  const learner = await response.json()
  const id = `journey-${crypto.randomUUID()}`
  const start = new Date(Date.now() + 4 * 86400000)
  const agreement = {
    _id: `${id}:1`,
    id: `${id}:1`,
    enrollmentId: id,
    version: 1,
    tutorId: 'tutor-meera',
    subject: 'Mathematics',
    subjects: ['Mathematics'],
    mode: 'online',
    timezone: 'Asia/Kolkata',
    sessionCount: 1,
    minutes: 60,
    starts: [start],
    feePerSessionPaise: 0,
    totalPaise: 0,
    currency: 'INR',
    cancellationHours: 12,
    terms: 'Fictional retained booking for layout verification',
    termsVersion: 'fixture',
    createdAt: new Date(),
  }
  const { client, database } = await signupDatabase()
  try {
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
      _id: `${id}-class` as never,
      enrollmentId: id,
      tutorId: 'tutor-meera',
      start,
      end: new Date(start.getTime() + 3600000),
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
    const pending = `${id}-pending`
    const retained = await database.collection('enrollments').findOne({ _id: id as never })
    expect(retained).not.toBeNull()
    const pendingAgreement = {
      ...agreement,
      _id: `${pending}:1`,
      id: `${pending}:1`,
      enrollmentId: pending,
    }
    await database.collection('enrollments').insertOne({
      ...retained!,
      _id: pending as never,
      status: 'pending_tutor_acceptance',
      agreement: pendingAgreement,
    })
    await database.collection('agreements').insertOne(pendingAgreement as never)
    await database
      .collection('enrollments')
      .insertOne({
        ...retained!,
        _id: `${id}-checkout` as never,
        status: 'awaiting_payment',
        holdUntil: new Date(Date.now() + 600000),
        paymentSimulated: false,
      })
    const reservedClass = await database
      .collection('classes')
      .findOne({ _id: `${id}-class` as never })
    await database
      .collection('classes')
      .insertOne({ ...reservedClass!, _id: `${pending}-class` as never, enrollmentId: pending })
  } finally {
    await client.close()
  }
  for (const [route, name] of [
    [`/workspace?learner=${learner.id}`, 'parent-home'],
    [`/match?learner=${learner.id}&searched=1&mode=online&subject=Mathematics`, 'parent-finder'],
    [`/tuition/${id}`, 'booking'],
    [`/tuition/${id}-pending`, 'pending-acceptance'],
    ['/support', 'parent-help'],
  ]) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await capture(page, name)
    if (name === 'parent-home') {
      await expect(
        page.getByRole('region', { name: 'Continue learning' }).locator('a[href$="-checkout"]'),
      ).toHaveCount(0)
      await expect(
        page
          .getByRole('region', { name: 'Unfinished checkouts' })
          .getByRole('link', { name: `Resume checkout for ${learner.name}` }),
      ).toBeVisible()
      await expect(page.getByRole('region', { name: 'Continue learning' })).toContainText(
        learner.name,
      )
    }
    if (name === 'parent-finder') {
      await page.getByRole('button', { name: 'Request a trial', exact: true }).first().click()
      await expect(page.getByRole('group', { name: 'Selected tutor', exact: true })).toBeFocused()
      await expect(page.getByRole('button', { name: 'Compare other tutors' })).toBeVisible()
      await capture(page, 'selected-tutor')
      await page.getByRole('button', { name: 'Compare other tutors' }).click()
      await expect(page.locator('.parent-tutor-search input')).toBeFocused()
      await expect(
        page.getByRole('button', { name: 'Request a trial', exact: true }).first(),
      ).toBeVisible()
    }
    if (name === 'booking') {
      await page.getByRole('link', { name: 'Open next class' }).click()
      await expect(page).toHaveURL(new RegExp(`class=${id}-class`))
    }
    if (name === 'pending-acceptance') {
      await expect(
        page.getByRole('navigation', { name: 'Booking progress' }).locator('[aria-current=step]'),
      ).toContainText('Tutor acceptance')
      await expect(page.getByRole('link', { name: 'Open next class' })).toHaveCount(0)
    }
    if (name === 'parent-help') {
      await expect(page.locator('.desk-shell[data-role=parent]')).toBeVisible()
    }
  }
  for (const [user, route, name] of [
    ['tutor-meera', '/workspace', 'tutor-home'],
    ['mentor-a', '/workspace?view=assessments', 'mentor-queue'],
    ['admin-a', '/workspace?view=applications', 'admin-queue'],
  ]) {
    const login = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: `${user}@example.test`, password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await capture(page, name)
    if (name === 'tutor-home') {
      await expect(
        page.getByRole('link', { name: `Review booking for ${learner.name}` }),
      ).toHaveAttribute('href', `/tuition/${id}-pending?tab=agreement`)
    }
    if (name === 'admin-queue') {
      expect((await page.request.get(`/api/v1/enrollments/${id}/messages`)).status()).toBe(403)
      await page
        .getByRole('searchbox', { name: 'Search applicants' })
        .fill('fictional-no-matching-applicant')
      await expect(
        page.getByRole('heading', { name: 'No applications in this queue' }),
      ).toBeVisible()
      await capture(page, 'admin-filter-empty')
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
      await expect(page.getByRole('searchbox', { name: 'Search applicants' })).toHaveValue('')
      await expect(page).toHaveURL(/view=applications/)
    }
  }
  expect(errors).toEqual([])
})
