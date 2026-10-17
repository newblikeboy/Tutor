import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { signupDatabase, verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
test('parent confirms learner deletion, retries failures and retains booked history', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional learner deletion family',
      email: `learner-delete-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  const create = async (name: string) => {
    const response = await page.request.post('/api/v1/learners', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name, class: 8, board: 'CBSE', language: 'English', kind: 'adult_self' },
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const learner = await create('Fictional unused learner')
  const retained = await create('Fictional learner with trial history')
  const other = await browser.newContext()
  try {
    const login = await other.request.post(`${origin}/api/v1/auth/login`, {
      headers: { Origin: origin },
      data: { email: 'parent-b@example.test', password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    expect(
      (
        await other.request.delete(`${origin}/api/v1/learners/${learner.id}`, {
          headers: { Origin: origin, 'X-CSRF-Token': (await login.json()).csrf },
          data: { expectedVersion: learner.version },
        })
      ).status(),
    ).toBe(404)
  } finally {
    await other.close()
  }
  expect(
    (
      await page.request.delete(`/api/v1/learners/${learner.id}`, {
        headers: { ...headers, 'X-CSRF-Token': 'wrong' },
        data: { expectedVersion: learner.version },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await page.request.delete(`/api/v1/learners/${learner.id}`, {
        headers,
        data: { expectedVersion: 0 },
      })
    ).status(),
  ).toBe(409)

  await page.goto('/workspace?view=learners')
  const trigger = page.getByRole('button', { name: `Delete learner ${learner.name}`, exact: true })
  await expect(trigger).toBeVisible()
  await trigger.click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete learner?', exact: true })
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await mkdir('docs/visual-qa/learner-delete', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/visual-qa/learner-delete/confirm-${width}.png` })
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect((await page.request.get(`/api/v1/learners/${learner.id}`)).status()).toBe(200)
  await trigger.click()
  await page.route(`**/api/v1/learners/${learner.id}`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 503,
          json: { code: 'unavailable', message: 'Isolated deletion outage fixture' },
        })
      : route.continue(),
  )
  await dialog.getByRole('button', { name: 'Delete learner', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  expect((await page.request.get(`/api/v1/learners/${learner.id}`)).status()).toBe(200)
  await page.unroute(`**/api/v1/learners/${learner.id}`)
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith(`/learners/${learner.id}`),
  )
  await dialog.getByRole('button', { name: 'Delete learner', exact: true }).click()
  expect((await deleted).status()).toBe(200)
  await expect(trigger).toHaveCount(0)
  await expect(page.locator('#desk-main')).toBeFocused()
  await page.reload()
  expect((await page.request.get(`/api/v1/learners/${learner.id}`)).status()).toBe(404)

  const { client, database } = await signupDatabase()
  const trialID = crypto.randomUUID()
  try {
    await database
      .collection('trials')
      .insertOne({
        _id: trialID as never,
        ownerId: auth.user.id,
        learnerId: retained.id,
        learnerName: retained.name,
        tutorId: 'tutor-arjun',
        mentorId: 'mentor-a',
        class: 8,
        subject: 'Mathematics',
        subjects: ['Mathematics'],
        mode: 'online',
        start: new Date(Date.now() - 7200000),
        end: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        status: 'cancelled',
        version: 1,
      })
  } finally {
    await client.close()
  }
  await page.reload()
  await page.getByRole('button', { name: `Delete learner ${retained.name}`, exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete learner', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cannot be deleted')
  await page.screenshot({ path: 'docs/visual-qa/learner-delete/history-protected-390.png' })
  expect((await page.request.get(`/api/v1/learners/${retained.id}`)).status()).toBe(200)
  expect(
    (await (await page.request.get('/api/v1/dashboard')).json()).trials.some(
      (trial: { id: string }) => trial.id === trialID,
    ),
  ).toBe(true)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  // Deleting from a selected empty report also clears its URL/cache. Deleting
  // the final unused profile restores the normal add-learner entry point.
  const last = await create('Fictional report deletion learner')
  await page.goto(`/workspace?view=learners&learner=${last.id}`)
  await page.getByRole('button', { name: `Delete learner ${last.name}`, exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete learner', exact: true }).click()
  await expect(page).toHaveURL('/workspace?view=learners')
  await expect(page.getByRole('table', { name: 'Your learners', exact: true })).toBeVisible()
  await expect(page.getByRole('table')).not.toContainText(last.name)
  expect(errors).toEqual([])
})

test('deleting the only unused learner restores onboarding', async ({ page }) => {
  const response = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional empty family',
      email: `learner-last-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      role: 'parent',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  expect(
    (
      await page.request.post('/api/v1/learners', {
        headers: {
          Origin: origin,
          'X-CSRF-Token': auth.csrf,
          'Idempotency-Key': crypto.randomUUID(),
        },
        data: {
          name: 'Only fictional learner',
          class: 8,
          board: 'CBSE',
          language: 'English',
          kind: 'adult_self',
        },
      })
    ).status(),
  ).toBe(201)
  await page.goto('/workspace?view=learners')
  await page
    .getByRole('button', { name: 'Delete learner Only fictional learner', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete learner', exact: true })
    .click()
  await expect(page.locator('.parent-welcome')).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Add learner', exact: true }),
  ).toBeVisible()
})
