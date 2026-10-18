import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/parent-consent', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({
      path: `docs/visual-qa/parent-consent/${name}-${width}.png`,
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('parents declare relationship and privacy consent without an admin approval step', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: baseURL! },
    data: { email: 'parent-a@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(login.status()).toBe(200)
  const dashboard = await (await page.request.get('/api/v1/dashboard')).json()
  const existing = dashboard.learners.find(
    (l: { kind: string; id: string }) => l.kind === 'minor' && l.id !== 'consent-missing-minor',
  )
  expect(existing).toBeTruthy()
  const library = await page.request.get(`/api/v1/study?learner=${existing.id}`)
  expect(library.status()).toBe(200)
  expect((await library.json()).active).toBe(false)
  await page.goto('/match?profile=1&new=1')
  await expect(page.getByRole('link', { name: 'Guardian verification', exact: true })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('button', { name: 'Request guardian review', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Your relationship', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await capture(page, 'relationship-consent')
  await page.getByRole('checkbox').nth(0).focus()
  await page.keyboard.press('Space')
  await page.getByRole('checkbox').nth(1).check()
  const savedConsent = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/consents') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const response = await savedConsent
  expect(response.status()).toBe(201)
  const consent = await response.json()
  expect(consent.verification).toBe('parent_declaration_only')
  expect(consent.version).toBe('parent-consent-v1')
  await page
    .getByLabel('First name or nickname', { exact: true })
    .fill('Fictional declaration student')
  await page.getByLabel('Class', { exact: true }).selectOption('8')
  await page.getByLabel('Board', { exact: true }).selectOption('CBSE')
  await page.getByLabel('Teaching language', { exact: true }).selectOption('English')
  await capture(page, 'student-details')
  await page.getByRole('button', { name: 'Save learner profile', exact: true }).click()
  await expect(page).toHaveURL(/view=learners/)
  const saved = await (await page.request.get('/api/v1/dashboard')).json()
  const student = saved.learners.find(
    (l: { name: string }) => l.name === 'Fictional declaration student',
  )
  expect(student).toBeTruthy()
  const own = await page.request.get(`/api/v1/study?learner=${student.id}`)
  expect(own.status()).toBe(200)
  const data = await own.json()
  expect(data.active).toBe(false)
  expect(data.materials.items).toEqual([])
  await page.goto(`/study?learner=${student.id}`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Papers, quizzes & notes', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Request guardian review', exact: true }),
  ).toHaveCount(0)
  await capture(page, 'unpaid-study-plan')
  // The isolated production fixture also retains a fictional profile with no consent.
  const missing = dashboard.learners.find((l: { id: string }) => l.id === 'consent-missing-minor')
  if (missing) {
    await page.goto(`/study?learner=${missing.id}`)
    await page.getByRole('link', { name: 'Confirm parent consent', exact: true }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(2)
    await page.getByRole('checkbox').nth(0).check()
    await page.getByRole('checkbox').nth(1).check()
    await capture(page, 'existing-student-consent')
    await page.getByRole('button', { name: 'Confirm parent consent', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/study\\?learner=${missing.id}$`))
    expect((await page.request.get(`/api/v1/study?learner=${missing.id}`)).status()).toBe(200)
  }
  expect(errors).toEqual([])
})
