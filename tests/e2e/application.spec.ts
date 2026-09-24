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
  await mkdir('docs/visual-qa/english-only/application-compact', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: `docs/visual-qa/english-only/application-compact/${name}.png`,
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
}

test('compact step tabs save answers, support keyboard navigation and reflow with legacy language preferences', async ({
  page,
}) => {
  test.setTimeout(120000)
  await signup(page)
  await page.goto('/apply')
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(6)
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await page.getByLabel('City', { exact: true }).fill('Purnea')
  await tabs.nth(0).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2')
  await expect(page.getByLabel('Year completed')).toHaveValue('')
  await page.getByLabel('Highest completed qualification').fill('BSc')
  await page.getByLabel('Currently studying?').selectOption('yes')
  await expect(page.getByLabel('Expected completion month')).toBeVisible()
  await page.getByLabel('Year completed').fill('2020')
  await page.getByLabel('Year completed').clear()
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Highest completed qualification')).toHaveValue('BSc')
  await expect(page.getByLabel('Year completed')).toHaveValue('')
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  for (const language of ['en', 'hi']) {
    await page.evaluate((value) => localStorage.setItem('language', value), language)
    await page.reload()
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await expect(page.getByRole('tablist')).toBeVisible()
      if ([390, 1440].includes(width))
        await capture(page, `education-en-legacy-${language}-${width}`)
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await page.getByRole('tab').nth(0).click()
  await expect(page.locator('input[name="about.city"]')).toHaveValue('Purnea')
})
test('six steps persist home and online preferences with staff-only fees and private review', async ({
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
    if ([0, 2, 3, 5].includes(step)) {
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
  expect(stored.profile.fees.rates).toEqual([])
  expect(stored.fees).toBeNull()
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
test('stale drafts are preserved, mode-specific sections change, legacy language preference keeps review in English', async ({
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
  await expect(page.getByRole('heading', { name: 'Time & location' })).toBeVisible()
  await capture(page, 'step-4-en-mobile')
  await page.getByRole('tab').nth(5).click()
  await expect(page.getByRole('heading', { name: 'Check & submit' })).toBeVisible()
  await capture(page, 'review-en-mobile')
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
  await page.getByRole('tab').nth(5).click()
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

test('Teaching approach omits demo and worksheet controls and submits legacy recorded drafts', async ({
  page,
}) => {
  const account = await signup(page)
  const profile = applicationProfile('Fictional application tutor')
  profile.approach.demonstration = 'recorded'
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 0, step: 4, submit: false, profile },
      })
    ).status(),
  ).toBe(200)
  // Retain a historical private attachment, even when the old recorded draft
  // has no topic or assessment area and could not previously be submitted.
  const upload = await page.request.post(`/api/v1/applications/${account.user.id}/files`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': account.csrf,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { name: 'legacy-demo.mp4', content: demoContainer().toString('base64') },
  })
  expect(upload.status()).toBe(201)
  const file = await upload.json()
  profile.approach.demoFileId = file.id
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 1, step: 4, submit: false, profile },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  await expect(page.getByRole('heading', { name: 'Teaching approach', exact: true })).toBeVisible()
  await expect(page.locator('[name="approach.demonstration"]')).toHaveCount(0)
  await expect(page.locator('.af-attachment')).toHaveCount(0)
  await expect(page.locator('.af-fields textarea')).toHaveCount(3)
  await capture(page, 'approach-simplified-en-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.language-button')).toHaveCount(0)
  await capture(page, 'approach-simplified-en-mobile')
  await expect(page.locator('.language-button')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check & submit', exact: true })).toBeVisible()
  await expect(
    page.getByText('How would you like to give your demo?', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Sample worksheet (optional)', { exact: true })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Application received', exact: true }),
  ).toBeVisible()
  const stored = (await (await page.request.get('/api/v1/application')).json()).application
  expect(stored.profile.approach.demonstration).toBe('live')
  // Go clears the obsolete recorded-demo selection on the live path, but the
  // uploaded evidence remains in the application's private Documents collection.
  expect(stored.profile.approach.demoFileId).toBe('')
  const files = await (
    await page.request.get(`/api/v1/applications/${account.user.id}/files`)
  ).json()
  expect(files.items.some((item: { id: string }) => item.id === file.id)).toBe(true)
  expect(stored.profile.approach.introduction).toBe(profile.approach.introduction)
  expect(stored.profile.approach.assessmentSlots).toEqual(profile.approach.assessmentSlots)
  expect((await page.request.get(`/api/v1/files/${file.id}/download`)).status()).toBe(409)
})
