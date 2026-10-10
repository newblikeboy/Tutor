import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createDecipheriv, createHash } from 'node:crypto'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'

test('email login, recovery, verification and reminder settings on desktop and mobile', async ({
  page,
}) => {
  test.skip(process.env.E2E_EMAIL !== '1', 'Explicit isolated email test configuration required')
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const database = mongo.db(runtime.databaseName)
  const email = `email-${crypto.randomUUID()}@example.test`
  const code = async (purpose: string) => {
    const challenge = await database
      .collection('email_challenges')
      .findOne({ userId: userId, purpose }, { sort: { expiresAt: -1 } })
    expect(challenge).toBeTruthy()
    const job = await database
      .collection('outbox')
      .findOne({ _id: `email-code:${challenge!._id}` as never })
    const encrypted = Buffer.from(job!.payload.encryptedCode, 'base64')
    const decrypt = createDecipheriv('aes-256-gcm', Buffer.alloc(32), encrypted.subarray(0, 12))
    decrypt.setAAD(Buffer.from(String(challenge!._id)))
    decrypt.setAuthTag(encrypted.subarray(-16))
    return Buffer.concat([decrypt.update(encrypted.subarray(12, -16)), decrypt.final()]).toString()
  }
  const created = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: { name: 'Fictional email family', email, password, role: 'parent', adult: true },
  })
  expect(created.status()).toBe(201)
  const auth = await created.json()
  const userId = auth.user.id
  const logout = async (csrf: string) => {
    expect(
      (
        await page.request.post('/api/v1/auth/logout', {
          headers: { Origin: origin, 'X-CSRF-Token': csrf },
          data: {},
        })
      ).ok(),
    ).toBe(true)
  }
  await mkdir('docs/visual-qa/email', { recursive: true })
  try {
    await page.goto('/account')
    await page.getByRole('button', { name: 'Verify email address', exact: true }).click()
    await page.getByRole('button', { name: 'Send email code', exact: true }).click()
    await expect(page.getByLabel('Email code', { exact: true })).toBeVisible()
    await page.getByLabel('Email code', { exact: true }).fill(await code('verify'))
    await page.getByRole('button', { name: 'Verify email', exact: true }).click()
    await expect(page.getByText(/Email verified on/)).toBeVisible()
    await page.getByRole('button', { name: 'Turn reminders off' }).click()
    await expect(page.getByText('Reminder emails are off.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Reminder emails are off.')).toBeVisible()
    await page.screenshot({ path: 'docs/visual-qa/email/account-1440.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'docs/visual-qa/email/account-390.png', fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await logout(auth.csrf)
    await page.goto('http://localhost:5174/login?role=parent&method=otp&return=%2Faccount')
    await expect(page).toHaveURL('http://127.0.0.1:5174/login?role=parent&method=otp&return=%2Faccount')
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send email code', exact: true }).click()
    await expect(page.getByLabel('Email code', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'docs/visual-qa/email/login-code-390.png', fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'docs/visual-qa/email/login-code-1440.png', fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByLabel('Email code', { exact: true }).fill(await code('login'))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/)
    const session = await (await page.request.get('/api/v1/auth/session')).json()
    await logout(session.csrf)
    // Reset only this fictional address's minute counter between independent UI flows.
    // Go integration tests separately exercise the real cooldown and attempt limits.
    const minute = Math.floor(Date.now() / 60_000)
    for (const bucket of [minute, minute - 1]) {
      const id = createHash('sha256')
        .update(`email-request:address:${email}${bucket}`)
        .digest('hex')
      await database
        .collection('rate_limits')
        .updateOne({ _id: id as never }, { $set: { count: 0 } })
    }
    await page.goto('/login?role=parent&method=recover')
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send email code', exact: true }).click()
    await expect(page.getByLabel('Email code', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'docs/visual-qa/email/recovery-1440.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'docs/visual-qa/email/recovery-390.png', fullPage: true })
    const next = 'Updated E2E-only learning passphrase 925!'
    await page.getByLabel('Email code', { exact: true }).fill(await code('reset'))
    await page.getByLabel('New password', { exact: true }).fill(next)
    await page.getByLabel('Confirm new password', { exact: true }).fill(next)
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible()
    await page.getByRole('link', { name: 'Sign in with password', exact: true }).click()
    await page.getByRole('link', { name: 'Use email code', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Send email code', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Sign in with password', exact: true }).click()
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(next)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/workspace$/)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const current = await (await page.request.get('/api/v1/auth/session')).json()
    await logout(current.csrf)
    const admin = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'admin-a@example.test', password },
    })
    expect(admin.ok()).toBe(true)
    await database
      .collection('outbox')
      .insertOne({
        _id: 'email:fictional-uncertain-review' as never,
        kind: 'email',
        status: 'uncertain',
        payload: { event: 'password_changed', recipientId: userId },
        attempts: 1,
        availableAt: new Date(),
        lastError: 'smtp_acceptance_uncertain',
        smtpSubmissionStarted: true,
      })
    await page.goto('/account?tab=mail')
    await expect(
      page.getByRole('heading', { name: 'Email delivery log', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Review retry', exact: true }).click()
    await expect(
      page.getByText('The SMTP acknowledgement was lost. This email may already have arrived.'),
    ).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'docs/visual-qa/email/delivery-log-1440.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'docs/visual-qa/email/delivery-log-390.png', fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByLabel('I understand a retry may send a duplicate.').check()
    await page
      .getByLabel('Reason for retry', { exact: true })
      .fill('Fictional delivery reviewed with recipient.')
    await page.getByRole('button', { name: 'Retry email', exact: true }).click()
    await expect(
      page.getByText('The SMTP acknowledgement was lost. This email may already have arrived.'),
    ).not.toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await mongo.close()
  }
})
