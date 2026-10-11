import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const output = 'docs/visual-qa/account-redesign'

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('Account redesign preserves settings, tab drafts, retries and role boundaries', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email: 'tutor-arjun@example.test', password },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1, name: 'Account', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Emails', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Sign-in email', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.locator('.account-reminder-status')).toBeVisible()
  await capture(page, 'tutor-profile')
  const name = page.getByLabel('Your name', { exact: true })
  await name.fill('Arjun account settings')
  const profile = page.getByRole('tab', { name: 'Profile', exact: true })
  await profile.focus()
  await page.keyboard.press('ArrowRight')
  const secretTab = page.getByRole('tab', { name: 'Password', exact: true })
  await expect(secretTab).toBeFocused()
  await expect(profile).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/tab=password/)
  await page.getByLabel('Current password', { exact: true }).fill(password)
  await page.getByLabel('New password', { exact: true }).fill('Account review passphrase 846!')
  await page.getByLabel('Confirm new password', { exact: true }).fill('Different passphrase 846!')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByText('The new passwords do not match.', { exact: true })).toBeVisible()
  // Screenshots never retain even fictional password values.
  await page.getByLabel('Current password', { exact: true }).clear()
  await page.getByLabel('New password', { exact: true }).clear()
  await page.getByLabel('Confirm new password', { exact: true }).clear()
  await capture(page, 'password-mismatch')
  await profile.click()
  await expect(name).toHaveValue('Arjun account settings')
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByText('Your preferences are saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(name).toHaveValue('Arjun account settings')
  const before = await (await page.request.get('/api/v1/account/email/preferences')).json()
  await page
    .getByRole('button', {
      name: before.reminders ? 'Turn reminders off' : 'Turn reminders on',
      exact: true,
    })
    .click()
  await expect(page.locator('.account-reminder-status')).toHaveText(
    `Reminder emails are ${before.reminders ? 'off' : 'on'}.`,
  )
  await page.reload()
  expect(
    (await (await page.request.get('/api/v1/account/email/preferences')).json()).reminders,
  ).toBe(!before.reminders)
  const second = await browser.newContext({ baseURL: origin })
  try {
    expect(
      (
        await second.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: 'tutor-arjun@example.test', password },
        })
      ).status(),
    ).toBe(200)
    await page.getByRole('tab', { name: 'Sign-ins', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Other sign-in', exact: true })).toBeVisible()
    await capture(page, 'sign-ins')
    await page.getByRole('button', { name: 'Sign out this session', exact: true }).click()
    await expect(
      page.getByText('The selected session has been signed out.', { exact: true }),
    ).toBeVisible()
    expect((await second.request.get('/api/v1/me')).status()).toBe(401)
    expect((await page.request.get('/api/v1/me')).status()).toBe(200)
  } finally {
    await second.close()
  }
  await page.route('**/api/v1/account', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'unavailable', message: 'Read-only account outage fixture' },
    }),
  )
  await page.goto('/account')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await capture(page, 'profile-error')
  await page.unroute('**/api/v1/account')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(name).toHaveValue('Arjun account settings')
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  await expect(page.locator('.account-help a')).toHaveAttribute('href', '/cases')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  for (const role of ['parent', 'mentor', 'admin']) {
    expect(
      (
        await page.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: `${role}-a@example.test`, password },
        })
      ).status(),
    ).toBe(200)
    await page.goto('/account')
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    await expect(page.locator('.account-reminder-status')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Emails', exact: true })).toHaveCount(
      role === 'admin' ? 1 : 0,
    )
    await capture(page, `${role}-profile`)
    if (role === 'admin') {
      await page.getByRole('tab', { name: 'Emails', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Email delivery log', exact: true }),
      ).toBeVisible()
      await capture(page, 'admin-deliveries')
    } else {
      expect((await page.request.get('/api/v1/admin/email-deliveries')).status()).toBe(403)
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  }
  expect(errors).toEqual([])
})
