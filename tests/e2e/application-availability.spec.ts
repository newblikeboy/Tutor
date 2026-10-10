import { verifiedSignup } from './signup-fixture'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('Time & location only requests online setup for selected Online teaching areas', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `availability-${crypto.randomUUID()}@example.test`,
      password: 'Availability test passphrase 871!',
      name: 'Sample availability applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': auth.csrf }
  const profile = applicationProfile('Sample availability applicant')
  profile.about.location = {
    address: 'Line Bazar, Purnea, Bihar, India',
    locality: 'Line Bazar',
    city: 'Purnea',
    district: 'Purnea',
    state: 'Bihar',
    country: 'India',
    postalCode: '854301',
    latitude: 25.777,
    longitude: 87.475,
    accuracyMeters: 30,
    source: 'browser',
  }
  profile.teachingAreas[0].modes = ['home']
  profile.teachingAreas.push({ ...profile.teachingAreas[0], id: 'science', subject: 'Science' })
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: 0, step: 3, profile, submit: false },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  const onlineSetup = page.getByRole('group', { name: 'Online teaching setup', exact: true })
  const timeTab = page.getByRole('tab', { name: /Time & location/ })
  const areasTab = page.getByRole('tab', { name: /What you can teach/ })
  const next = page.getByRole('button', { name: 'Save & continue', exact: true })
  await mkdir('docs/visual-qa/application-availability', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await timeTab.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    for (const label of [
      'Hours available per week',
      'Additional students you can take',
      'How long can you teach with us?',
      'Planned breaks or leave (optional)',
      'Available until',
    ])
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(0)
    await expect(onlineSetup).toHaveCount(0)
    await next.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Teaching approach')
    await timeTab.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    await page.screenshot({
      path: `docs/visual-qa/application-availability/home-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await areasTab.click()
    await page.locator('.af-area').nth(1).getByLabel('Online', { exact: true }).check()
    await next.click()
    await expect(onlineSetup).toBeVisible()
    await next.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    for (const select of await onlineSetup.locator('select').all())
      await select.selectOption('need_help')
    await next.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Teaching approach')
    await timeTab.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    await page.reload()
    await expect(onlineSetup).toBeVisible()
    await expect(onlineSetup.getByLabel('Primary device')).toHaveValue('need_help')
    await page.screenshot({
      path: `docs/visual-qa/application-availability/online-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await areasTab.click()
    await page.locator('.af-area').nth(0).getByLabel('Online', { exact: true }).check()
    await page.locator('.af-area').nth(1).getByLabel('Online', { exact: true }).uncheck()
    await next.click()
    await expect(onlineSetup).toBeVisible()
    await areasTab.click()
    await page.locator('.af-area').nth(0).getByLabel('Online', { exact: true }).uncheck()
    await next.click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    await page.reload()
    await expect(onlineSetup).toHaveCount(0)
  }
  const saved = await (await page.request.get('/api/v1/application')).json()
  for (const field of ['weeklyHours', 'maxStudents', 'period', 'untilDate', 'interruptions'])
    expect(saved.application.profile.availability).not.toHaveProperty(field)
  expect(
    Object.values(saved.application.profile.availability.online).every((value) => value === ''),
  ).toBe(true)
  const submitted = await page.request.put('/api/v1/application', {
    headers,
    data: {
      version: saved.application.formVersion,
      step: 6,
      profile: saved.application.profile,
      submit: true,
    },
  })
  expect(submitted.status(), await submitted.text()).toBe(200)
  expect(errors).toEqual([])
})
