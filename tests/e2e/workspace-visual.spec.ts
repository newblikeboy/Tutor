import { test, expect } from '@playwright/test'
for (const scenario of [
  { language: 'en', width: 1440, suffix: 'desktop' },
  { language: 'hi', width: 390, suffix: 'mobile' },
]) {
  test(`reviewed private workspace baseline: ${scenario.language}-${scenario.suffix}`, async ({
    page,
    baseURL,
  }) => {
    test.skip(
      process.platform !== 'win32',
      'Windows Chromium baselines require separately reviewed captures on other platforms.',
    )
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript((lng) => localStorage.setItem('language', lng), scenario.language)
    const response = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: new URL(baseURL!).origin },
      data: { email: 'parent-b@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(response.status()).toBe(200)
    await page.goto('/workspace')
    await page.locator('.desk-start-card').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(
      `workspace-parent-${scenario.language}-${scenario.suffix}.png`,
      { fullPage: true, animations: 'disabled', maxDiffPixels: 0 },
    )
  })
}
