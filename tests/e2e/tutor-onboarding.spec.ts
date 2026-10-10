import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('an unapproved tutor can continue their application without teaching access', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `tutor-onboarding-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      name: 'Fictional pending tutor',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  await page.goto('/workspace')
  await expect(page).toHaveURL(/\/apply/)
  await expect(page.getByRole('heading', { name: 'Tutor application', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue(
    'Fictional pending tutor',
  )
  await expect(page.getByRole('link', { name: 'My learners', exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/v1/tutor/workspace')).status()).toBe(403)
  await mkdir('docs/visual-qa/tutor-workspace', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({
      path: `docs/visual-qa/tutor-workspace/onboarding-${width}.png`,
      fullPage: true,
    })
  }
  expect(errors).toEqual([])
})
