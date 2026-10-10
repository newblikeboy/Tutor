import { verifiedSignup } from './signup-fixture'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import type { Dashboard } from '../../apps/web/src/lib/api'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
async function family(page: Page) {
  const response = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      email: `learner-${crypto.randomUUID()}@example.test`,
      password,
      name: 'Fictional family',
      role: 'parent',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  return { Origin: origin, 'X-CSRF-Token': (await response.json()).csrf as string }
}
async function dashboard(page: Page): Promise<Dashboard> {
  const response = await page.request.get('/api/v1/dashboard')
  expect(response.status()).toBe(200)
  return response.json()
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/learner-profile', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `docs/visual-qa/learner-profile/${name}.png`, fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}
async function consent(page: Page) {
  await page.getByLabel('I am the parent or legal guardian').check()
  await page.getByLabel('I agree to the draft privacy notice').check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('First name or nickname')).toBeVisible()
}
async function profile(page: Page, name: string, klass = '8') {
  await page.getByLabel('First name or nickname', { exact: true }).fill(name)
  await page.getByLabel('Class', { exact: true }).selectOption(klass)
  await page.getByLabel('Board', { exact: true }).selectOption('CBSE')
  await page.getByLabel('Teaching language', { exact: true }).selectOption('English')
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
}

test('parent login, draft recovery, lost save response retry and profile editing', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('/login?role=parent&return=%2Fworkspace%3Fview%3Dlearners')
  await page.getByLabel('Email address', { exact: true }).fill('parent-a@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/workspace?view=learners')
  await page.getByRole('link', { name: 'Add learner', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await consent(page)
  await expect(page.getByLabel('Class', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Board', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Teaching language', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Save learner profile' }).click()
  await expect(page.getByLabel('First name or nickname')).toBeFocused()
  await profile(page, 'Fictional retry learner', '1')
  await capture(page, 'profile-desktop')
  await page.reload()
  await expect(page.getByLabel('First name or nickname')).toHaveValue('Fictional retry learner')
  await expect(page.getByLabel('Class', { exact: true })).toHaveValue('1')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'profile-mobile')
  let dropped = false
  await page.route('**/api/v1/learners', async (route) => {
    if (!dropped && route.request().method() === 'POST') {
      dropped = true
      expect((await route.fetch()).status()).toBe(201)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save learner profile' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect((await dashboard(page)).learners).toHaveLength(1)
  await expect(page.getByLabel('First name or nickname')).toBeDisabled()
  await page.getByRole('button', { name: 'Save learner profile' }).click()
  await expect(page).toHaveURL(/view=learners&learner=/)
  const data = await dashboard(page)
  expect(data.learners).toHaveLength(1)
  expect(data.requirements).toHaveLength(0)
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
  await page.getByLabel('First name or nickname').fill('Fictional corrected learner')
  await page.getByLabel('Class', { exact: true }).selectOption('12')
  await capture(page, 'edit-mobile')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/view=learners&learner=/)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Fictional corrected learner', exact: true }),
  ).toBeVisible()
  expect((await dashboard(page)).learners[0].class).toBe(12)
  await capture(page, 'saved-profile-mobile')
  await page.getByRole('link', { name: 'Add learner', exact: true }).click()
  await expect(page.getByLabel('Choose a saved learner')).toHaveCount(0)
  await expect(page.getByLabel('I am the parent or legal guardian')).not.toBeChecked()
})

test('adult profile keeps matching draft separate and recovers a lost draft response', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const headers = await family(page)
  const response = await page.request.post('/api/v1/learners', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: 'Existing fictional adult',
      class: 8,
      board: 'CBSE',
      language: 'English',
      kind: 'adult_self',
      consentId: '',
    },
  })
  expect(response.status()).toBe(201)
  const learner = await response.json()
  expect(
    (
      await page.request.put('/api/v1/draft', {
        headers,
        data: {
          step: 2,
          learnerId: learner.id,
          goal: 'Retained matching draft',
          locality: 'Purnea',
        },
      })
    ).ok(),
  ).toBe(true)
  await page.goto('/match?new=1&profile=1')
  await expect(page.getByLabel('Choose a saved learner')).toHaveCount(0)
  await page.getByLabel('Myself, aged 18 or over').check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Learner profile', exact: true })).toBeVisible()
  let dropped = false
  await page.route('**/api/v1/learner-draft', async (route) => {
    if (!dropped && route.request().method() === 'PUT') {
      dropped = true
      expect((await route.fetch()).status()).toBe(200)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByLabel('First name or nickname').fill('काल्पनिक वयस्क विद्यार्थी')
  await expect(page.getByRole('button', { name: 'Retry saving draft' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry saving draft' }).click()
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
  await profile(page, 'काल्पनिक वयस्क विद्यार्थी', '12')
  await page.reload()
  await expect(page.getByLabel('First name or nickname')).toHaveValue('काल्पनिक वयस्क विद्यार्थी')
  await page.getByRole('button', { name: 'Save learner profile' }).click()
  await expect(page).toHaveURL(/view=learners&learner=/)
  const data = await dashboard(page)
  expect(data.learners).toHaveLength(2)
  expect(data.draft?.goal).toBe('Retained matching draft')
  expect(data.learners.every((item) => item.kind === 'adult_self')).toBe(true)
  await page.goto(`/workspace?view=learners&learner=${learner.id}`)
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByLabel('First name or nickname')).toHaveValue(learner.name)
})

test('guardian setup failure explains the gate before collecting learner details', async ({
  page,
}) => {
  await family(page)
  await page.route('**/api/v1/consents', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'guardian_unconfigured',
        message: 'Guardian verification is not enabled.',
      }),
    }),
  )
  await page.goto('/match?new=1&profile=1')
  await page.getByLabel('I am the parent or legal guardian').check()
  await page.getByLabel('I agree to the draft privacy notice').check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Guardian verification must be enabled')
  await expect(page.getByLabel('First name or nickname')).toHaveCount(0)
})
