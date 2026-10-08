// Capture candidates only. Inspect them before copying to tests/e2e/baselines.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch()
const cases = [
  ['home-en-desktop', '/', 1440, false],
  ['home-en-mobile', '/', 390, false],
  ['profile-en-desktop', '/tutors/tutor-meera', 1440, true],
  ['profile-en-mobile', '/tutors/tutor-meera', 390, true],
  ['empty-en-mobile', '/tutors?subject=Science', 390, true],
]
await mkdir('docs/visual-qa/candidates', { recursive: true })
for (const [name, path, width, fullPage] of cases) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:5173${path}`)
  await page
    .locator(
      path.includes('tutor-meera')
        ? '#teacher-profile-title'
        : path.includes('Science')
          ? '.empty'
          : '.hero-copy',
    )
    .waitFor()
  await page.evaluate(() => document.fonts.ready)
  if (path === '/') {
    await page.locator('.home-hero-image').evaluate((image) => image.decode())
  }
  await page.screenshot({
    path: `docs/visual-qa/candidates/${name}.png`,
    fullPage,
    animations: 'disabled',
  })
  await context.close()
}
await browser.close()
console.log('Five baseline candidates captured. Visual review is required before promotion.')
