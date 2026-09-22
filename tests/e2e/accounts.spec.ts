import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const password = 'E2E-only learning passphrase 426!'

for (const language of ['en', 'hi']) {
  test(`new ${language} parent signs up, signs out and signs in with persisted credentials`, async ({
    page,
  }) => {
    const hi = language === 'hi'
    await page.setViewportSize({ width: hi ? 390 : 1440, height: 1000 })
    await page.addInitScript((value) => localStorage.setItem('language', value), language)
    await page.goto('/signup')
    await expect(page.getByLabel(hi ? 'पूरा नाम' : 'Full name')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await mkdir('docs/visual-qa', { recursive: true })
    await page.screenshot({
      path: `docs/visual-qa/signup-${language}-${hi ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    const name = page.getByLabel(hi ? 'पूरा नाम' : 'Full name', { exact: true })
    const email = page.getByLabel(hi ? 'ईमेल पता' : 'Email address', { exact: true })
    const secret = page.getByLabel(hi ? 'पासवर्ड' : 'Password', { exact: true })
    const address = `new-parent-${language}@example.test`
    await name.fill(hi ? 'काल्पनिक अभिभावक' : 'Fictional parent')
    await name.press('Tab')
    await expect(email).toBeFocused()
    await email.fill(address)
    await email.press('Tab')
    await expect(secret).toBeFocused()
    await secret.fill('short')
    await page.getByRole('checkbox').check()
    await page
      .getByRole('button', { name: hi ? 'खाता बनाएँ' : 'Create account', exact: true })
      .click()
    await expect(secret).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/signup/)
    await secret.fill(password)
    await page.getByRole('button', { name: hi ? 'पासवर्ड दिखाएँ' : 'Show password' }).click()
    await expect(secret).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: hi ? 'पासवर्ड छिपाएँ' : 'Hide password' }).click()
    await expect(secret).toHaveAttribute('type', 'password')
    await page
      .getByRole('button', { name: hi ? 'खाता बनाएँ' : 'Create account', exact: true })
      .click()
    await expect(page).toHaveURL(/workspace/)
    const account = await (await page.request.get('/api/v1/auth/session')).json()
    expect(account.user.email).toBe(address)
    expect(account.user.role).toBe('parent')
    await page.getByRole('button', { name: hi ? 'साइन आउट' : 'Sign out', exact: true }).click()
    await expect(page).toHaveURL('/')
    await page.goto('/login')
    await email.fill(address)
    await secret.fill(password)
    await page.getByRole('button', { name: hi ? 'साइन इन करें' : 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/workspace/)
    await page.reload()
    expect((await (await page.request.get('/api/v1/auth/session')).json()).user.id).toBe(
      account.user.id,
    )
  })
}

test('tutor signup starts a private application and never grants approval', async ({ page }) => {
  await page.goto('/login?return=%2Fapply')
  await page.getByRole('link', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Tutor', exact: true })).toBeChecked()
  await expect(
    page.getByText(
      'Creating an account starts your application. Academic assessment and approval come next.',
    ),
  ).toBeVisible()
  await page.getByLabel('Full name', { exact: true }).fill('Fictional new tutor')
  await page.getByLabel('Email address', { exact: true }).fill('new-tutor@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL('/apply')
  const user = (await (await page.request.get('/api/v1/auth/session')).json()).user
  expect(user.role).toBe('tutor')
  expect((await page.request.get(`/api/v1/tutors/${user.id}`)).status()).toBe(404)
  expect((await (await page.request.get('/api/v1/dashboard')).json()).applications).toEqual([])
})

test('login errors preserve inputs, network retry works, and recovery help is honest', async ({
  page,
}) => {
  await page.goto('/login')
  const email = page.getByLabel('Email address', { exact: true })
  const secret = page.getByLabel('Password', { exact: true })
  await email.fill('parent-a@example.test')
  await secret.fill('An incorrect passphrase')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('That email and password don’t match.')
  await expect(email).toHaveValue('parent-a@example.test')
  await secret.clear()
  await page.screenshot({ path: 'docs/visual-qa/login-error-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Trouble signing in?' }).click()
  await expect(page.getByRole('dialog')).toContainText('Password recovery is not available')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Trouble signing in?' })).toBeFocused()
  await page.route('**/api/v1/auth/login', (route) => route.abort('failed'))
  await secret.fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(email).toHaveValue('parent-a@example.test')
  await page.unroute('**/api/v1/auth/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/workspace')
})

test('auth pages reflow across widths and keyboard access stays visible', async ({ page }) => {
  for (const route of ['/login', '/signup', '/login?staff=1', '/login/', '/signup/']) {
    await page.goto(route)
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  }
  await page.goto('/login')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#auth-main')).toBeFocused()
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
