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
    if (new URL(page.url()).pathname === '/tutor-profile') {
      const space = await page
        .locator('.desk-main')
        .evaluate(
          (node) =>
            node.clientWidth -
            parseFloat(getComputedStyle(node).paddingLeft) -
            parseFloat(getComputedStyle(node).paddingRight),
        )
      expect(
        (await page.locator('.tutor-public-profile-page').boundingBox())!.width,
      ).toBeGreaterThanOrEqual(space - 2)
      const strip = page.getByRole('tablist', { name: 'My profile', exact: true })
      const selected = strip.locator('[aria-selected="true"]')
      await expect
        .poll(async () => {
          const bar = await strip.boundingBox()
          const tab = await selected.boundingBox()
          return !!bar && !!tab && tab.x >= bar.x && tab.x + tab.width <= bar.x + bar.width
        })
        .toBe(true)
      if (width === 390) {
        const rows = await strip
          .getByRole('tab')
          .evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)))
        expect(new Set(rows).size).toBe(1)
      }
    }
    await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('Tutor profile preserves layout, settings, tab drafts and retries', async ({
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
  await page.goto('/tutor-profile')
  await expect(page.getByLabel('Public introduction', { exact: true })).toBeVisible()
  await capture(page, 'public-profile-layout')
  await page.setViewportSize({ width: 1920, height: 1080 })
  const available = await page
    .locator('.desk-main')
    .evaluate(
      (node) =>
        node.clientWidth -
        parseFloat(getComputedStyle(node).paddingLeft) -
        parseFloat(getComputedStyle(node).paddingRight),
    )
  expect(
    (await page.locator('.tutor-public-profile-page').boundingBox())!.width,
  ).toBeGreaterThanOrEqual(available - 2)
  await page.screenshot({ path: `${output}/public-profile-wide-1920.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/tutor-profile?section=preview')
  await expect(page.getByText('What parents see', { exact: true })).toBeVisible()
  await page.reload()
  await capture(page, 'profile-preview-layout')
  await page.setViewportSize({ width: 390, height: 1000 })
  const preview = page.getByRole('tab', { name: 'Preview', exact: true })
  await preview.focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Public profile', exact: true })).toBeFocused()
  await expect(preview).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/tutor-profile?section=profile')
  await expect(page.getByLabel('Public introduction', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/account')
  await expect(page).toHaveURL('/tutor-profile?section=account')
  await expect(
    page.getByRole('heading', { level: 1, name: 'My profile', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Emails', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Sign-in email', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.locator('.account-reminder-status')).toBeVisible()
  await capture(page, 'tutor-profile')
  const name = page.getByLabel('Your name', { exact: true })
  await name.fill('Arjun account settings')
  const profile = page.getByRole('tab', { name: 'Account & email', exact: true })
  await profile.focus()
  await page.keyboard.press('ArrowRight')
  const secretTab = page.getByRole('tab', { name: 'Password', exact: true })
  await expect(secretTab).toBeFocused()
  await expect(profile).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/section=password/)
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
    await page.getByRole('tab', { name: 'Sign-ins & Google', exact: true }).click()
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
  await page.goto('/account?tab=password')
  await expect(page).toHaveURL('/tutor-profile?section=password')
  await page.goto('/account?tab=signins')
  await expect(page).toHaveURL('/tutor-profile?section=signins')
  await page.goto('/')
  await expect(page).toHaveURL('/workspace')
  await expect(page.locator('.site-header')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('.site-header')).toBeVisible()
  expect(errors).toEqual([])
})

for (const role of ['parent', 'mentor', 'admin']) {
  test(`${role} Account preserves settings layout and role boundaries`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
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
    await page.goto('/')
    await expect(page).toHaveURL('/workspace')
    await expect(page.locator('.site-header')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL('/')
    await expect(page.locator('.site-header')).toBeVisible()
    expect(errors).toEqual([])
  })
}
