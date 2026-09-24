import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('new tutor sees application stages first and teaching routes stay locked until approval', async ({
  page,
  browser,
}) => {
  const origin = 'http://127.0.0.1:5174'
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email: `onboarding-${Date.now()}@example.test`,
      password: 'Onboarding fixture password 426!',
      role: 'tutor',
      name: 'Fictional new applicant',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  await page.goto('/workspace?view=sessions')
  await expect(page).toHaveURL(/\/apply$/)
  await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Application stages' })).toHaveCount(0)
  await expect(page.locator('.af-progress ol button')).toHaveCount(7)
  const nav = page.locator('.desk-sidebar nav')
  await expect(nav.getByRole('link', { name: 'My application', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Trial lessons', exact: true })).toHaveCount(0)
  await expect(nav.locator('a[href="/tuition"]')).toHaveCount(0)
  await expect(nav.locator('a[href="/availability"]')).toHaveCount(0)
  expect((await page.request.get('/api/v1/enrollments')).status()).toBe(403)
  await mkdir('docs/visual-qa/product-ux/recruitment', { recursive: true })
  await page.screenshot({
    path: 'docs/visual-qa/product-ux/recruitment/applicant-en-desktop.png',
    fullPage: true,
  })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.af-progress ol')).toBeHidden()
  await expect(page.getByLabel('Application section', { exact: true })).toBeVisible()
  expect((await page.getByLabel('Full name', { exact: true }).boundingBox())!.y).toBeLessThan(450)
  await page.locator('.language-button').click()
  await page.screenshot({
    path: 'docs/visual-qa/product-ux/recruitment/applicant-hi-mobile.png',
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.locator('.language-button').click()
  await page.goto('/tuition')
  await expect(page).toHaveURL(/\/apply$/)
  const profile = applicationProfile('Fictional new applicant')
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
        data: { version: 0, step: 6, submit: true, profile },
      })
    ).status(),
  ).toBe(200)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()
  await expect(page.locator('.af-journey [aria-current="step"]')).toHaveText('2Staff review')
  await page.screenshot({
    path: 'docs/visual-qa/product-ux/recruitment/submitted-en-mobile.png',
    fullPage: true,
  })
  const approvedContext = await browser.newContext({ baseURL: origin })
  try {
    const approved = await approvedContext.newPage()
    expect(
      (
        await approved.request.post('/api/v1/auth/login', {
          headers: { Origin: origin },
          data: {
            email: 'tutor-meera@example.test',
            password: 'E2E-only learning passphrase 426!',
          },
        })
      ).status(),
    ).toBe(200)
    await approved.goto('/workspace')
    await expect(approved).toHaveURL(/\/workspace$/)
    await expect(
      approved.locator('.desk-sidebar').getByRole('link', { name: 'Trial lessons', exact: true }),
    ).toBeVisible()
    await expect(approved.locator('.desk-sidebar a[href="/availability"]')).toBeVisible()
    expect((await approved.request.get('/api/v1/enrollments')).status()).toBe(200)
  } finally {
    await approvedContext.close()
  }
})
