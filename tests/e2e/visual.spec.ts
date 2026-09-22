import { test, expect } from '@playwright/test'
// Reviewed Windows Chromium/font baselines. Linux CI runs functional/axe coverage;
// do not compare cross-platform rasterization or silently regenerate baselines.
const cases = [
  { name: 'home-en-desktop', path: '/', language: 'en', width: 1440, fullPage: false },
  { name: 'home-en-mobile', path: '/', language: 'en', width: 390, fullPage: false },
  { name: 'home-hi-mobile', path: '/', language: 'hi', width: 390, fullPage: false },
  {
    name: 'profile-en-desktop',
    path: '/tutors/tutor-meera',
    language: 'en',
    width: 1440,
    fullPage: true,
  },
  {
    name: 'profile-hi-mobile',
    path: '/tutors/tutor-meera',
    language: 'hi',
    width: 390,
    fullPage: true,
  },
  {
    name: 'empty-hi-mobile',
    path: '/tutors?subject=Science',
    language: 'hi',
    width: 390,
    fullPage: true,
  },
]
for (const scenario of cases)
  test(`reviewed visual baseline: ${scenario.name}`, async ({ page }) => {
    test.skip(
      process.platform !== 'win32',
      'Baselines visually reviewed on Windows only; capture and review Linux baselines separately.',
    )
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript((lng) => localStorage.setItem('language', lng), scenario.language)
    await page.goto(scenario.path)
    await page.locator('.dev-banner').waitFor()
    await page
      .locator(
        scenario.path.includes('tutor-meera')
          ? '.profile-header'
          : scenario.path.includes('Science')
            ? '.empty'
            : '.hero-copy',
      )
      .waitFor()
    await page.evaluate(() => document.fonts.ready)
    if (scenario.path === '/') {
      await page.locator('.home-hero-image').evaluate((image: HTMLImageElement) => image.decode())
    }
    await expect(page).toHaveScreenshot(`${scenario.name}.png`, {
      fullPage: scenario.fullPage,
      animations: 'disabled',
      maxDiffPixels: 0,
    })
  })
