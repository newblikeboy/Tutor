import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { pendingEmailCode, signupDatabase } from './signup-fixture'

test('signup remains pending until email verification, with retry and editable details', async ({
  page,
  baseURL,
}) => {
  const email = `signup-pending-${crypto.randomUUID()}@example.test`
  const nextEmail = `signup-edited-${crypto.randomUUID()}@example.test`
  const password = 'E2E-only learning passphrase 426!'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { client, database } = await signupDatabase()
  try {
    const input = {
      name: 'Fictional signup verification',
      email,
      password,
      role: 'parent',
      adult: true,
    }
    const bypass = await page.request.post('/api/v1/auth/signup', {
      headers: { Origin: baseURL! },
      data: input,
    })
    expect(bypass.status()).toBe(422)
    await page.goto('/signup?return=%2Faccount')
    await page.getByLabel('Full name', { exact: true }).fill(input.name)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Send email code', exact: true }).click()
    await expect(page.getByLabel('Email code', { exact: true })).toBeVisible()
    expect(await (await page.request.get('/api/v1/auth/session')).json()).toBeNull()
    expect((await page.request.get('/api/v1/account')).status()).toBe(401)
    expect(await database.collection('users').countDocuments({ email })).toBe(0)
    expect(await database.collection('credentials').countDocuments({ _id: email as never })).toBe(0)
    await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled()
    const correct = await pendingEmailCode(email, 'signup')
    await page
      .getByLabel('Email code', { exact: true })
      .fill(correct === '000000' ? '111111' : '000000')
    await page.getByRole('button', { name: 'Verify email and create account', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'invalid or expired' })).toBeVisible()
    expect(await database.collection('users').countDocuments({ email })).toBe(0)
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.getByLabel('Email code', { exact: true }).clear()
    await page.screenshot({
      path: 'docs/visual-qa/signup-verification/invalid-code-390.png',
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Edit signup details', exact: true }).click()
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(input.name)
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password)
    await page.getByLabel('Email address', { exact: true }).fill(nextEmail)
    await page.getByRole('button', { name: 'Send email code', exact: true }).click()
    await expect(page.getByLabel('Email code', { exact: true })).toBeVisible()
    await page
      .getByLabel('Email code', { exact: true })
      .fill(await pendingEmailCode(nextEmail, 'signup'))
    await page.getByRole('button', { name: 'Verify email and create account', exact: true }).click()
    await expect(page).toHaveURL('/account')
    await page.reload()
    const auth = await (await page.request.get('/api/v1/auth/session')).json()
    expect(auth.user.email).toBe(nextEmail)
    expect(auth.user.emailVerifiedAt).toBeTruthy()
    expect(auth.user.guardianVerified).toBeFalsy()
    expect(await database.collection('users').countDocuments({ email })).toBe(0)
    expect(errors).toEqual([])
  } finally {
    await client.close()
  }
})

test('signup reports unavailable email delivery without an account-creation action', async ({
  page,
}) => {
  await page.route('**/api/v1/config', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), emailEnabled: false } })
  })
  await page.goto('/signup')
  await expect(page.getByRole('status')).toContainText('Signup requires email verification')
  await expect(page.getByRole('button', { name: 'Send email code', exact: true })).toHaveCount(0)
})
