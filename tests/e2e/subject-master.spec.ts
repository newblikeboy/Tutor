import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { verifiedSignup } from './signup-fixture'
import { emptyApplication, newArea } from '../../apps/web/src/lib/application'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/subject-master', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/subject-master/${name}-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('admin subject master controls shared dropdowns without rewriting saved references', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const suffix = crypto.randomUUID().slice(0, 8)
  const canonical = `Computing ${suffix}`,
    renamed = `Computer studies ${suffix}`
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'admin-a@example.test', password },
  })
  expect(login.status()).toBe(200)
  const csrf = (await login.json()).csrf
  await page.goto('/subjects')
  await expect(page.getByRole('heading', { name: 'Subject master', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add subject', exact: true }).click()
  await expect(page.getByLabel('Subject name', { exact: true })).toBeFocused()
  await page.getByLabel('Subject name', { exact: true }).fill(canonical)
  await page.getByLabel('Display order', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save subject', exact: true }).click()
  await expect(page.getByRole('table')).toContainText(canonical)
  await page.reload()
  const row = () => page.getByRole('row').filter({ hasText: canonical })
  await row()
    .getByRole('button', { name: `Edit ${canonical}`, exact: true })
    .click()
  await page.getByLabel('Subject name', { exact: true }).fill(renamed)
  await page.getByRole('button', { name: 'Save subject', exact: true }).click()
  await expect(row()).toContainText(renamed)
  await expect(row()).toContainText(`Original reference: ${canonical}`)
  await capture(page, 'master-renamed')
  await page.goto('/study?material=new')
  await expect(page.getByLabel('Subject', { exact: true })).toHaveJSProperty('tagName', 'SELECT')
  await page.getByLabel('Title', { exact: true }).fill(`Fictional computing notes ${suffix}`)
  await page.getByLabel('Resource type', { exact: true }).selectOption('notes')
  await page.getByLabel('Class', { exact: true }).selectOption('8')
  await page.getByLabel('Subject', { exact: true }).selectOption({ label: renamed })
  await capture(page, 'resource-dropdown')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/admin/study-materials') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  const response = await saved
  expect(response.status(), await response.text()).toBe(201)
  const material = await response.json()
  expect(material.subject).toBe(canonical)
  await expect(page.getByRole('heading', { name: 'Edit resource', exact: true })).toBeVisible()

  const parent = await browser.newContext({ baseURL: origin })
  const tutor = await browser.newContext({ baseURL: origin })
  try {
    const signupParent = await verifiedSignup(parent.request, {
      headers: { Origin: origin },
      data: {
        email: `subjects-parent-${suffix}@example.test`,
        password,
        name: 'Fictional catalog family',
        role: 'parent',
        adult: true,
      },
    })
    expect(signupParent.status()).toBe(201)
    const parentCSRF = (await signupParent.json()).csrf
    const learner = await parent.request.post('/api/v1/learners', {
      headers: {
        Origin: origin,
        'X-CSRF-Token': parentCSRF,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: {
        name: 'Fictional catalog student',
        class: 8,
        board: 'CBSE',
        language: 'English',
        kind: 'adult_self',
      },
    })
    expect(learner.status()).toBe(201)
    const learnerId = (await learner.json()).id
    const parentPage = await parent.newPage()
    parentPage.on('pageerror', (error) => errors.push(error.message))
    await parentPage.goto(`/match?learner=${learnerId}`)
    await parentPage.locator('.subject-select summary').click()
    await expect(parentPage.getByRole('checkbox', { name: renamed, exact: true })).toBeVisible()
    await parentPage.close()
    expect(
      (
        await parent.request.post('/api/v1/admin/subjects', {
          headers: { Origin: origin, 'X-CSRF-Token': parentCSRF },
          data: { name: 'Forbidden subject', active: true, sortOrder: 9, expectedVersion: 0 },
        })
      ).status(),
    ).toBe(403)
    const signupTutor = await verifiedSignup(tutor.request, {
      headers: { Origin: origin },
      data: {
        email: `subjects-tutor-${suffix}@example.test`,
        password,
        name: 'Fictional catalog applicant',
        role: 'tutor',
        adult: true,
      },
    })
    expect(signupTutor.status()).toBe(201)
    const tutorCSRF = (await signupTutor.json()).csrf
    const own = await (await tutor.request.get('/api/v1/application')).json()
    const profile = emptyApplication('Fictional catalog applicant', own.noticeVersion)
    profile.teachingAreas = [{ ...newArea(), minClass: 6, maxClass: 10 }]
    const headers = { Origin: origin, 'X-CSRF-Token': tutorCSRF }
    expect(
      (
        await tutor.request.put('/api/v1/application', {
          headers,
          data: { version: 0, step: 2, submit: false, profile },
        })
      ).status(),
    ).toBe(200)
    const tutorPage = await tutor.newPage()
    tutorPage.on('pageerror', (error) => errors.push(error.message))
    tutorPage.on('dialog', (dialog) => dialog.accept())
    await tutorPage.goto('/apply')
    await expect(
      tutorPage
        .getByLabel('Subject', { exact: true })
        .getByRole('option', { name: renamed, exact: true }),
    ).toHaveCount(1)
    await tutorPage.getByLabel('Subject', { exact: true }).selectOption(canonical)
    profile.teachingAreas[0].subject = canonical
    expect(
      (
        await tutor.request.put('/api/v1/application', {
          headers,
          data: { version: 1, step: 2, submit: false, profile },
        })
      ).status(),
    ).toBe(200)
    await tutorPage.reload()
    await expect(tutorPage.getByLabel('Subject', { exact: true })).toHaveValue(canonical)
    await capture(tutorPage, 'application-dropdown')

    await page.goto('/subjects')
    await row()
      .getByRole('button', { name: `Edit ${renamed}`, exact: true })
      .click()
    await page.getByLabel('Available for new selections').uncheck()
    await page.getByRole('button', { name: 'Save subject', exact: true }).click()
    await expect(row()).toContainText('Inactive')
    await capture(page, 'master-inactive')
    expect(
      (
        await parent.request.get(`/api/v1/tutors?subject=${encodeURIComponent(canonical)}`)
      ).status(),
    ).toBe(409)
    await tutorPage.reload()
    await expect(
      tutorPage.getByLabel('Subject', { exact: true }).locator('option:checked'),
    ).toContainText('Inactive')
    await page.goto(`/study?material=${material.id}`)
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(canonical)
    await expect(
      page.getByLabel('Subject', { exact: true }).locator('option:checked'),
    ).toContainText('Unavailable')
    expect(
      (await (await page.request.get(`/api/v1/admin/study-materials/${material.id}`)).json())
        .subject,
    ).toBe(canonical)
    await page.goto('/subjects')
    await row()
      .getByRole('button', { name: `Edit ${renamed}`, exact: true })
      .click()
    await page.getByLabel('Available for new selections').check()
    await page.getByRole('button', { name: 'Save subject', exact: true }).click()
    await expect(row().getByText('Active', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Add subject', exact: true }).click()
    await page.getByLabel('Subject name', { exact: true }).fill(renamed.toLowerCase())
    await page.getByRole('button', { name: 'Save subject', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('already in use')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    const protectedRow = page.getByRole('row').filter({ hasText: 'Classes 1–5 package' })
    await protectedRow.getByRole('button', { name: 'Edit All Subjects', exact: true }).click()
    await expect(page.getByLabel('Subject name', { exact: true })).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Available for new selections')).toBeDisabled()
    expect(
      (
        await page.request.put('/api/v1/admin/subjects/All%20Subjects', {
          headers: { Origin: origin, 'X-CSRF-Token': csrf },
          data: { name: 'All Subjects', active: false, sortOrder: 0, expectedVersion: 1 },
        })
      ).status(),
    ).toBe(409)
    expect(errors).toEqual([])
  } finally {
    await parent.close()
    await tutor.close()
  }
})
