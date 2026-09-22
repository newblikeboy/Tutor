import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

for (const scenario of [
  { language: 'en', identity: 'parent-b', role: 'parent', width: 1440, staff: false },
  { language: 'hi', identity: 'mentor-a', role: 'mentor', width: 390, staff: true },
]) {
  test(`localhost login redirects and persists ${scenario.role} session (${scenario.language})`, async ({
    page,
    baseURL,
  }) => {
    const canonical = new URL(baseURL!)
    const alias = new URL(baseURL!)
    alias.hostname = 'localhost'
    alias.pathname = '/login'
    alias.searchParams.set('return', '/workspace?from=login')
    if (scenario.staff) alias.searchParams.set('staff', '1')
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript(
      (language) => localStorage.setItem('language', language),
      scenario.language,
    )
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })

    await page.goto(alias.href)
    await expect(page).toHaveURL(`${canonical.origin}${alias.pathname}${alias.search}`)
    const hindi = scenario.language === 'hi'
    await expect(
      page.getByLabel(hindi ? 'ईमेल पता' : 'Email address', { exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await mkdir('docs/visual-qa', { recursive: true })
    // Capture empty forms: never retain login credentials in screenshots.
    await page.screenshot({
      path: `docs/visual-qa/login-${scenario.language}-${scenario.staff ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    await page
      .getByLabel(hindi ? 'ईमेल पता' : 'Email address', { exact: true })
      .fill(scenario.identity + '@example.test')
    await page
      .getByLabel(hindi ? 'पासवर्ड' : 'Password', { exact: true })
      .fill('E2E-only learning passphrase 426!')
    await page
      .getByRole('button', { name: hindi ? 'साइन इन करें' : 'Sign in', exact: true })
      .click()
    await expect(page).toHaveURL(`${canonical.origin}/workspace?from=login`)
    await page.reload()
    await expect(page).toHaveURL(`${canonical.origin}/workspace?from=login`)
    const session = await page.request.get('/api/v1/auth/session')
    expect(session.status()).toBe(200)
    expect((await session.json()).user.role).toBe(scenario.role)
    expect((await page.request.get('/api/v1/dashboard')).status()).toBe(200)
    expect(browserErrors).toEqual([])
  })
}

test('local alias does not bypass API origin or CSRF checks', async ({ request, baseURL }) => {
  const alias = new URL(baseURL!)
  alias.hostname = 'localhost'
  for (const origin of [alias.origin, 'https://untrusted.example']) {
    const response = await request.post(`${alias.origin}/api/v1/auth/login`, {
      headers: { Origin: origin },
      data: { email: 'parent-b@example.test', password: 'E2E-only learning passphrase 426!' },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(403)
    expect((await response.json()).code).toBe('origin')
  }
  const verify = await request.post('/api/v1/auth/login', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { email: 'parent-b@example.test', password: 'E2E-only learning passphrase 426!' },
  })
  expect(verify.status()).toBe(200)
  const logout = await request.post('/api/v1/auth/logout', {
    headers: { Origin: new URL(baseURL!).origin },
    data: {},
  })
  expect(logout.status()).toBe(403)
  expect((await logout.json()).code).toBe('csrf')
})
