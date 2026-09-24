import { test, expect } from '@playwright/test'
for (const scenario of [
  { language: 'en', width: 1440, suffix: 'desktop' },
  { language: 'en', width: 390, suffix: 'mobile' },
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
    await expect(
      page.getByRole('heading', { name: 'Who needs a tutor?', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(
      `english-only-workspace-parent-${scenario.language}-${scenario.suffix}.png`,
      { fullPage: true, animations: 'disabled', maxDiffPixels: 0 },
    )
  })
}
