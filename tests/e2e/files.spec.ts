import { applicationProfile } from './helpers/application'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
test.use({ actionTimeout: 12000 })
test('private application evidence persists in quarantine and never grants approval or download', async ({
  page,
}) => {
  test.setTimeout(120000)
  const origin = 'http://127.0.0.1:5174',
    email = `files-${Date.now()}@example.test`
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email,
      password: 'Files browser passphrase 873!',
      name: 'Fictional document applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
        data: {
          version: 0,
          step: 1,
          profile: applicationProfile('Fictional document applicant'),
          submit: false,
        },
      })
    ).status(),
  ).toBe(200)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/apply')
  const attachment = page
    .locator('.af-attachment')
    .filter({ has: page.getByLabel('Résumé (optional)', { exact: true }) })
  await page.getByLabel('Résumé (optional)', { exact: true }).setInputFiles({
    name: 'sample-teaching-evidence.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF'),
  })
  await attachment.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(attachment.getByRole('status')).toContainText('File saved privately')
  const education = page
    .locator('.af-attachment')
    .filter({ has: page.getByLabel('Education documents', { exact: true }) })
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Education documents', { exact: true }).setInputFiles([
    {
      name: 'sample-degree.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% Fictional degree\n%%EOF'),
    },
    {
      name: 'sample-marksheet.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    },
  ])
  await education.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/v1/application')).json()).application.profile.education
          .educationFileIds.length,
    )
    .toBe(2)
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  await page.reload()
  await expect(attachment.getByRole('status')).toContainText('sample-teaching-evidence.pdf')
  await expect(education.getByRole('status')).toHaveCount(2)
  await expect(education).toContainText('sample-degree.pdf')
  await expect(education).toContainText('sample-marksheet.png')
  await education.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'docs/visual-qa/application-documents/education-en-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.language-button').click()
  await page.getByLabel('शिक्षा के दस्तावेज़', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'docs/visual-qa/application-documents/education-hi-mobile.png',
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.locator('.language-button').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Résumé (optional)', { exact: true }).setInputFiles({
    name: 'unsafe.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<html>not a pdf</html>'),
  })
  await attachment.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(attachment.getByRole('alert')).toBeVisible()
  const draft = (await (await page.request.get('/api/v1/application')).json()).application
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
        data: { version: draft.formVersion, step: 6, profile: draft.profile, submit: true },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply?tab=documents')
  await expect(page.getByRole('heading', { name: 'Private files', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'sample-teaching-evidence.pdf', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Awaiting safety check', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Download file', exact: true })).toHaveCount(0)
  const response = await page.request.get(`/api/v1/applications/${auth.user.id}/files`)
  expect(response.status()).toBe(200)
  const files = await response.json()
  expect(files.items).toHaveLength(3)
  expect((await page.request.get(`/api/v1/files/${files.items[0].id}/download`)).status()).toBe(409)
  expect((await page.request.get(`/api/v1/tutors/${auth.user.id}`)).status()).toBe(404)
  await page.reload()
  await expect(page.getByText('Awaiting safety check', { exact: true })).toHaveCount(3)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: 'docs/visual-qa/product-ux/private-files-en-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.language-button').click()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: 'docs/visual-qa/product-ux/private-files-hi-mobile.png',
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  expect(
    (await (await page.request.get(`/api/v1/applications/${auth.user.id}/files`)).json()).items,
  ).toHaveLength(3)
  await page.locator('.language-button').click()
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email: 'admin-a@example.test', password: 'E2E-only learning passphrase 426!' },
      })
    ).status(),
  ).toBe(200)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/workspace?view=applications&application=${auth.user.id}&tab=documents`)
  for (const name of [
    'sample-teaching-evidence.pdf',
    'sample-degree.pdf',
    'sample-marksheet.png',
  ]) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Download file', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: 'docs/visual-qa/application-documents/staff-documents-en-desktop.png',
    fullPage: true,
  })
})
