// Capture empty account forms for human review. Never promotes a baseline automatically.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const scenarios = [
  ['account-login-en-desktop', '/login', 1440],
  ['account-signup-en-desktop', '/signup', 1440],
  ['account-login-en-mobile', '/login', 390],
  ['account-signup-en-mobile', '/signup', 390],
]
await mkdir('.local/auth-review', { recursive: true })
const browser = await chromium.launch()
try {
  for (const [name, route, width] of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5173' + route)
    await page.locator('input[type=email]').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `.local/auth-review/${name}.png`, fullPage: true })
    await context.close()
    console.log('Captured', name)
  }
} finally {
  await browser.close()
}
