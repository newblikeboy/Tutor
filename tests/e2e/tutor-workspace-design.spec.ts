import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { connectGoogle } from './helpers/google'

const origin = 'http://127.0.0.1:5174'
const captureRoot = '.local/tutor-home-simplified'
async function capture(page: Page, name: string) {
  await mkdir(captureRoot, { recursive: true })
  for (const [size, width] of [
    ['desktop', 1440],
    ['mobile', 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `${captureRoot}/${name}-${size}.png`,
      fullPage: true,
    })
    if (size === 'mobile' && name === 'home') {
      await page.screenshot({ path: `${captureRoot}/home-viewport-mobile.png` })
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('tutor home prioritises Google connection, API recovery and private mobile navigation', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'tutor-arjun@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(login.status()).toBe(200)
  await page.goto('/workspace')
  await expect(page.getByRole('heading', { name: 'Your teaching day.', exact: true })).toBeVisible()
  await expect(page.locator('.tutor-summary a')).toHaveCount(2)
  await expect(
    page.getByRole('heading', { name: 'Google Calendar & Meet', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: /Teaching schedule|Follow-up tasks|Approved teaching scope|Interview|Confirmed bookings/,
    }),
  ).toHaveCount(0)
  await expect(page.getByText('You’re approved', { exact: true })).toHaveCount(0)
  const googlePanel = page.locator('.tutor-home > .google-connection')
  expect(
    await googlePanel.evaluate((element) => element === element.parentElement?.firstElementChild),
  ).toBe(true)
  await capture(page, 'home')
  await connectGoogle(page, 'tutor')
  await page.goto('/workspace')
  await expect(
    page.getByRole('heading', { name: 'Google Account Connected', exact: true }),
  ).toBeVisible()
  await expect(googlePanel.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
  await capture(page, 'home-connected')
  await page
    .locator('.desk-sidebar')
    .getByRole('link', { name: 'Teaching hours', exact: true })
    .click()
  await expect(page).toHaveURL('/availability')
  await expect(
    page.getByRole('heading', { name: 'Teaching hours', level: 1, exact: true }),
  ).toBeVisible()
  await capture(page, 'teaching-hours')
  for (const [path, heading, name] of [
    ['/workspace?view=learners', 'My students', 'students-empty'],
    ['/workspace?view=sessions', 'Trial classes', 'trials-empty'],
    ['/tuition', 'Regular classes', 'classes-empty'],
    ['/billing', 'Earnings & payouts', 'earnings'],
    ['/tutor-profile', 'My profile', 'profile'],
    ['/notifications', 'Updates', 'updates'],
    ['/cases', 'Help & support', 'help'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
    await expect(page.locator('.desk-main .loading-state')).toHaveCount(0)
    await capture(page, name)
  }
  await page.goto('/workspace')
  await expect(page.getByLabel('Teaching date', { exact: true })).toHaveCount(0)
  await page.route('**/api/v1/tutor/workspace', (route) =>
    route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Test API outage' } }),
  )
  await page.goto('/workspace')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.locator('.tutor-summary')).toHaveCount(0)
  await capture(page, 'api-error')
  await page.unroute('**/api/v1/tutor/workspace')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('Next lesson', { exact: true })).toBeVisible()
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  const menu = page.getByRole('button', { name: 'Open menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true })
  await expect(drawer.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: `${captureRoot}/mobile-menu.png` })
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menu).toBeFocused()
  await menu.click()
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(menu).toBeFocused()
  await menu.click()
  await drawer.getByRole('link', { name: 'My students', exact: true }).click()
  await expect(page).toHaveURL(/view=learners/)
  await expect(drawer).toHaveCount(0)
  await expect(
    page.getByRole('heading', { level: 1, name: 'My students', exact: true }),
  ).toBeVisible()
  const everyday = page.getByRole('navigation', { name: 'Everyday navigation', exact: true })
  await expect(everyday.getByRole('link', { name: 'My students', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await everyday.getByRole('link', { name: 'Classes', exact: true }).click()
  await expect(page).toHaveURL('/tuition')
  await expect(everyday.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.goto('/workspace?view=sessions&queue=declined')
  await expect(everyday.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const trialFilters = page.getByRole('navigation', { name: 'Filter trial classes', exact: true })
  const selectedFilter = trialFilters.locator('[aria-current="page"]')
  await expect
    .poll(async () => {
      const bar = await trialFilters.boundingBox()
      const link = await selectedFilter.boundingBox()
      return !!bar && !!link && link.x >= bar.x && link.x + link.width <= bar.x + bar.width
    })
    .toBe(true)
  await expect(trialFilters).toContainText('Declined')
  await everyday.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL('/workspace')
  await expect(everyday.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  expect(errors).toEqual([])
})
