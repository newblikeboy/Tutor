import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { applicationProfile } from './helpers/application'

test('direct Cloudinary uploads persist references and privately deliver images PDFs and video', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_CLOUDINARY !== '1',
    'Requires explicit local Cloudinary protocol fixture',
  )
  test.setTimeout(180000)
  const origin = 'http://127.0.0.1:5174'
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email: `direct-${Date.now()}@example.test`,
      password: 'Cloudinary browser passphrase 873!',
      name: 'Fictional Cloudinary applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const draft = await page.request.put('/api/v1/application', {
    headers,
    data: {
      version: 0,
      step: 0,
      profile: applicationProfile('Fictional Cloudinary applicant'),
      submit: false,
    },
  })
  expect(draft.status()).toBe(200)
  const posted: { url: string; body: string }[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/v1/'))
      posted.push({ url: r.url(), body: r.postData() || '' })
  })
  await page.goto('/apply')
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 90
    canvas.height = 110
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#dfe8bc'
    ctx.fillRect(0, 0, 90, 110)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const input = page.getByLabel('Passport-size photo (optional)', { exact: true })
  const photo = page.locator('.af-attachment').filter({ has: input })
  await input.setInputFiles({
    name: 'sample-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  })
  const remoteUpload = page.waitForRequest(
    (r) => r.url() === 'http://127.0.0.1:7998/image/upload' && r.method() === 'POST',
  )
  await photo.getByRole('button', { name: 'Upload', exact: true }).click()
  await remoteUpload
  await expect(photo.getByRole('status')).toContainText('sample-photo.png')
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  await page.reload()
  await expect(photo.getByRole('status')).toContainText('sample-photo.png')
  await page.getByRole('tab', { name: /Education/ }).click()
  const resumeInput = page.getByLabel('Resume (optional)', { exact: true })
  const resume = page.locator('.af-attachment').filter({ has: resumeInput })
  await resumeInput.setInputFiles({
    name: 'sample-resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF'),
  })
  await resume.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(resume.getByRole('status')).toContainText('sample-resume.pdf')
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  expect(
    posted.filter((p) => p.url.includes('/files')).every((p) => !p.body.includes('"content":')),
  ).toBe(true)

  // Exercise the same direct protocol for an MP4 without restoring the removed
  // Teaching approach video field. The provider is local/test-only.
  const videoBase64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')!
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' })
    const chunks: BlobPart[] = []
    return new Promise<string>((resolve, reject) => {
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onerror = reject
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const data = new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer())
        resolve(btoa(String.fromCharCode(...data)))
      }
      recorder.start()
      let frame = 0
      const timer = setInterval(() => {
        ctx.fillStyle = '#15353b'
        ctx.fillRect(0, 0, 160, 90)
        ctx.fillStyle = '#dfe8bc'
        ctx.fillRect(10 + frame * 3, 25, 25, 25)
        frame++
      }, 100)
      setTimeout(() => {
        clearInterval(timer)
        recorder.stop()
      }, 1200)
    })
  })
  const bytes = Buffer.from(videoBase64, 'base64')
  const intentResponse = await page.request.post(
    `/api/v1/applications/${auth.user.id}/files/upload-intent`,
    {
      headers: { ...headers, 'Idempotency-Key': 'browser-direct-video' },
      data: { name: 'sample-introduction.mp4', contentType: 'video/mp4', size: bytes.length },
    },
  )
  expect(intentResponse.status()).toBe(200)
  const intent = await intentResponse.json()
  const uploaded = await page.request.post(intent.upload.url, {
    multipart: {
      ...intent.upload.fields,
      file: { name: 'sample-introduction.mp4', mimeType: 'video/mp4', buffer: bytes },
    },
  })
  expect(uploaded.status()).toBe(200)
  expect(
    (
      await page.request.post(`/api/v1/files/${intent.file.id}/complete`, { headers, data: {} })
    ).status(),
  ).toBe(200)
  const current = (await (await page.request.get('/api/v1/application')).json()).application
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: current.formVersion, step: 5, profile: current.profile, submit: true },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply?tab=documents')
  await expect(page.getByText('Ready to view', { exact: true })).toHaveCount(3)
  await expect(page.getByText('File checks are unavailable. Downloads stay locked.')).toHaveCount(0)
  const photoView = page.getByRole('img', { name: 'sample-photo.png', exact: true })
  await expect(photoView).toBeVisible()
  await expect.poll(() => photoView.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(90)
  const files = (
    await (await page.request.get(`/api/v1/applications/${auth.user.id}/files`)).json()
  ).items
  expect(
    files.every(
      (f: { status: string; scannedAt?: string }) => f.status === 'ready' && !f.scannedAt,
    ),
  ).toBe(true)
  const pdf = files.find((f: { contentType: string }) => f.contentType === 'application/pdf')
  const pdfRedirect = await page.request.get(`/api/v1/files/${pdf.id}/view`, { maxRedirects: 0 })
  expect(pdfRedirect.status()).toBe(302)
  expect(new URL(pdfRedirect.headers().location).searchParams.get('attachment')).toBe('false')
  const pdfBytes = await page.request.get(pdfRedirect.headers().location)
  expect(pdfBytes.headers()['content-type']).toBe('application/pdf')
  expect((await pdfBytes.body()).toString()).toContain('%PDF')
  await expect(page.getByLabel('sample-introduction.mp4', { exact: true })).toHaveAttribute(
    'src',
    `/api/v1/files/${intent.file.id}/play?attempt=0`,
  )
  const player = page.getByLabel('sample-introduction.mp4', { exact: true })
  await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(0)
  await player.evaluate((v: HTMLVideoElement) => v.play())
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1)
  await player.evaluate((v: HTMLVideoElement) => v.pause())
  const videoRedirect = await page.request.get(`/api/v1/files/${intent.file.id}/play`, {
    maxRedirects: 0,
  })
  const range = await page.request.get(videoRedirect.headers().location, {
    headers: { Range: 'bytes=0-7' },
  })
  expect(range.status()).toBe(206)
  expect((await range.body()).length).toBe(8)
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({
      path: `docs/visual-qa/cloudinary-direct/files-${width}.png`,
      fullPage: true,
    })
  }
  // Revoked session cannot obtain any new provider link.
  expect((await page.request.post('/api/v1/auth/logout', { headers, data: {} })).ok()).toBe(true)
  expect(
    (await page.request.get(`/api/v1/files/${pdf.id}/view`, { maxRedirects: 0 })).status(),
  ).toBe(401)
})
