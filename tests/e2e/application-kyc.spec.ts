import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { verifiedSignup } from './signup-fixture'
import { applicationProfile } from './helpers/application'

const origin = 'http://127.0.0.1:5174'
async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await mkdir('docs/visual-qa/application-kyc', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/application-kyc/${name}.png`, fullPage: true })
}

test('required private KYC and named certificates persist before application submission', async ({
  page,
  browser,
}) => {
  test.skip(process.env.E2E_CLOUDINARY !== '1', 'Uses the local Cloudinary protocol fixture')
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional KYC applicant',
      email: `kyc-${crypto.randomUUID()}@example.test`,
      password: 'KYC test passphrase 426!',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const account = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': account.csrf }
  const profile = applicationProfile('Fictional KYC applicant')
  profile.about.location = {
    address: 'Fictional home, Purnea, Bihar, India',
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
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: 0, step: 0, profile, submit: false },
      })
    ).status(),
  ).toBe(200)
  const rejected = await page.request.put('/api/v1/application', {
    headers,
    data: { version: 1, step: 5, profile, submit: true },
  })
  expect(rejected.status()).toBe(422)
  expect(Object.keys((await rejected.json()).fieldErrors)).toEqual(
    expect.arrayContaining([
      'about.photoFileId',
      'about.aadhaarFrontFileId',
      'about.aadhaarBackFileId',
      'education.class10FileId',
      'education.class12FileId',
    ]),
  )
  await page.goto('/apply')
  await expect(page.getByRole('heading', { name: 'KYC documents', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible()
  await expect(
    page.getByLabel('Signed Aadhaar — front (required)', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await capture(page, `kyc-required-${width}`)
  }
  const sample = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 900
      canvas.height = 500
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fffefa'
      ctx.fillRect(0, 0, 900, 500)
      ctx.fillStyle = '#15353b'
      ctx.font = '34px sans-serif'
      ctx.fillText('FICTIONAL DOCUMENT — TEST ONLY', 30, 100)
      ctx.fillText('Sample self-attestation signature', 30, 350)
      return canvas.toDataURL('image/png').split(',')[1]
    }),
    'base64',
  )
  async function upload(label: string, name: string, buffer = sample, mimeType = 'image/png') {
    const input = page.getByLabel(label, { exact: true })
    const section = page.locator('.af-attachment').filter({ has: input })
    await input.setInputFiles({ name, mimeType, buffer })
    await section.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(section.locator('.af-attachment-list li')).toHaveCount(1)
    await expect(section.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  }
  // Aadhaar accepts images only, and rejects invalid files before reserving an upload.
  const front = page.getByLabel('Signed Aadhaar — front (required)', { exact: true })
  const frontSection = page.locator('.af-attachment').filter({ has: front })
  await front.setInputFiles({
    name: 'invalid.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF'),
  })
  await frontSection.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(frontSection.getByRole('alert')).toContainText('JPG or PNG')
  await upload('Passport-size photo (required)', 'fictional-photo.png')
  await upload('Signed Aadhaar — front (required)', 'fictional-front.png')
  await upload('Signed Aadhaar — back (required)', 'fictional-back.png')
  await page.reload()
  await expect(page.locator('.af-kyc .af-attachment-list li')).toHaveCount(3)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await capture(page, `kyc-saved-${width}`)
  }
  const saved = (await (await page.request.get('/api/v1/application')).json()).application
  const identityId = saved.profile.about.aadhaarFrontFileId
  const outsider = await browser.newContext({ baseURL: origin })
  try {
    await outsider.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'parent-a@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(
      (
        await outsider.request.get(`/api/v1/files/${identityId}/view`, { maxRedirects: 0 })
      ).status(),
    ).toBe(404)
  } finally {
    await outsider.close()
  }
  const original = await page.request.get(`/api/v1/files/${identityId}/view`)
  expect(original.status()).toBe(200)
  expect(await original.body()).toEqual(sample)
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Education & experience', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(page.getByLabel('Class 10 certificate (required)', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await upload('Class 10 certificate (required)', 'fictional-class10.png')
  await upload('Class 12 certificate (required)', 'fictional-class12.png')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await capture(page, `education-${width}`)
  }
  await page.reload()
  const complete = (await (await page.request.get('/api/v1/application')).json()).application
  expect(complete.profile.education.higherQualificationFileIds).toEqual([])
  expect(complete.profile.education.resumeFileId).toBe('')
  const files = await (await page.request.get(`/api/v1/applications/${account.user.id}/files`)).json()
  expect(
    files.items.filter((f: { applicationPurpose?: string }) =>
      f.applicationPurpose?.startsWith('about.aadhaar'),
    ),
  ).toHaveLength(2)
  // Submission uses all other completed fields; optional uploads remain empty.
  const submitted = await page.request.put('/api/v1/application', {
    headers,
    data: { version: complete.formVersion, step: 5, submit: true, profile: complete.profile },
  })
  expect(submitted.status(), await submitted.text()).toBe(200)
  expect((await submitted.json()).status).toBe('submitted')
  await page.goto('/apply?tab=application')
  await expect(
    page.getByRole('link', { name: 'View Signed Aadhaar — front (required)', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
