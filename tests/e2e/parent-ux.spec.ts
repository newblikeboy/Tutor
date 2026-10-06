import { test, expect, request, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import type { Dashboard } from '../../apps/web/src/lib/api'

const password = 'E2E-only learning passphrase 426!'
const origin = 'http://127.0.0.1:5174'
async function prepareTrialTutor() {
  // Other scheduling scenarios change this fixture's hours. Set this test's
  // preconditions through Go so its trial time does not depend on suite order.
  const tutor = await request.newContext({ baseURL: origin })
  try {
    const login = await tutor.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'tutor-arjun@example.test', password },
    })
    expect(login.status()).toBe(200)
    const auth = await login.json()
    const availability = await (await tutor.get('/api/v1/availability')).json()
    const saved = await tutor.put('/api/v1/availability', {
      headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
      data: {
        ...availability,
        feePaise: 0,
        feePlan: null,
        feeVersion: 0,
        windows: Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 0, endMinute: 1440 })),
        leaveDates: [],
        bufferMinutes: 0,
        dailyCapacity: 12,
        paused: false,
      },
    })
    expect(saved.status()).toBe(200)
  } finally {
    await tutor.dispose()
  }
}
async function family(page: Page) {
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email: `parent-ux-${crypto.randomUUID()}@example.test`,
      password,
      name: 'Fictional family',
      role: 'parent',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  return { Origin: origin, 'X-CSRF-Token': auth.csrf as string }
}
async function dashboard(page: Page): Promise<Dashboard> {
  const response = await page.request.get('/api/v1/dashboard')
  expect(response.status()).toBe(200)
  return response.json()
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/english-only/parent-ux', { recursive: true })
  if (!(await page.getByRole('dialog').count()))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `docs/visual-qa/english-only/parent-ux/${name}.png`,
    fullPage: true,
  })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}
test('parent sees lesson feedback only after mentor review and can continue to regular classes', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  await prepareTrialTutor()
  const headers = await family(page)
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/v1${path}`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data,
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const consent = await post('/consents', { relationship: 'parent', accepted: true })
  const learner = await post('/learners', {
    name: `Fictional feedback learner ${Date.now()}`,
    class: 8,
    board: 'CBSE',
    language: 'Hindi',
    kind: 'minor',
    consentId: consent.id,
  })
  const requirement = await post('/requirements', {
    learnerId: learner.id,
    goal: 'Understand equivalent fractions.',
    locality: 'Purnea',
  })
  const trial = await post('/trials', {
    requirementId: requirement.id,
    tutorId: 'tutor-arjun',
    start: new Date(Date.now() + 5 * 86400000).toISOString(),
    termsAccepted: true,
  })
  const context = await browser.newContext({ baseURL: origin })
  try {
    const teacher = await context.newPage()
    expect(
      (
        await teacher.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: 'tutor-arjun@example.test', password },
        })
      ).ok(),
    ).toBe(true)
    await teacher.goto('/workspace?view=sessions&queue=requested')
    const record = teacher.getByRole('article').filter({ hasText: learner.name })
    await record.getByRole('button', { name: 'Accept & confirm time' }).click()
    await expect
      .poll(async () => (await dashboard(page)).trials.find((item) => item.id === trial.id)?.status)
      .toBe('confirmed')
    await teacher.goto('/workspace?view=sessions&queue=confirmed')
    await record
      .getByLabel('What did the learner work through?')
      .fill('Compared equivalent fractions with a number line.')
    await record
      .getByLabel('Practice and next teaching steps')
      .fill('Practise three pairs of equivalent fractions.')
    await record.getByRole('button', { name: 'Record lesson evidence' }).click()
    await expect
      .poll(async () => (await dashboard(page)).trials.find((item) => item.id === trial.id)?.status)
      .toBe('completed')
    await page.goto(`/workspace?view=sessions&learner=${learner.id}&tab=completed`)
    await expect(page.getByText('Feedback pending', { exact: true })).toBeVisible()
    await expect(page.getByText('Compared equivalent fractions with a number line.')).toHaveCount(0)
    expect(
      (
        await teacher.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: 'mentor-a@example.test', password },
        })
      ).ok(),
    ).toBe(true)
    await teacher.goto('/workspace?view=reviews')
    const review = teacher.getByRole('article').filter({ hasText: learner.name })
    await review
      .getByLabel('Academic review and evidence')
      .fill('The lesson evidence shows a clear understanding of equivalent fractions.')
    await review.getByRole('button', { name: 'Share reviewed progress with family' }).click()
    await expect
      .poll(async () => (await dashboard(page)).trials.find((item) => item.id === trial.id)?.status)
      .toBe('reviewed')
    await page.reload()
    await expect(page.getByText('Feedback ready', { exact: true })).toBeVisible()
    await expect(page.getByText('Compared equivalent fractions with a number line.')).toBeVisible()
    await capture(page, 'reviewed-feedback-en-desktop')
    await page.getByRole('main').getByRole('link', { name: 'Book tutor', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Regular classes', exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
