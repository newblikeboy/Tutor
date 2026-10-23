import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase, verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const captureRoot = 'docs/visual-qa/study-subscriptions'
async function capture(page: Page, name: string) {
  await mkdir(captureRoot, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${captureRoot}/${name}-${width}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('admin publishes resources; each student pays separately, downloads and completes quizzes', async ({
  page,
  browser,
}) => {
  test.setTimeout(210000)
  test.skip(
    process.env.E2E_PAYMENT_SIMULATION !== '1' || process.env.E2E_CLOUDINARY !== '1',
    'Explicit isolated payment and Cloudinary fixtures required',
  )
  const errors: string[] = []
  let quizSubmissions = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/attempts')) quizSubmissions++
  })
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional study family',
      email: `study-${crypto.randomUUID()}@example.test`,
      password,
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const students: string[] = []
  for (const name of ['Fictional study student', 'Fictional study sibling']) {
    const response = await page.request.post('/api/v1/learners', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name, class: 8, board: 'CBSE', language: 'English', kind: 'adult_self' },
    })
    expect(response.status()).toBe(201)
    students.push((await response.json()).id)
  }
  const admin = await browser.newContext({ baseURL: origin })
  try {
    const login = await admin.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: 'admin-a@example.test', password },
    })
    expect(login.status()).toBe(200)
    const adminHeaders = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrf }
    const editor = await admin.newPage()
    editor.on('pageerror', (error) => errors.push(error.message))
    await editor.goto('/study')
    await editor.getByRole('button', { name: 'Create resource', exact: true }).click()
    await editor.getByLabel('Title', { exact: true }).fill('Fictional fraction practice')
    await editor.getByLabel('Resource type').selectOption('quiz')
    await editor.getByLabel('Subject', { exact: true }).selectOption('Mathematics')
    await editor.getByLabel('Class', { exact: true }).selectOption('8')
    await editor.getByLabel('Board', { exact: true }).selectOption('CBSE')
    await editor.getByRole('button', { name: 'Add question', exact: true }).click()
    await editor.getByLabel('Question', { exact: true }).fill('Which fraction equals one half?')
    for (const [index, option] of ['2/4', '3/4', '1/4', '4/4'].entries())
      await editor.getByLabel(`Option ${index + 1}`, { exact: true }).fill(option)
    await editor.getByLabel('Correct answer').selectOption('0')
    await editor.getByRole('button', { name: 'Add question', exact: true }).click()
    const secondQuestion = editor.locator('.study-question-editor fieldset').last()
    await secondQuestion
      .getByLabel('Question', { exact: true })
      .fill('Which fraction is one quarter?')
    for (const [index, option] of ['1/4', '1/2', '3/4', '4/4'].entries())
      await secondQuestion.getByLabel(`Option ${index + 1}`, { exact: true }).fill(option)
    await secondQuestion.getByLabel('Correct answer').selectOption('0')
    await capture(editor, 'admin-quiz-editor')
    const published = editor.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/study-materials') && response.request().method() === 'POST',
    )
    await editor.getByRole('button', { name: 'Publish resource', exact: true }).click()
    const quizResponse = await published
    expect(quizResponse.status(), await quizResponse.text()).toBe(201)
    const quiz = await quizResponse.json()
    await expect(editor).toHaveURL(`/study?material=${quiz.id}`)
    await editor.getByRole('button', { name: 'Back to resources', exact: true }).click()
    await expect(editor.getByRole('table')).toContainText('Fictional fraction practice')

    await editor.getByRole('button', { name: 'Create resource', exact: true }).click()
    await editor.getByLabel('Title', { exact: true }).fill('Fictional monthly science paper')
    await editor.getByLabel('Resource type').selectOption('monthly_test')
    await editor.getByLabel('Subject', { exact: true }).selectOption('Science')
    await editor.getByLabel('Class', { exact: true }).selectOption('8')
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(editor.getByRole('heading', { name: 'Edit resource', exact: true })).toBeVisible()
    const pdfID = new URL(editor.url()).searchParams.get('material')!
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    )
    await editor.getByLabel('PDF file', { exact: true }).setInputFiles({
      name: 'fictional-monthly-paper.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes,
    })
    await editor.getByRole('button', { name: 'Upload PDF', exact: true }).click()
    await expect(editor.getByText('PDF verified. Save or publish to use this file.')).toBeVisible()
    await editor.getByRole('button', { name: 'Publish resource', exact: true }).click()
    await expect(editor.locator('.study-editor-heading')).toContainText('published')
    await editor.reload()
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(
      'Fictional monthly science paper',
    )
    const pdf = await (await admin.request.get(`/api/v1/admin/study-materials/${pdfID}`)).json()

    await page.goto(`/study?learner=${students[0]}`)
    await expect(page.getByRole('heading', { name: 'One plan. More ways to learn.' })).toBeVisible()
    await expect(page.getByText('Fictional fraction practice', { exact: true })).toHaveCount(0)
    const locked = await (await page.request.get(`/api/v1/study?learner=${students[0]}`)).json()
    expect(locked.materials.items).toEqual([])
    expect(
      (
        await page.request.get(`/api/v1/study/materials/${quiz.id}?learner=${students[0]}`)
      ).status(),
    ).toBe(403)
    expect((await page.request.get(`/api/v1/files/${pdf.fileId}/download`)).status()).toBe(403)
    const anonymous = await browser.newContext({ baseURL: origin })
    try {
      for (const path of [
        '/study',
        `/study/materials/${quiz.id}?learner=${students[0]}`,
        `/files/${pdf.fileId}/download?learner=${students[0]}`,
      ])
        expect((await anonymous.request.get(`/api/v1${path}`)).status()).toBe(401)
    } finally {
      await anonymous.close()
    }
    await capture(page, 'parent-locked-library')
    await page.getByRole('button', { name: 'Subscribe for ₹99', exact: true }).click()
    await expect(page.getByText('Test checkout', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Simulate ₹99 for one student. No money will be charged.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirm test subscription', exact: true }).click()
    await expect(page.getByText('Test subscription active', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Test subscription active', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Subscribe for ₹99', exact: true })).toHaveCount(
      0,
    )
    await expect(page.locator('.study-offer')).toHaveCount(0)
    await page.getByRole('button', { name: 'Quizzes', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`learner=${students[0]}.*kind=quiz`))
    await expect(
      page.getByRole('rowheader', { name: 'Fictional fraction practice', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('rowheader', { name: 'Fictional monthly science paper', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'No resources published yet', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'All resources', exact: true }).click()
    await expect(
      page.getByRole('rowheader', { name: 'Fictional monthly science paper', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('table', { name: 'Study resources', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Quizzes', exact: true }).click()
    await expect(page.getByRole('table', { name: 'Quizzes', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveText(['Quiz', 'Subject', 'Action'])
    await page.getByRole('button', { name: 'All resources', exact: true }).click()
    await capture(page, 'parent-active-library')
    const detailResponse = await page.request.get(
      `/api/v1/study/materials/${quiz.id}?learner=${students[0]}`,
    )
    expect(await detailResponse.text()).not.toContain('correctOption')
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Which fraction equals one half?', exact: true }),
    ).toBeVisible()
    await page.getByRole('radio', { name: '2/4', exact: true }).check()
    await capture(page, 'parent-answering-quiz')
    await page.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Which fraction is one quarter?', exact: true }),
    ).toBeFocused()
    await page.getByRole('button', { name: 'Review answers', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Submit quiz', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Edit answer 2', exact: true }).click()
    await page.getByRole('radio', { name: '1/2', exact: true }).check()
    await page.getByRole('button', { name: 'Question 1, answered', exact: true }).click()
    await expect(page.getByRole('radio', { name: '2/4', exact: true })).toBeChecked()
    await page.getByRole('button', { name: 'Next question', exact: true }).click()
    await page.getByRole('button', { name: 'Review answers', exact: true }).click()
    await capture(page, 'parent-reviewing-quiz')
    expect(quizSubmissions).toBe(0)
    await expect(page.getByRole('heading', { name: 'Ready to finish?', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Submit quiz', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Quiz completed', exact: true })).toBeVisible()
    await expect(page.locator('.study-quiz-result')).toContainText('1 / 2')
    await capture(page, 'parent-quiz-result')
    await page
      .locator('.study-quiz-result')
      .getByRole('button', { name: 'Back to library', exact: true })
      .click()
    await page.getByRole('button', { name: 'Quiz results', exact: true }).click()
    await expect(page).toHaveURL(new RegExp('section=results'))
    await expect(page.locator('.study-results')).toContainText('Fictional fraction practice')
    await capture(page, 'parent-results-menu')
    await page.reload()
    await expect(page.locator('.study-results')).toContainText('1 / 2')
    await page.getByRole('button', { name: 'Study library', exact: true }).click()
    await page
      .getByRole('row')
      .filter({
        has: page.getByRole('rowheader', { name: 'Fictional monthly science paper', exact: true }),
      })
      .getByRole('button', { name: 'Open resource', exact: true })
      .click()
    // Even with a paid sibling, an explicit unpaid student cannot download.
    for (const action of ['view', 'download']) {
      expect((await page.request.get(`/api/v1/files/${pdf.fileId}/${action}`)).status()).toBe(403)
      expect(
        (
          await page.request.get(`/api/v1/files/${pdf.fileId}/${action}?learner=${students[1]}`)
        ).status(),
      ).toBe(403)
    }
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
    const download = await downloadPromise
    expect(await download.failure()).toBeNull()
    await page.getByRole('button', { name: 'Back to library', exact: true }).click()
    await page.getByLabel('Student', { exact: true }).selectOption(students[1])
    await expect(page.getByRole('button', { name: 'Subscribe for ₹99', exact: true })).toBeVisible()
    await expect(page.locator('.study-results')).toHaveCount(0)
    await expect(page.locator('.study-menu')).toHaveCount(0)
    expect(
      (
        await page.request.get(`/api/v1/study/materials/${quiz.id}?learner=${students[1]}`)
      ).status(),
    ).toBe(403)
    await page.getByLabel('Student', { exact: true }).selectOption(students[0])
    const { client, database } = await signupDatabase()
    try {
      await database
        .collection('study_access')
        .updateOne({ _id: students[0] }, { $set: { expiresAt: new Date(Date.now() + 12000) } })
    } finally {
      await client.close()
    }
    await page.reload()
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Which fraction equals one half?', exact: true }),
    ).toBeVisible()
    // The open quiz closes at expiry without refreshing or navigating away.
    await expect(page.getByText('Subscription expired', { exact: true })).toBeVisible({
      timeout: 20000,
    })
    await expect(page.getByRole('radio')).toHaveCount(0)
    const expiredLibrary = await (
      await page.request.get(`/api/v1/study?learner=${students[0]}`)
    ).json()
    expect(expiredLibrary.materials.items).toEqual([])
    expect(
      (
        await page.request.post(`/api/v1/study/materials/${quiz.id}/attempts`, {
          headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
          data: { learnerId: students[0], version: quiz.version, answers: [0, 0] },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await page.request.get(`/api/v1/study/materials/${quiz.id}?learner=${students[0]}`)
      ).status(),
    ).toBe(403)
    await capture(page, 'parent-expired-library')
    await expect(page.locator('.study-results')).toContainText('1 / 2')
    expect((await page.request.get(`/api/v1/files/${pdf.fileId}/download`)).status()).toBe(403)
    await page.getByRole('button', { name: 'Renew for ₹99', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm test subscription', exact: true }).click()
    // The requested material remains in the URL and reopens after verified renewal.
    await expect(
      page.getByRole('heading', { name: 'Which fraction equals one half?', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('radio', { name: '2/4', exact: true })).not.toBeChecked()
    await page.getByRole('button', { name: 'Back to library', exact: true }).click()
    await expect(page.getByText('Test subscription active', { exact: true })).toBeVisible()
    await editor.getByRole('button', { name: 'Archive resource', exact: true }).click()
    await expect(editor.locator('.study-editor-heading')).toContainText('archived')
    expect(
      (
        await page.request.get(`/api/v1/files/${pdf.fileId}/download?learner=${students[0]}`)
      ).status(),
    ).toBe(404)
    expect(
      (await page.request.get(`/api/v1/study/materials/${pdfID}?learner=${students[0]}`)).status(),
    ).toBe(404)
    await page.goto('/billing')
    await expect(page.getByRole('table')).toContainText('Study subscription')
    await expect(page.getByRole('table')).toContainText('Test payment')
    await page
      .getByRole('link', { name: /^Study subscription/ })
      .first()
      .click()
    await expect(
      page.getByRole('link', { name: 'Open study materials', exact: true }),
    ).toHaveAttribute('href', `/study?learner=${students[0]}`)
    expect(
      (await page.request.post('/api/v1/admin/study-materials', { headers, data: {} })).status(),
    ).toBe(403)
    expect(
      (
        await admin.request.put(`/api/v1/admin/study-materials/${pdfID}`, {
          headers: adminHeaders,
          data: {
            title: 'Stale fixture',
            description: '',
            kind: 'notes',
            class: 8,
            board: 'All',
            subject: 'Science',
            status: 'draft',
            fileId: '',
            questions: [],
            expectedVersion: 0,
          },
        })
      ).status(),
    ).toBe(409)
    expect(errors).toEqual([])
  } finally {
    await admin.close()
  }
})
