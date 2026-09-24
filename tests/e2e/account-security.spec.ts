import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
test.use({ actionTimeout: 12000 })
test('account preferences, password rotation and cross-browser revocation persist', async ({
  browser,
}) => {
  test.setTimeout(120000)
  const baseURL = 'http://127.0.0.1:5174'
  const first = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
  const second = await browser.newContext({ baseURL })
  try {
    const password = 'E2E initial account passphrase 834!'
    const next = 'E2E changed account passphrase 935!'
    const email = `security-${Date.now()}@example.test`
    expect(
      (
        await first.request.post('/api/v1/auth/signup', {
          headers: { Origin: baseURL },
          data: { email, password, name: 'Security test family', role: 'parent', adult: true },
        })
      ).status(),
    ).toBe(201)
    expect(
      (
        await second.request.post('/api/v1/auth/login', {
          headers: { Origin: baseURL },
          data: { email, password },
        })
      ).status(),
    ).toBe(200)
    const page = await first.newPage()
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await page.getByLabel('Your name', { exact: true }).fill('Family preferences saved')
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await expect(page.getByText('Your preferences are saved.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Your name', { exact: true })).toHaveValue(
      'Family preferences saved',
    )
    await page.getByRole('tab', { name: 'Sign-ins', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Other sign-in', exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: 'docs/visual-qa/product-ux/account-settings-en-desktop.png',
      fullPage: true,
    })
    await page.getByRole('tab', { name: 'Password', exact: true }).click()
    await page.getByLabel('Current password', { exact: true }).fill(password)
    await page.getByLabel('New password', { exact: true }).fill(next)
    await page.getByLabel('Confirm new password', { exact: true }).fill(next)
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(
      page.getByText('Password changed. Other sessions have been signed out.', { exact: true }),
    ).toBeVisible()
    expect((await second.request.get('/api/v1/me')).status()).toBe(401)
    expect(
      (
        await second.request.post('/api/v1/auth/login', {
          headers: { Origin: baseURL },
          data: { email, password },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await second.request.post('/api/v1/auth/login', {
          headers: { Origin: baseURL },
          data: { email, password: next },
        })
      ).status(),
    ).toBe(200)
    await page.reload()
    await page.getByRole('tab', { name: 'Sign-ins', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out this session', exact: true }).click()
    await expect(
      page.getByText('The selected session has been signed out.', { exact: true }),
    ).toBeVisible()
    expect((await second.request.get('/api/v1/me')).status()).toBe(401)
    await page.getByRole('tab', { name: 'Profile', exact: true }).click()
    await page.getByLabel('Preferred language').selectOption('hi')
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await expect(page.getByText('आपकी पसंद सहेज दी गई है।', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: 'docs/visual-qa/product-ux/account-settings-hi-mobile.png',
      fullPage: true,
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.keyboard.press('Control+Home')
    await page.getByLabel('आपका नाम', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('साइन-इन ईमेल', { exact: true })).toBeFocused()
    expect(
      (
        await second.request.post('/api/v1/auth/login', {
          headers: { Origin: baseURL },
          data: { email, password: next },
        })
      ).status(),
    ).toBe(200)
    const anotherDevice = await second.newPage()
    await anotherDevice.goto('/workspace')
    await expect(anotherDevice.locator('html')).toHaveAttribute('lang', 'hi')
    await expect(anotherDevice.locator('.language-button')).toHaveText('English')
  } finally {
    await first.close()
    await second.close()
  }
})
