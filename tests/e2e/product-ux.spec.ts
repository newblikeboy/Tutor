import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = 'http://127.0.0.1:5174'
test.use({ actionTimeout: 12000 })

test('account tabs defer sign-ins and keep unfinished edits with keyboard and URL navigation', async ({
  page,
}) => {
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'parent-b@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(login.status()).toBe(200)
  let sessionReads = 0
  page.on('request', (request) => {
    if (request.url().includes('/account/sessions')) sessionReads++
  })
  await page.goto('/account')
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
  expect(sessionReads).toBe(0)
  await page.getByLabel('Your name', { exact: true }).fill('An unfinished name')
  await page.getByRole('tab', { name: 'Profile', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Password', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/tab=password/)
  await page.getByLabel('Current password', { exact: true }).fill('Unsubmitted fixture password')
  await page.getByRole('tab', { name: 'Profile', exact: true }).click()
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('An unfinished name')
  await page.getByRole('tab', { name: 'Password', exact: true }).click()
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue(
    'Unsubmitted fixture password',
  )
  await page.getByRole('tab', { name: 'Sign-ins', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Current sign-in', exact: true })).toBeVisible()
  expect(sessionReads).toBeGreaterThan(0)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Sign-ins', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('tab', { name: 'Profile', exact: true }).click()
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeVisible()
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('days off use a date picker, save selected dates and remove them without duplicates', async ({
  page,
}) => {
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'tutor-arjun@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(login.status()).toBe(200)
  await page.goto('/availability')
  const date = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10)
  const second = new Date(Date.now() + 401 * 86400000).toISOString().slice(0, 10)
  const picker = page.getByLabel('Date off', { exact: true })
  await expect(picker).toHaveAttribute('type', 'date')
  await picker.fill(date)
  await page.getByRole('button', { name: 'Add date', exact: true }).click()
  await picker.fill(date)
  await expect(page.getByRole('button', { name: 'Add date', exact: true })).toBeDisabled()
  await picker.fill(second)
  const save = async () => {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/availability') && r.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: 'Save schedule', exact: true }).click()
    expect((await response).status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Save schedule', exact: true })).toBeEnabled()
  }
  await save()
  await page.reload()
  for (const value of [date, second])
    await expect(page.getByRole('button', { name: `Remove ${value}`, exact: true })).toBeVisible()
  const stored = await (await page.request.get('/api/v1/availability')).json()
  expect(stored.leaveDates.filter((d: string) => d === date)).toHaveLength(1)
  expect(stored.leaveDates).toContain(second)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const value of [date, second])
    await page.getByRole('button', { name: `Remove ${value}`, exact: true }).click()
  await save()
  await page.reload()
  await expect(page.locator(`time[datetime="${date}"]`)).toHaveCount(0)
  await expect(page.locator(`time[datetime="${second}"]`)).toHaveCount(0)
})
