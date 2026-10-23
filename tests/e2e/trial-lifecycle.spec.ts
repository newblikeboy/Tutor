import { test, expect, type APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase } from './signup-fixture'

test('trial ends automatically and offers parent booking without tutor feedback or mentor review', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000)
  const origin = baseURL!
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tutor = await browser.newContext({ baseURL: origin })
  const mentor = await browser.newContext({ baseURL: origin })
  async function login(request: APIRequestContext, id: string) {
    const response = await request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
    })
    expect(response.status()).toBe(200)
  }
  async function action(request: APIRequestContext, path: string, data: unknown, expected = 200) {
    const auth = await (await request.get('/api/v1/auth/session')).json()
    const response = await request.post(`/api/v1${path}`, {
      headers: {
        Origin: origin,
        'X-CSRF-Token': auth.csrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data,
    })
    expect(response.status(), await response.text()).toBe(expected)
    return response.json()
  }
  try {
    await login(page.request, 'parent-a')
    await login(tutor.request, 'tutor-meera')
    await login(mentor.request, 'mentor-a')
    const consent = await action(
      page.request,
      '/consents',
      { relationship: 'parent', accepted: true },
      201,
    )
    const learner = await action(
      page.request,
      '/learners',
      {
        name: 'Fictional automatic trial learner',
        class: 8,
        board: 'CBSE',
        language: 'English',
        kind: 'minor',
        consentId: consent.id,
      },
      201,
    )
    const start = new Date(Date.now() + 2 * 86400000)
    start.setUTCHours(4, 30, 0, 0)
    const trial = await action(
      page.request,
      '/trials',
      {
        learnerId: learner.id,
        tutorId: 'tutor-meera',
        subjects: ['Mathematics'],
        mode: 'online',
        start: start.toISOString(),
        termsAccepted: true,
      },
      201,
    )
    expect(trial.mentorId).toBeFalsy()
    await action(tutor.request, `/trials/${trial.id}/action`, { action: 'accept' })
    for (const unsupported of ['complete', 'feedback', 'review']) {
      await action(tutor.request, `/trials/${trial.id}/action`, { action: unsupported }, 422)
      await action(mentor.request, `/trials/${trial.id}/action`, { action: unsupported }, 403)
    }
    // Shorten this fictional schedule only. Leave completion to the live worker
    // or authorised read; the browser stays open throughout the transition.
    const { client, database } = await signupDatabase()
    const end = new Date(Date.now() + 20000)
    try {
      expect(
        (
          await database
            .collection('trials')
            .updateOne(
              { _id: trial.id as never, status: 'confirmed' },
              { $set: { start: new Date(end.getTime() - 3600000), end } },
            )
        ).matchedCount,
      ).toBe(1)
      await page.goto(`/workspace?view=sessions&learner=${learner.id}`)
      await expect(page.getByRole('tab')).toHaveText([
        'All (1)',
        'Completed (0)',
        'Upcoming (1)',
        'Cancelled (0)',
      ])
      await expect(page.getByRole('columnheader', { name: 'Feedback status' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Book tutor', exact: true })).toHaveCount(0)
      await expect(page.getByRole('cell', { name: 'Confirmed', exact: true })).toBeVisible()
      await expect(page.getByRole('cell', { name: 'Completed', exact: true })).toBeVisible({
        timeout: 40000,
      })
      expect(Date.now()).toBeGreaterThanOrEqual(end.getTime())
      await expect(page.getByRole('link', { name: 'Book tutor', exact: true })).toBeVisible()
      const saved = await database.collection('trials').findOne({ _id: trial.id as never })
      expect(saved?.completionMethod).toBe('scheduled_end')
      expect(saved?.completedAt.toISOString()).toBe(end.toISOString())
      expect(saved?.review ?? '').toBe('')
      expect(saved?.notes ?? '').toBe('')
      expect(saved?.nextSteps ?? '').toBe('')
      expect(
        await database
          .collection('audit')
          .countDocuments({ target: trial.id, action: 'trial.auto_completed' }),
      ).toBe(1)
      expect((await (await mentor.request.get('/api/v1/dashboard')).json()).trials).toEqual([])
      await mkdir('docs/visual-qa/trial-lifecycle', { recursive: true })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
        await page.screenshot({
          path: `docs/visual-qa/trial-lifecycle/completed-${width}.png`,
          fullPage: true,
        })
      }
      await page.getByRole('link', { name: 'Book tutor', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Start regular classes', exact: true }),
      ).toBeVisible()
      const teacher = await tutor.newPage()
      await teacher.goto(`/workspace?view=sessions&queue=completed&trial=${trial.id}`)
      await expect(
        teacher.locator('.record-card').getByText('Completed', { exact: true }),
      ).toBeVisible()
      await expect(teacher.locator('.record-card').getByRole('textbox')).toHaveCount(0)
      await expect(teacher.getByRole('button', { name: /feedback|record lesson/i })).toHaveCount(0)
      await teacher.close()
      expect(errors).toEqual([])
    } finally {
      await client.close()
    }
  } finally {
    await tutor.close()
    await mentor.close()
  }
})
