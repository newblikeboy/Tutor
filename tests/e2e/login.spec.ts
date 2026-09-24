import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

for (const scenario of [
  {
    language: 'en',
    identity: 'parent-b',
    role: 'parent',
    width: 1440,
    staff: false,
    title: 'Parent sign in',
  },
  {
    language: 'en',
    identity: 'tutor-a',
    role: 'tutor',
    width: 390,
    staff: false,
    title: 'Tutor sign in',
  },
  {
    language: 'hi',
    identity: 'mentor-a',
    role: 'mentor',
    width: 390,
    staff: true,
    title: 'कर्मचारी साइन इन',
  },
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
    else alias.searchParams.set('role', scenario.role)
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(scenario.title)
    const hindi = scenario.language === 'hi'
    await expect(
      page.getByLabel(hindi ? 'ईमेल पता' : 'Email address', { exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await mkdir('docs/visual-qa/login-roles', { recursive: true })
    // Capture empty forms: never retain login credentials in screenshots.
    await page.screenshot({
      path: `docs/visual-qa/login-roles/${scenario.role}-${scenario.language}-${scenario.width}.png`,
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
    // The authenticated account, not the URL selector, determines the displayed identity.
    await page.goto('/login?role=parent')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(scenario.title)
    await expect(page.locator('.auth-login-roles')).toHaveCount(0)
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

test('account choices survive navigation and keep staff separate from public signup', async ({
  page,
}) => {
  await page.goto('/login?return=%2Fworkspace%3Fview%3Dtrials')
  const choices = page.getByRole('navigation', { name: 'Account type' })
  await expect(choices.getByRole('link', { name: 'Parent', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await choices.getByRole('link', { name: 'Tutor', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutor sign in')
  expect(new URL(page.url()).searchParams.get('return')).toBe('/workspace?view=trials')
  await page.reload()
  await expect(choices.getByRole('link', { name: 'Tutor', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.getByRole('link', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Tutor', exact: true })).toBeChecked()
  await expect(page.getByRole('radio')).toHaveCount(2)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutor sign in')
  await choices.getByRole('link', { name: 'Staff', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Staff sign in')
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toHaveCount(0)
  await expect(choices.getByRole('link', { name: 'Staff', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutor sign in')
  for (const destination of ['/apply', '/availability']) {
    await page.goto(`/login?return=${encodeURIComponent(destination)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutor sign in')
  }
  await page.goto('/login?return=https%3A%2F%2Funtrusted.example')
  await choices.getByRole('link', { name: 'Tutor', exact: true }).click()
  expect(new URL(page.url()).searchParams.has('return')).toBe(false)
})
