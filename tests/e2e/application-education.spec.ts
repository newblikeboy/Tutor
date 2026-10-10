import { verifiedSignup } from './signup-fixture'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('education documents preview, upload and persist JPG and PDF originals', async ({ page }) => {
  test.skip(process.env.E2E_CLOUDINARY !== '1', 'Requires local Cloudinary protocol fixture')
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `education-${crypto.randomUUID()}@example.test`,
      password: 'Education test passphrase 873!',
      name: 'Sample education applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': auth.csrf }
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: {
          version: 0,
          step: 1,
          profile: applicationProfile('Sample education applicant'),
          submit: false,
        },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  await page.getByRole('tab', { name: /Education/ }).click()
  await expect(
    page.getByLabel('From Which Institution/University/College', { exact: true }),
  ).toHaveValue('Fictional test college')
  await expect(page.getByLabel('Completion Year', { exact: true })).toHaveValue('2020')
  const jpg = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 1000
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fffefa'
      ctx.fillRect(0, 0, 1600, 1000)
      ctx.fillStyle = '#15353b'
      ctx.font = '70px sans-serif'
      ctx.fillText('Sample qualification document', 70, 150)
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    }),
    'base64',
  )
  // Small valid one-page PDF; fixtures contain no real qualification or identity.
  const stream = 'BT /F1 16 Tf 40 100 Td (Sample qualification document) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdfText = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdfText.length)
    pdfText += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdfText.length
  pdfText += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const pdf = Buffer.from(pdfText)
  const fixtures = [
    { name: 'sample-resume.jpg', mimeType: 'image/jpeg', buffer: jpg },
    { name: 'sample-resume.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]
  const resumeInput = page.getByLabel('Resume (optional)', { exact: true })
  const resume = page.locator('.af-attachment').filter({ has: resumeInput })
  for (const fixture of fixtures) {
    await resumeInput.setInputFiles(fixture)
    if (fixture.mimeType === 'image/jpeg')
      await expect(resume.getByRole('img', { name: 'Selected image preview' })).toBeVisible()
    else await expect(resume.locator('.upload-local-preview')).toContainText('PDF document')
    await expect(resume.locator('.upload-local-preview')).toContainText('not saved yet')
    await resume.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(resume.locator('.af-attachment-list')).toContainText(fixture.name)
    await expect(resume.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
    await expect(resume.locator('.upload-feedback')).toHaveCount(0)
    const href = await resume.getByRole('link', { name: 'View file' }).getAttribute('href')
    const original = await page.request.get(href!)
    expect(original.status()).toBe(200)
    expect(await original.body()).toEqual(fixture.buffer)
    await page.reload()
    await expect(resume.locator('.af-attachment-list')).toContainText(fixture.name)
  }
  const qualificationInput = page.getByLabel('Educational documents (optional)', { exact: true })
  const qualification = page.locator('.af-attachment').filter({ has: qualificationInput })
  const qualifications = fixtures.map((f) => ({
    ...f,
    name: f.name.replace('resume', 'qualification'),
  }))
  await qualificationInput.setInputFiles(qualifications)
  await expect(qualification.locator('.upload-local-preview')).toHaveCount(2)
  await qualification.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(qualification.locator('.af-attachment-list li')).toHaveCount(2)
  await expect(qualification.locator('.upload-feedback')).toHaveCount(0)
  await page.reload()
  await expect(qualification.locator('.af-attachment-list li')).toHaveCount(2)
  for (const fixture of qualifications) {
    const item = qualification.locator('li').filter({ hasText: fixture.name })
    const href = await item.getByRole('link', { name: 'View file' }).getAttribute('href')
    expect(await (await page.request.get(href!)).body()).toEqual(fixture.buffer)
  }
  // Original JPG dimensions survive upload; profile-photo resizing is not used for evidence.
  await expect
    .poll(() =>
      qualification
        .getByRole('img', { name: 'sample-qualification.jpg' })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1600)
  const stored = (await (await page.request.get('/api/v1/application')).json()).application
  expect(stored.profile.education.educationFileIds).toHaveLength(2)
  expect(stored.profile.education.resumeFileId).toBeTruthy()
  let intents = 0
  page.on('request', (r) => {
    if (r.url().includes('/files/upload-intent')) intents++
  })
  await resumeInput.setInputFiles({
    name: 'unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Unsupported document'),
  })
  await resume.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(resume.getByRole('alert')).toContainText('valid JPEG, PNG or PDF')
  expect(intents).toBe(0)
  await resumeInput.setInputFiles([])
  await mkdir('docs/visual-qa/application-education', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({
      path: `docs/visual-qa/application-education/education-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
