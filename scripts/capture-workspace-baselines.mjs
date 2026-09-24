// Capture candidates only, against a running development server. Never promote automatically.
// Only the explicitly fictional, empty parent-b fixture is allowed. No credentials are captured.
import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
const e2e = process.env.E2E_CAPTURE === '1'
let password = 'E2E-only learning passphrase 426!'
if (!e2e) {
  const env = await readFile('.env', 'utf8')
  const line = env.split(/\r?\n/).find((value) => value.startsWith('SEED_PASSWORD='))
  if (!line) throw new Error('Private development fixture password is required in .env')
  password = line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '')
}
const origin = e2e ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5173'
await mkdir('docs/visual-qa/candidates', { recursive: true })
const browser = await chromium.launch()
try {
  for (const [language, width, suffix] of [
    ['en', 1440, 'desktop'],
    ['hi', 390, 'mobile'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      deviceScaleFactor: 1,
    })
    const response = await context.request.post(`${origin}/api/v1/auth/login`, {
      headers: { Origin: origin },
      data: { email: 'parent-b@example.test', password },
    })
    if (!response.ok()) throw new Error('Fixture sign-in failed')
    const auth = await response.json()
    const records = await (await context.request.get(`${origin}/api/v1/dashboard`)).json()
    if (!auth.user.sample || auth.user.id !== 'parent-b' || records.learners.length !== 0)
      throw new Error('Capture requires the untouched, empty fictional parent-b fixture')
    await context.addInitScript((lng) => localStorage.setItem('language', lng), language)
    const page = await context.newPage()
    await page.goto(`${origin}/workspace`)
    await page.locator('.desk-start-card').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/candidates/workspace-parent-${language}-${suffix}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await context.request.post(`${origin}/api/v1/auth/logout`, {
      headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
      data: {},
    })
    await context.close()
  }
} finally {
  await browser.close()
}
console.log('Two workspace candidates captured. Open and review them before promotion.')
