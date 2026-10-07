import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('teaching areas save, reload and submit without an assessment priority', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `areas-${crypto.randomUUID()}@example.test`,
      password: 'Teaching areas test 871!',
      name: 'Sample teaching applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': auth.csrf }
  const profile = applicationProfile('Sample teaching applicant')
  profile.teachingAreas[0].modes = ['online']
  profile.teachingAreas.unshift({ ...profile.teachingAreas[0], id: 'science', subject: 'Science' })
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: 0, step: 2, profile, submit: false },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  await mkdir('docs/visual-qa/application-teaching-areas', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('tab', { name: /What you can teach/ }).click()
    await expect(page.getByLabel('Subject to assess first')).toHaveCount(0)
    await expect(page.locator('.af-area')).toHaveCount(2)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/application-teaching-areas/areas-${width}.png`,
      fullPage: true,
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
    await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
    await page.reload()
    const current = await (await page.request.get('/api/v1/application')).json()
    expect(current.application.profile.teachingAreas).toHaveLength(2)
    expect(current.application.profile).not.toHaveProperty('firstAreaId')
  }
  await page.getByRole('tab', { name: /What you can teach/ }).click()
  await page.locator('.af-area').first().getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(page.locator('.af-card-heading h2')).toHaveText('Time & location')
  const saved = await (await page.request.get('/api/v1/application')).json()
  expect(
    saved.application.profile.teachingAreas.map((area: { subject: string }) => area.subject),
  ).toEqual(['Mathematics'])
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
