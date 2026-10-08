import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const routes = [
  { role: '', path: '/', ready: '#home-title', name: 'home' },
  { role: '', path: '/tutors?searched=1', ready: '.search-cards', name: 'search' },
  { role: '', path: '/tutors/tutor-meera', ready: '#teacher-profile-title', name: 'profile' },
  { role: '', path: '/login', ready: 'input[type=email]', name: 'login' },
  { role: '', path: '/signup', ready: 'input[type=email]', name: 'signup' },
  { role: '', path: '/components', ready: '[role=tablist]', name: 'components' },
  { role: 'parent', path: '/workspace', ready: '.parent-welcome', name: 'parent' },
  { role: 'tutor', path: '/workspace', ready: '#desk-main h1', name: 'tutor' },
  {
    role: 'tutor',
    identity: 'tutor-meera',
    path: '/workspace',
    ready: '.desk-content',
    name: 'approved-tutor',
  },
  { role: 'tutor', path: '/apply', ready: '#desk-main h1', name: 'application' },
  { role: 'mentor', path: '/workspace', ready: '.desk-content', name: 'mentor' },
  { role: 'admin', path: '/workspace', ready: '.desk-content', name: 'admin' },
  { role: 'finance', path: '/billing', ready: '#desk-main h1', name: 'finance' },
  { role: 'support', path: '/cases', ready: '#desk-main h1', name: 'support' },
]

for (const route of routes) {
  test(`fresh route loads its styles and labels: ${route.name}`, async ({ browser, baseURL }) => {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      if (route.role) {
        const account =
          'identity' in route
            ? route.identity
            : route.role === 'parent'
              ? 'parent-b'
              : `${route.role}-a`
        const response = await context.request.post(`${baseURL}/api/v1/auth/login`, {
          headers: { Origin: baseURL! },
          data: { email: `${account}@example.test`, password: 'E2E-only learning passphrase 426!' },
        })
        expect(response.ok()).toBe(true)
      }
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${baseURL}${route.path}`)
      await page.locator(route.ready).first().waitFor({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('body')).not.toContainText(
        /\b(?:staffOps|applicationForm|tuition|parent|files|cases|billing|account|experience|desk|landing)\.[a-z]/,
        { useInnerText: true },
      )
      expect(errors).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([])
      await mkdir('docs/visual-qa/repository-improvements', { recursive: true })
      await page.screenshot({
        path: `docs/visual-qa/repository-improvements/${route.name}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      })
      await context.close()
    }
  })
}

test('discovery loads another cursor page without losing existing results', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/v1/tutors')
  expect(response.ok()).toBe(true)
  const tutors = await response.json()
  expect(tutors.length).toBeGreaterThanOrEqual(2)
  let nextAttempts = 0
  await page.route('**/api/v1/tutors?*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor) nextAttempts++
    if (cursor && nextAttempts <= 2) {
      await route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Temporary test outage', fieldErrors: {} },
      })
      return
    }
    await route.fulfill({
      json: cursor ? [tutors[1]] : [tutors[0]],
      headers: { 'X-Next-Cursor': cursor ? '' : 'test-next-page' },
    })
  })
  await page.goto('/tutors?searched=1')
  await expect(page.locator('.search-cards .tutor-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Load more tutors' }).click()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.locator('.search-cards .tutor-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.search-cards .tutor-card')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Load more tutors' })).toHaveCount(0)
  expect(nextAttempts).toBe(3)
})
