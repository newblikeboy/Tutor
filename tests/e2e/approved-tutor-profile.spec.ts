import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { applicationProfile } from './helpers/application'
import { connectGoogle } from './helpers/google'

const origin = 'http://127.0.0.1:5174'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const password = 'E2E-only learning passphrase 426!'
const folder = '.local/approved-profile-implementation'
async function login(request: APIRequestContext, id: string) {
  const res = await request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password },
  })
  expect(res.status()).toBe(200)
}
async function write(request: APIRequestContext, path: string, data: unknown, method = 'POST') {
  const auth = await (await request.get('/api/v1/auth/session')).json()
  const res = await request.fetch(`/api/v1${path}`, {
    method,
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': crypto.randomUUID() },
    data,
  })
  expect(res.ok(), await res.text()).toBe(true)
  return res.json()
}
async function capture(page: Page, name: string) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true })
}

test('approved profile, explicit public media, teaching readiness and parent trial context persist', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mkdir(folder, { recursive: true })
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:/)
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const db = mongo.db(runtime.databaseName)
  try {
    const profile = applicationProfile('Meera · sample')
    profile.teachingAreas[0].languages = ['English', 'Hindi']
    profile.education.newToTutoring = false
    profile.education.experienceYears = 3
    profile.education.experienceMonths = 4
    await db
      .collection('applications')
      .updateOne({ _id: 'tutor-meera' as never }, { $set: { profile } })
    await login(page.request, 'tutor-meera')
    expect((await (await page.request.get('/api/v1/config')).json()).mediaProvider).toBe(
      'cloudinary',
    )
    await page.goto('/tutor-profile')
    await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My application', exact: true })).toHaveCount(0)
    await expect(page.locator('.af-journey')).toHaveCount(0)
    await expect(page.getByText('You’re approved', { exact: true })).toHaveCount(0)
    await page.goto('/apply')
    await expect(page).toHaveURL('/tutor-profile')
    await expect(page.locator('.af-journey')).toHaveCount(0)
    await page.goto('/apply?tab=application')
    await expect(page).toHaveURL('/tutor-profile?record=information')
    await expect(
      page.getByRole('heading', { name: 'Your submitted record', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Application status', exact: true })).toHaveCount(0)
    await capture(page, 'submitted-record-desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await capture(page, 'submitted-record-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/apply?tab=documents')
    await expect(page).toHaveURL('/tutor-profile?record=documents')
    await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await capture(page, 'submitted-documents-desktop')
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.goto('/tutor-profile')
    await capture(page, 'my-profile-before-media-desktop')
    const hours = await (await page.request.get('/api/v1/availability')).json()
    await write(
      page.request,
      '/availability',
      {
        version: hours.version,
        timezone: 'Asia/Kolkata',
        windows: Array.from({ length: 7 }, (_, day) => ({
          day,
          startMinute: 600,
          endMinute: 1080,
        })),
        leaveDates: [],
        bufferMinutes: 0,
        dailyCapacity: 12,
        paused: false,
      },
      'PUT',
    )
    await connectGoogle(page, 'tutor')
    await page.goto('/tutor-profile')
    await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
    await expect(page.locator('.tutor-profile-setup')).toHaveCount(0)
    await page
      .getByLabel('Public introduction', { exact: true })
      .fill(
        'I use worked examples, short practice and questions to help learners explain their mathematical reasoning. This is a fictional sample tutor profile.',
      )
    await page.getByRole('tab', { name: 'Preview', exact: true }).click()
    await expect(page.locator('.profile-introduction')).not.toContainText('worked examples')
    await expect(page.locator('.site-header')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Public profile', exact: true }).click()
    await expect(page.getByLabel('Public introduction')).toHaveValue(/worked examples/)
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Profile saved.', { exact: false })).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Public introduction')).toHaveValue(/worked examples/)
    const submitted = await (await page.request.get('/api/v1/application')).json()
    expect(submitted.application.profile.approach.introduction).toBe(profile.approach.introduction)
    expect(submitted.application.profile.about.photoFileId).toBe(profile.about.photoFileId)

    // A real PNG of fictional initials, uploaded only to the loopback provider.
    await page.goto('/tutors/tutor-meera')
    await expect(page).toHaveURL('/tutor-profile?section=preview')
    await page.locator('.approved-profile-identity').waitFor()
    const image = await page.locator('.teacher-photo-symbol').screenshot()
    await page.goto('/tutor-profile')
    await page
      .getByLabel('Upload a new photo', { exact: true })
      .setInputFiles({ name: 'sample-portrait.png', mimeType: 'image/png', buffer: image })
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click()
    await expect(page.getByLabel('Public photo', { exact: true })).not.toHaveValue('')
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Profile saved.', { exact: false })).toBeVisible()
    const firstPhoto = await page.getByLabel('Public photo', { exact: true }).inputValue()
    await page.getByLabel('Upload a new photo', { exact: true }).setInputFiles({
      name: 'sample-replacement-portrait.png',
      mimeType: 'image/png',
      buffer: image,
    })
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click()
    await expect(page.getByLabel('Public photo', { exact: true })).not.toHaveValue(firstPhoto)
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Profile saved.', { exact: false })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Public photo', { exact: true })).not.toHaveValue(firstPhoto)
    expect(
      (await (await page.request.get('/api/v1/application')).json()).application.profile.about
        .photoFileId,
    ).toBe(profile.about.photoFileId)
    const video = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 90
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#15353b'
      ctx.fillRect(0, 0, 160, 90)
      const stream = canvas.captureStream(10)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' })
      const chunks: BlobPart[] = []
      return new Promise<string>((resolve, reject) => {
        recorder.ondataavailable = (event) => chunks.push(event.data)
        recorder.onerror = reject
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop())
          const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer())
          resolve(btoa(String.fromCharCode(...bytes)))
        }
        recorder.start()
        let frame = 0
        const timer = setInterval(() => {
          ctx.fillStyle = '#15353b'
          ctx.fillRect(0, 0, 160, 90)
          ctx.fillStyle = '#dfe8bc'
          ctx.fillRect(20 + frame++ * 2, 20, 30, 30)
        }, 100)
        setTimeout(() => {
          clearInterval(timer)
          recorder.stop()
        }, 1200)
      })
    })
    await page.getByLabel('Upload a new introduction video', { exact: true }).setInputFiles({
      name: 'sample-public-intro.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from(video, 'base64'),
    })
    await page.getByRole('button', { name: 'Upload video', exact: true }).click()
    await expect(page.locator('.profile-media-upload').last().getByRole('alert')).toHaveCount(0)
    await expect(page.getByLabel('Selected introduction video')).not.toHaveValue('')
    await expect(page.getByLabel('sample-public-intro.mp4', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Profile saved.', { exact: false })).toBeVisible()
    expect(
      (await (await page.request.get('/api/v1/tutors/tutor-meera')).json()).introVideoUrl,
    ).toBeUndefined()
    await page.getByLabel('I want this selected video to be visible on my public profile.').check()
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Profile saved.', { exact: false })).toBeVisible()
    await capture(page, 'tutor-profile-desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await capture(page, 'tutor-profile-mobile')
    await page.goto('/tutors/tutor-meera?source=search&class=8&mode=online&subject=Mathematics')
    await expect(page.getByLabel('Meera · sample public introduction video')).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator('.approved-profile-identity img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true)
    await expect(page).toHaveURL('/tutor-profile?section=preview')
    await expect(
      page.getByRole('heading', { level: 1, name: 'My profile', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.site-header')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Request a trial', exact: true })).toHaveCount(0)
    await capture(page, 'public-profile-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await capture(page, 'public-profile-desktop')
    await page.goto('/tutors?searched=1&class=8&mode=online&subject=Mathematics')
    await expect(page.locator('.site-header')).toHaveCount(0)
    await expect(
      page
        .locator('.tutor-card')
        .filter({ hasText: 'Meera · sample' })
        .getByRole('link', { name: 'View complete profile' }),
    ).toHaveAttribute('href', /class=8.*mode=online.*subject=Mathematics/)
    await capture(page, 'search-desktop')
    await page.close()

    const parentContext = await browser.newContext({ baseURL: origin, timezoneId: 'Asia/Kolkata' })
    const parent = await parentContext.newPage()
    parent.on('pageerror', (error) => errors.push(error.message))
    await login(parent.request, 'parent-a')
    const consent = await write(parent.request, '/consents', {
      relationship: 'parent',
      accepted: true,
    })
    const learner = await write(parent.request, '/learners', {
      name: 'Fictional profile learner',
      class: 8,
      board: 'CBSE',
      language: 'Hindi',
      kind: 'minor',
      consentId: consent.id,
    })
    const context = `source=match&learner=${learner.id}&class=8&mode=online&subject=Mathematics&radiusKm=5`
    await parent.goto(`/tutors/tutor-meera?${context}`)
    await expect(parent.locator('.site-header')).toHaveCount(0)
    await expect(parent.getByText('Next trial time', { exact: true })).toBeVisible()
    await capture(parent, 'parent-public-profile-desktop')
    await parent.setViewportSize({ width: 390, height: 844 })
    await capture(parent, 'parent-public-profile-mobile')
    await parent.screenshot({ path: `${folder}/parent-public-profile-mobile-viewport.png` })
    await parent.setViewportSize({ width: 1440, height: 1000 })
    await expect(parent.getByRole('link', { name: 'Back to your tutor choices' })).toHaveAttribute(
      'href',
      new RegExp(`learner=${learner.id}.*mode=online.*subject=Mathematics`),
    )
    await write(parent.request, '/auth/logout', {})
    await parent.goto(`/tutors/tutor-meera?${context}`)
    await parent.locator('.profile-booking').getByRole('link', { name: 'Request a trial' }).click()
    await expect(parent).toHaveURL(/\/login\?return=/)
    expect(new URL(parent.url()).searchParams.get('return')).toContain(`learner=${learner.id}`)
    await parent.getByLabel('Email address', { exact: true }).fill('parent-a@example.test')
    await parent.getByLabel('Password', { exact: true }).fill(password)
    await parent.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(parent.getByLabel('Learner', { exact: true })).toHaveValue(learner.id)
    await expect(
      parent.getByRole('heading', { name: 'Request a trial', exact: true }),
    ).toBeVisible()
    await expect(parent.getByRole('radio', { name: /Meera/ })).toBeChecked()
    const date = parent.locator('.trial-date.available').first()
    await expect(date).toBeVisible()
    await date.click()
    await parent.locator('.trial-time.available').first().click()
    await parent.getByLabel('I accept the trial terms.', { exact: true }).check()
    await parent
      .locator('.parent-tutor-option.selected')
      .getByRole('button', { name: 'Request a trial', exact: true })
      .click()
    await expect(
      parent.getByText('Trial requested — waiting for tutor acceptance', { exact: true }),
    ).toBeVisible()
    const saved = await (await parent.request.get('/api/v1/dashboard')).json()
    expect(
      saved.trials.some(
        (trial: { learnerId: string; tutorId: string }) =>
          trial.learnerId === learner.id && trial.tutorId === 'tutor-meera',
      ),
    ).toBe(true)
    await parentContext.close()
    expect(errors).toEqual([])
  } finally {
    await mongo.close()
  }
})
