import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test('photo preparation, visible stages and lost-response recovery preserve one attachment', async ({
  page,
}) => {
  test.skip(process.env.E2E_CLOUDINARY !== '1', 'Requires the local Cloudinary protocol fixture')
  test.setTimeout(120_000)
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `photo-${crypto.randomUUID()}@example.test`,
      password: 'Photo upload test passphrase 426!',
      name: 'Sample photo applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': auth.csrf }
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: {
          version: 0,
          step: 0,
          profile: applicationProfile('Sample photo applicant'),
          submit: false,
        },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  const input = page.getByLabel('Passport-size photo (optional)', { exact: true })
  const photo = page.locator('.af-attachment').filter({ has: input })
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1600
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#dfe8bc'
    ctx.fillRect(0, 0, 2400, 1600)
    ctx.fillStyle = '#fffefa'
    ctx.font = '100px sans-serif'
    ctx.fillText('Sample photo', 180, 400)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const original = Buffer.from(image, 'base64')
  expect(original.length).toBeLessThan(3 * 1024 * 1024)
  const intents: { size: number; contentType: string; name: string }[] = []
  let remoteUploads = 0,
    saves = 0
  let finishVerification!: () => void, finishSave!: () => void, finishUpload!: () => void
  const verificationGate = new Promise<void>((resolve) => {
    finishVerification = resolve
  })
  const saveGate = new Promise<void>((resolve) => {
    finishSave = resolve
  })
  const uploadGate = new Promise<void>((resolve) => {
    finishUpload = resolve
  })
  await page.route('**/api/v1/applications/*/files/upload-intent', async (route) => {
    intents.push(route.request().postDataJSON())
    await route.continue()
  })
  await page.route('http://127.0.0.1:7998/image/upload', async (route) => {
    remoteUploads++
    await uploadGate
    await route.fetch() // Provider persisted the bytes; lose only the browser response.
    await route.abort('failed')
  })
  await page.route('**/api/v1/files/*/complete', async (route) => {
    await verificationGate
    await route.continue()
  })
  await page.route('**/api/v1/application', async (route) => {
    if (route.request().method() === 'PUT') {
      saves++
      await saveGate
    }
    await route.continue()
  })
  await input.setInputFiles({
    name: 'sample-large-photo.png',
    mimeType: 'image/png',
    buffer: original,
  })
  await expect(photo.getByRole('img', { name: 'Selected image preview' })).toBeVisible()
  expect(remoteUploads).toBe(0)
  await mkdir('docs/visual-qa/upload-performance', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await photo.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `docs/visual-qa/upload-performance/local-preview-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await photo.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect.poll(() => remoteUploads).toBe(1)
  await expect(photo.locator('.upload-feedback')).toContainText('Uploading')
  await expect(photo.getByRole('progressbar')).toBeVisible()
  expect(saves).toBe(0)
  expect(intents[0].size).toBeLessThan(original.length)
  expect(intents[0].contentType).toBe('image/jpeg')
  expect(intents[0].name).toBe('sample-large-photo.jpg')
  finishUpload()
  await expect(photo.getByRole('alert')).toBeVisible()
  await expect(photo.getByRole('img', { name: 'Selected image preview' })).toBeVisible()
  await photo.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(photo.locator('.upload-feedback')).toContainText('Verifying upload')
  expect(remoteUploads).toBe(1)
  expect(intents[1]).toEqual(intents[0])
  finishVerification()
  await expect(photo.locator('.upload-feedback')).toContainText('Saving attachment')
  await expect.poll(() => saves).toBe(1)
  await page.screenshot({
    path: 'docs/visual-qa/upload-performance/saving-mobile.png',
    fullPage: true,
  })
  finishSave()
  await expect(photo.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  await expect(photo.locator('.upload-feedback')).toHaveCount(0)
  await expect(photo.locator('.af-attachment-list')).toContainText('sample-large-photo.jpg')
  const result = (await (await page.request.get('/api/v1/application')).json()).application
  expect(result.formVersion).toBe(2)
  const files = (
    await (await page.request.get(`/api/v1/applications/${auth.user.id}/files`)).json()
  ).items
  expect(files).toHaveLength(1)
  expect(result.profile.about.photoFileId).toBe(files[0].id)
  expect(files[0].size).toBe(intents[0].size)
  await page.reload()
  await expect(photo.locator('.af-attachment-list')).toContainText('sample-large-photo.jpg')
  // The test provider returns source bytes, so this measures browser-side resizing.
  await expect
    .poll(() =>
      photo.locator('.af-photo-preview img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1280)
  await writeFile(
    'docs/visual-qa/upload-performance/measurements.json',
    JSON.stringify(
      {
        inputBytes: original.length,
        uploadedBytes: files[0].size,
        sourceWidth: 2400,
        uploadedWidth: 1280,
        cloudinaryUploadRequests: remoteUploads,
        draftSavesForUpload: saves,
      },
      null,
      2,
    ) + '\n',
  )
})
