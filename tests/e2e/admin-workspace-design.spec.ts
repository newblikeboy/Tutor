import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
const output = 'docs/visual-qa/admin-workspace'

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  await expect(page.locator('.loading-state')).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('admin dashboard keeps actual counts, grouped routes, filters, mobile navigation and recovery', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email: 'admin-a@example.test', password: 'E2E-only learning passphrase 426!' },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/workspace')
  await expect(page.getByRole('heading', { level: 1, name: 'Network overview' })).toBeVisible()
  const overviewResponse = await page.request.get('/api/v1/staff/overview')
  expect(overviewResponse.status()).toBe(200)
  const overview = await overviewResponse.json()
  const metrics = page.locator('.staff-metrics a')
  await expect(metrics.locator('strong')).toHaveText([
    String(overview.counts.submitted ?? 0),
    String((overview.counts.under_review ?? 0) + (overview.counts.assessed ?? 0)),
    String(overview.counts.assessment_scheduled ?? 0),
    String(overview.counts.approved ?? 0),
  ])
  await expect(page.locator('.admin-followup-summary strong')).toHaveText(
    String(overview.followups),
  )
  const sidebar = page.locator('.desk-sidebar')
  await expect(sidebar.locator('.admin-nav-group')).toHaveText([
    'Teaching network',
    'Business',
    'Administration',
  ])
  await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('tab', { name: 'Upcoming interviews' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await capture(page, 'overview')
  await metrics.first().click()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('submitted')
  await capture(page, 'applications')
  await sidebar.getByRole('link', { name: 'Overview', exact: true }).click()
  await page
    .locator('.admin-operation-links')
    .getByRole('link', { name: /Mentor logins/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Create mentor login' })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Mentor logins', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await capture(page, 'mentors')
  await sidebar.getByRole('link', { name: 'Families', exact: true }).click()
  await expect(page.locator('.staff-filters.single')).toBeVisible()
  await capture(page, 'families')
  await sidebar.getByRole('link', { name: 'Founder report', exact: true }).click()
  await expect(page.locator('.staff-report-card').first()).toBeVisible()
  await capture(page, 'report')
  await sidebar.getByRole('link', { name: 'Tutor network', exact: true }).click()
  await expect(page.locator('.staff-row').first()).toBeVisible()
  const mode = page.getByLabel('Requested teaching mode', { exact: true })
  await expect(mode.locator('option[value=""]')).toHaveText('All teaching modes')
  await mode.selectOption('online')
  await page.getByLabel('Status', { exact: true }).selectOption('approved')
  await expect(page).toHaveURL(/mode=online/)
  await page.reload()
  await expect(mode).toHaveValue('online')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('approved')
  await expect(page.locator('.staff-row').first()).toBeVisible()
  await capture(page, 'tutors-filtered')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(mode).toHaveValue('')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('')
  await sidebar.getByRole('link', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await capture(page, 'account')
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('button', { name: 'Open menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.locator('.admin-nav-group')).toHaveText([
    'Teaching network',
    'Business',
    'Administration',
  ])
  await page.screenshot({ path: `${output}/drawer-390.png`, fullPage: false })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menu).toBeFocused()
  await menu.click()
  await drawer.getByRole('link', { name: 'Business & taxes', exact: true }).click()
  await expect(page).toHaveURL(/billing\?tab=business/)
  await expect(page.getByRole('tab', { name: 'Business & taxes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(drawer).toHaveCount(0)
  await page.route('**/api/v1/staff/overview', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'unavailable', message: 'Read-only admin outage fixture' },
    }),
  )
  await page.goto('/workspace')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await capture(page, 'overview-error')
  await page.unroute('**/api/v1/staff/overview')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(metrics.first()).toBeVisible()
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
