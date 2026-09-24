import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile, fillApplication } from './helpers/application'
const origin = 'http://127.0.0.1:5174'
function demoContainer() {
  const box = (kind: string, bytes: Buffer) => {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(bytes.length + 8)
    header.write(kind, 4)
    return Buffer.concat([header, bytes])
  }
  return Buffer.concat([
    box(
      'ftyp',
      Buffer.from([105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 50]),
    ),
    box('moov', Buffer.alloc(4)),
    box('mdat', Buffer.alloc(32)),
  ])
}
async function signup(page: Page) {
  const email = `application-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email,
      password: 'Application test passphrase 843!',
      name: 'Fictional application tutor',
      role: 'tutor',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/product-ux/application', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: `docs/visual-qa/product-ux/application/${name}.png`,
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
}
test('seven steps persist home and online preferences, fees and private staff review', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const account = await signup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/apply')
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
    'Fictional application tutor',
  )
  await expect(page.getByLabel('Account email')).toHaveAttribute('readonly', '')
  await fillApplication(page, 'Fictional application tutor', async (step) => {
    await capture(page, `step-${step + 1}-en-desktop`)
    if ([0, 2, 3, 6].includes(step)) {
      await page.setViewportSize({ width: 390, height: 844 })
      await capture(page, `step-${step + 1}-en-mobile`)
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    if (step === 3) {
      await page.getByRole('button', { name: 'Save draft', exact: true }).click()
      await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByLabel('Service localities')).toHaveValue('Line Bazar\nBhatta Bazar')
      await expect(page.getByLabel('Primary device')).toHaveValue('laptop')
    }
  })
  const response = await page.request.get('/api/v1/application'),
    stored = (await response.json()).application
  expect(stored.profile.teachingAreas[0].modes).toEqual(['home', 'online'])
  expect(stored.profile.fees.rates.map((r: { amountPaise: number }) => r.amountPaise)).toEqual([
    50000, 40000,
  ])
  expect(stored.submission.marketing).toBe(false)
  expect(stored.scope.mode).toBe('')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()
  expect(JSON.stringify(await (await page.request.get('/api/v1/tutors')).json())).not.toContain(
    account.user.id,
  )
  const staff = await browser.newContext({ baseURL: origin })
  const review = await staff.newPage()
  try {
    expect(
      (
        await review.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: { email: 'admin-a@example.test', password: 'E2E-only learning passphrase 426!' },
        })
      ).status(),
    ).toBe(200)
    await review.goto(`/workspace?view=applications&mode=home&application=${account.user.id}`)
    await expect(review.getByText('9876543210', { exact: true })).toBeVisible()
    await expect(review.getByText('Home Tuition, Online', { exact: true })).toBeVisible()
    await expect(review.getByText('Line Bazar, Bhatta Bazar', { exact: true })).toBeVisible()
    await capture(review, 'staff-full-application')
  } finally {
    await staff.close()
  }
  expect(errors).toEqual([])
})
test('stale drafts are preserved, mode-specific sections change, Hindi review remains accessible', async ({
  page,
  context,
}) => {
  test.setTimeout(120000)
  const account = await signup(page),
    p = applicationProfile('Fictional application tutor')
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 0, step: 2, submit: false, profile: p },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  const other = await context.newPage()
  await other.goto('/apply')
  await expect(other.getByLabel('Home Tuition', { exact: true })).toBeChecked()
  await page.getByLabel('Home Tuition', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save & continue' }).click()
  await expect(page.getByRole('heading', { name: 'Time & location' })).toBeVisible()
  await expect(page.getByText('At the student’s home', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Primary device')).toHaveValue('laptop')
  await other.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(other.getByRole('alert')).toBeVisible()
  expect(
    (await (await page.request.get('/api/v1/application')).json()).application.profile
      .teachingAreas[0].modes,
  ).toEqual(['online'])
  await other.close()
  await page.evaluate(() => localStorage.setItem('language', 'hi'))
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'समय और जगह' })).toBeVisible()
  await capture(page, 'step-4-hi-mobile')
  await page.locator('.af-mobile-section select').selectOption('6')
  await expect(page.getByRole('heading', { name: 'जाँचें और जमा करें' })).toBeVisible()
  await capture(page, 'review-hi-mobile')
})

test('locality submission errors are visible and blank lines do not block a corrected application', async ({
  page,
}) => {
  const account = await signup(page)
  const profile = applicationProfile('Fictional application tutor')
  profile.availability.home.localities = ['L']
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 0, step: 6, submit: false, profile },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/application') && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  expect((await rejected).status()).toBe(422)
  await expect(page.getByRole('heading', { name: 'Time & location', exact: true })).toBeVisible()
  const localities = page.getByLabel('Service localities')
  await expect(localities).toHaveValue('L')
  await expect(localities).toHaveAttribute('aria-invalid', 'true')
  await expect(localities).toHaveAccessibleDescription(
    'Enter 1–12 localities, with 2–100 characters per line.',
  )
  await capture(page, '422-localities-en-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, '422-localities-en-mobile')
  // Whitespace alone still needs a locality, and is caught before leaving this step.
  await localities.fill('  \n\t ')
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(localities).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('heading', { name: 'Time & location', exact: true })).toBeVisible()
  await localities.fill('\n  Line Bazar  \n\n Bhatta Bazar \n\t\n')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(localities).toHaveValue('Line Bazar\nBhatta Bazar')
  await page.locator('.af-mobile-section select').selectOption('6')
  await expect(page.getByRole('heading', { name: 'Check & submit', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Application received', exact: true }),
  ).toBeVisible()
  const stored = (await (await page.request.get('/api/v1/application')).json()).application
  expect(stored.status).toBe('submitted')
  expect(stored.profile.availability.home.localities).toEqual(['Line Bazar', 'Bhatta Bazar'])
  expect(stored.profile.teachingAreas[0].modes).toEqual(['home', 'online'])
  expect(stored.profile.fees.rates).toEqual(profile.fees.rates)
})

test('recorded demo is saved privately and linked without overwriting the draft revision', async ({
  page,
}) => {
  const account = await signup(page),
    profile = applicationProfile('Fictional application tutor')
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 0, step: 4, submit: false, profile },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  await page.getByLabel('Demonstration preference').selectOption('recorded')
  await page.getByLabel('Demonstration teaching area').selectOption('math')
  await page.getByLabel('Demonstration topic').fill('Equivalent fractions')
  // A synthetic container exercises framing/quarantine, never claims to be playable or scanned.
  const section = page
    .locator('.af-attachment')
    .filter({ has: page.getByLabel('Video introduction', { exact: true }) })
  await section.getByLabel('Video introduction', { exact: true }).setInputFiles({
    name: 'fictional-container.mp4',
    mimeType: 'video/mp4',
    buffer: demoContainer(),
  })
  await section.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(section.getByRole('status')).toContainText('File saved privately')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Demonstration topic')).toHaveValue('Equivalent fractions')
  await expect(page.getByText('fictional-container.mp4', { exact: false })).toBeVisible()
  const stored = (await (await page.request.get('/api/v1/application')).json()).application
  expect(stored.profile.approach.demoFileId).toBeTruthy()
  expect(
    (
      await page.request.get(`/api/v1/files/${stored.profile.approach.demoFileId}/download`)
    ).status(),
  ).toBe(409)
  expect(stored.formVersion).toBe(4)
})
