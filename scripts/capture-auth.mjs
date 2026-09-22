// Capture empty account forms for human review. Never promotes a baseline automatically.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const scenarios = [
  ['account-login-en-desktop', '/login', 'en', 1440],
  ['account-signup-en-desktop', '/signup', 'en', 1440],
  ['account-login-hi-mobile', '/login', 'hi', 390],
  ['account-signup-hi-mobile', '/signup', 'hi', 390],
]
await mkdir('.local/auth-review', { recursive: true })
const browser = await chromium.launch()
try {
  for (const [name, route, language, width] of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    await context.addInitScript((value) => localStorage.setItem('language', value), language)
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
