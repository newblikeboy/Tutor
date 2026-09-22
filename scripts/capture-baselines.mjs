// Capture candidates only. Inspect them before copying to tests/e2e/baselines.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch()
const cases = [
  ['home-en-desktop', '/', 'en', 1440, false],
  ['home-en-mobile', '/', 'en', 390, false],
  ['home-hi-mobile', '/', 'hi', 390, false],
  ['profile-en-desktop', '/tutors/tutor-meera', 'en', 1440, true],
  ['profile-hi-mobile', '/tutors/tutor-meera', 'hi', 390, true],
  ['empty-hi-mobile', '/tutors?subject=Science', 'hi', 390, true],
]
await mkdir('docs/visual-qa/candidates', { recursive: true })
for (const [name, path, language, width, fullPage] of cases) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
  })
  await context.addInitScript((lng) => localStorage.setItem('language', lng), language)
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:5173${path}`)
  await page.locator('.dev-banner').waitFor()
  await page
    .locator(
      path.includes('tutor-meera')
        ? '.profile-header'
        : path.includes('Science')
          ? '.empty'
          : '.hero-copy',
    )
    .waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: `docs/visual-qa/candidates/${name}.png`,
    fullPage,
    animations: 'disabled',
  })
  await context.close()
}
await browser.close()
console.log('Six baseline candidates captured. Visual review is required before promotion.')
