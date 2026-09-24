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
  await mkdir('docs/visual-qa/parent-ux', { recursive: true })
  if (!(await page.getByRole('dialog').count()))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `docs/visual-qa/parent-ux/${name}.png`, fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}
async function consent(page: Page) {
  await page.getByLabel('I am the parent or legal guardian').check()
  await page.getByLabel('I agree to the draft privacy notice').check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}
async function details(page: Page, name: string, goal: string) {
  await page.getByLabel('First name or nickname', { exact: true }).fill(name)
  await page.getByLabel('What would you like help with?', { exact: true }).fill(goal)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check details', exact: true })).toBeVisible()
}

test('parent setup resumes without duplicate learners, requests or trials; cancelled trials leave upcoming', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await prepareTrialTutor()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await family(page)
  await page.goto('/workspace')
  await expect(page.getByRole('heading', { name: 'Who needs a tutor?' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add learner', exact: true })).toHaveCount(1)
  await expect(page.locator('.desk-preview')).toHaveCount(0)
  await expect(
    page.locator('.desk-sidebar').getByRole('link', { name: 'Learning progress', exact: true }),
  ).toHaveCount(0)
  await capture(page, 'welcome-en-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.language-button').click()
  await capture(page, 'welcome-hi-mobile')
  await page.getByRole('button', { name: 'मेन्यू खोलें' }).click()
  await capture(page, 'navigation-hi-mobile')
  await page.keyboard.press('Escape')
  await page.locator('.language-button').click()
  await page.getByRole('link', { name: 'Add learner', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('First name or nickname')).toHaveCount(0)
  await consent(page)
  await page.getByLabel('First name or nickname').fill('Aarohi · fictional learner')
  await page.getByLabel('What would you like help with?').fill('short')
  await page.getByLabel('City / locality (no exact address)').fill('')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Enter at least 10 characters.')).toBeVisible()
  await expect(page.getByLabel('City / locality (no exact address)')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByLabel('City / locality (no exact address)').fill('Purnea')
  await details(page, 'Aarohi · fictional learner', 'Understand fractions using a number line.')
  await expect(page).toHaveURL(/learner=/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Check details', exact: true })).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByLabel('What would you like help with?')).toHaveValue(
    'Understand fractions using a number line.',
  )
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await capture(page, 'check-details-en-mobile')
  await page.getByRole('button', { name: 'Choose a tutor', exact: true }).click()
  await expect(page.getByLabel('Select a tutor')).toBeVisible()
  await expect(page).toHaveURL(/requirement=/)
  const savedURL = page.url()
  await page.reload()
  await expect(page.getByLabel('Select a tutor')).toBeVisible()
  let data = await dashboard(page)
  expect(data.learners).toHaveLength(1)
  expect(data.requirements).toHaveLength(1)
  await page.getByLabel('Select a tutor').selectOption('tutor-arjun')
  await page
    .getByLabel('Preferred date & time')
    .fill(new Date(Date.now() + 3 * 86400000 + 19800000).toISOString().slice(0, 16))
  await page.getByLabel('I accept the development trial terms.').check()
  await page.getByRole('button', { name: 'Request a trial', exact: true }).click()
  await expect(page.getByText('Waiting for tutor', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Waiting for tutor', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Select a tutor')).toHaveCount(0)
  data = await dashboard(page)
  expect(data.trials).toHaveLength(1)
  await page.goto(`/workspace?learner=${data.learners[0].id}`)
  await capture(page, 'next-trial-en-mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capture(page, 'next-trial-en-desktop')
  await page.getByRole('link', { name: 'View all trials (1)', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel trial', exact: true }).click()
  await expect(page.getByText('No upcoming trials', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Cancelled (1)', exact: true }).click()
  await expect(page.locator('[role="tabpanel"]:visible .record-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Cancelled (1)', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await capture(page, 'trial-tabs-en-desktop')
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Upcoming (0)', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.goto(savedURL)
  await expect(page.getByLabel('Select a tutor')).toBeVisible()
  expect((await dashboard(page)).requirements).toHaveLength(1)
  await page.goto('/workspace')
  await expect(page.locator('.parent-next-trial')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('selected learner takes priority over another draft; add learner starts fresh; adult flow persists in Hindi', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const headers = await family(page)
  const children: string[] = []
  const consentResponse = await page.request.post('/api/v1/consents', {
    headers,
    data: { relationship: 'parent', accepted: true },
  })
  expect(consentResponse.status()).toBe(201)
  const consentId = (await consentResponse.json()).id
  for (const name of [
    'Fictional first learner',
    'Fictional second learner with a long display name',
  ]) {
    const response = await page.request.post('/api/v1/learners', {
      headers,
      data: { name, class: 8, board: 'CBSE', language: 'Hindi', kind: 'minor', consentId },
    })
    expect(response.status()).toBe(201)
    children.push((await response.json()).id)
  }
  expect(
    (
      await page.request.put('/api/v1/draft', {
        headers,
        data: {
          step: 3,
          learnerId: children[0],
          goal: 'This draft belongs to the first learner.',
          locality: 'Purnea',
        },
      })
    ).ok(),
  ).toBe(true)
  await page.goto(`/workspace?view=learners&learner=${children[1]}`)
  await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(children[1])
  await page.getByRole('link', { name: 'Add learning needs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Learning needs', exact: true })).toBeVisible()
  await expect(page.getByLabel('What would you like help with?')).toHaveValue('')
  await page
    .getByLabel('What would you like help with?')
    .fill('Practise ratios for the second learner.')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Choose a tutor', exact: true }).click()
  await expect(page.getByLabel('Select a tutor')).toBeVisible()
  let data = await dashboard(page)
  expect(data.requirements[0].learnerId).toBe(children[1])
  await page.goto(`/workspace?view=learners&learner=${children[1]}`)
  await page.reload()
  await capture(page, 'learners-en-desktop')
  await expect(page.locator('.parent-request')).toHaveCount(1)
  await page.getByRole('link', { name: 'Add learner', exact: true }).click()
  await expect(page.getByLabel('Choose a saved learner')).toHaveValue('')
  await consent(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Who is learning?', exact: true })).toBeVisible()
  await expect(page.getByLabel('I am the parent or legal guardian')).not.toBeChecked()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.language-button').click()
  await page.getByLabel('मेरे लिए, मेरी उम्र 18 वर्ष या अधिक है').check()
  await page.getByRole('button', { name: 'आगे बढ़ें', exact: true }).click()
  await page.getByLabel('पहला नाम या घर का नाम', { exact: true }).fill('काल्पनिक वयस्क विद्यार्थी')
  await page
    .getByLabel('किस चीज़ में मदद चाहिए?')
    .fill('भिन्न और अनुपात को रोज़मर्रा के उदाहरणों से समझना।')
  await capture(page, 'learning-needs-hi-mobile')
  await page.getByRole('button', { name: 'आगे बढ़ें', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'जानकारी जाँचें', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'ट्यूटर चुनें', exact: true }).click()
  await expect(page.getByLabel('ट्यूटर चुनें', { exact: true })).toBeVisible()
  data = await dashboard(page)
  expect(data.learners).toHaveLength(3)
  expect(data.learners.filter((item) => item.kind === 'adult_self')).toHaveLength(1)
  expect(data.requirements).toHaveLength(2)
  await page.goto(`/workspace?view=progress&learner=${children[1]}`)
  await expect(page.getByRole('tab', { name: 'फीडबैक (0)', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('button', { name: 'मेन्यू खोलें' }).click()
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'ट्रायल कक्षाएँ', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
  await capture(page, 'feedback-hi-mobile')
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  await capture(page, 'parent-200-percent')
})

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
    await record.getByRole('button', { name: 'Record development lesson' }).click()
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
    await page.getByRole('main').getByRole('link', { name: 'Regular classes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Regular classes', exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
