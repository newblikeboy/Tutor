import { test, expect } from '@playwright/test'

for (const [name, route, language, width] of [
  ['account-login-en-desktop', '/login', 'en', 1440],
  ['account-signup-en-desktop', '/signup', 'en', 1440],
  ['account-login-hi-mobile', '/login', 'hi', 390],
  ['account-signup-hi-mobile', '/signup', 'hi', 390],
] as const) {
  test(`reviewed account visual baseline: ${name}`, async ({ page }) => {
    test.skip(
      process.platform !== 'win32',
      'Reviewed Windows Chromium baselines; Linux needs its own reviewed images.',
    )
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript((value) => localStorage.setItem('language', value), language)
    await page.goto(route)
    await expect(page.locator('input[type=email]')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixels: 0 })
  })
}
