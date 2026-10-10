import { verifiedSignup } from './signup-fixture'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('About you saves private WhatsApp and clearly groups home-location autofill', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  const origin = 'http://127.0.0.1:5174'
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      email: `about-${crypto.randomUUID()}@example.test`,
      password: 'Application test passphrase 827!',
      name: 'Sample about applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const profile = applicationProfile('Sample about applicant')
  delete profile.about.whatsapp // Existing drafts predate the new optional field.
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: 0, step: 0, profile, submit: false },
      })
    ).status(),
  ).toBe(200)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 25.77, longitude: 87.47, accuracy: 30 })
  let failLookup = false
  let lookups = 0
  const location = {
    address: 'Sample home, Purnea, Bihar 854301, India',
    locality: 'Sample home',
    city: 'Purnea',
    district: 'Purnea',
    state: 'Bihar',
    country: 'India',
    postalCode: '854301',
    latitude: 25.77,
    longitude: 87.47,
    accuracyMeters: 30,
    source: 'browser',
    location: 'Sample home, Purnea, Bihar, India',
    primary: 'Sample home',
    secondary: 'Purnea, Bihar, India',
  }
  await page.route('**/api/v1/location/reverse?**', async (route) => {
    lookups++
    const query = new URL(route.request().url()).searchParams
    expect(query.get('latitude')).toBe('25.77')
    expect(query.get('longitude')).toBe('87.47')
    await route.fulfill({
      status: failLookup ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        failLookup
          ? { code: 'location_unavailable', message: 'Address lookup unavailable' }
          : location,
      ),
    })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/apply')
  const whatsapp = page.getByLabel('WhatsApp number (optional)', { exact: true })
  const home = page.getByRole('group', { name: 'What is your Home Location', exact: true })
  await expect(whatsapp).toHaveValue('')
  await expect(home).toContainText('autofill your address with Google Maps')
  await whatsapp.fill('123')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(whatsapp).toHaveAttribute('aria-invalid', 'true')
  await whatsapp.fill('+91 98765-43210')
  await home.getByRole('button', { name: 'Use current location', exact: true }).click()
  await expect(home.getByLabel('Home address', { exact: true })).toHaveValue(location.address)
  for (const [label, value] of [
    ['State', 'Bihar'],
    ['District', 'Purnea'],
    ['City', 'Purnea'],
    ['Location', 'Sample home'],
    ['PIN code', '854301'],
  ]) {
    await expect(home.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/application') &&
      r.request().method() === 'PUT' &&
      r.status() === 200,
  )
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await saved
  await page.reload()
  await expect(whatsapp).toHaveValue('+919876543210')
  await expect(home.getByLabel('Home address', { exact: true })).toHaveValue(location.address)
  const stored = (await (await page.request.get('/api/v1/application')).json()).application
  expect(stored.profile.about.whatsapp).toBe('+919876543210')
  expect(stored.profile.about.location.address).toBe(location.address)
  await mkdir('docs/visual-qa/application-about', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({
      path: `docs/visual-qa/application-about/about-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  failLookup = true
  await home.getByRole('button', { name: 'Change location', exact: true }).click()
  await home.getByRole('button', { name: 'Use current location again', exact: true }).click()
  await expect(home.getByRole('status')).toContainText('could not be retrieved')
  await expect(home.getByLabel('Home address', { exact: true })).toHaveValue(location.address)
  const beforeDenied = lookups
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) =>
      error?.({
        code: 1,
        message: 'Denied for test',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
  })
  await home.getByRole('button', { name: 'Use current location again', exact: true }).click()
  await expect(home.getByRole('status')).toContainText('permission')
  expect(lookups).toBe(beforeDenied)
  await expect(home.getByLabel('Home address', { exact: true })).toHaveValue(location.address)
  await whatsapp.fill('')
  const cleared = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/application') &&
      r.request().method() === 'PUT' &&
      r.status() === 200,
  )
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await cleared
  await page.reload()
  await expect(whatsapp).toHaveValue('')
  expect(errors).toEqual([])
})
