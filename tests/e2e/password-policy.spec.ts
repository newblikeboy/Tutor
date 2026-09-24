import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('eight-character signup and password change persist; seven characters are rejected', async ({
  page,
  baseURL,
}) => {
  const email = `password-policy-${Date.now()}@example.test`
  const password = 'Test#842'
  const next = 'Next#712'
  await mkdir('docs/visual-qa/password-policy', { recursive: true })
  await page.goto('/signup')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.getByLabel('Full name', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Use 8–128 characters. A few memorable words work well.'),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/password-policy/signup-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Full name', { exact: true }).fill('Fictional password policy tester')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcd!42')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL('/signup')
  const rejected = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: baseURL! },
    data: {
      name: 'Fictional short password',
      email,
      password: 'Abcd!42',
      role: 'parent',
      adult: true,
    },
  })
  expect(rejected.status()).toBe(422)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL('/workspace')
  await page.goto('/account?tab=password')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.getByLabel('Current password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('minlength', '8')
    await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveAttribute(
      'minlength',
      '8',
    )
    await expect(page.getByText('8–128 characters.', { exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/password-policy/change-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const session = await (await page.request.get('/api/v1/auth/session')).json()
  const shortChange = await page.request.post('/api/v1/account/password', {
    headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrf },
    data: { currentPassword: password, newPassword: 'Abcd!42' },
  })
  expect(shortChange.status()).toBe(422)
  await page.getByLabel('Current password', { exact: true }).fill(password)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password', { exact: true }).fill(next)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(
    page.getByText('Password changed. Other sessions have been signed out.'),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Current password', { exact: true })).toBeVisible()
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: baseURL! },
        data: { email, password },
      })
    ).status(),
  ).toBe(401)
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: baseURL! },
        data: { email, password: next },
      })
    ).status(),
  ).toBe(200)
})
