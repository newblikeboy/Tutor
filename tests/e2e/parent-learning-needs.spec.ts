import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('Home learner context and deletion of unused learning needs persist', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const origin = 'http://127.0.0.1:5174'
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email: `needs-${crypto.randomUUID()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      name: 'Fictional family',
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const headers = { Origin: origin, 'X-CSRF-Token': (await signup.json()).csrf }
  async function create(path: string, data: object) {
    const response = await page.request.post(`/api/v1${path}`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data,
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const first = await create('/learners', {
    name: 'Sample learner one',
    class: 8,
    board: 'CBSE',
    language: 'English',
    kind: 'adult_self',
  })
  const second = await create('/learners', {
    name: 'Sample learner two',
    class: 10,
    board: 'ICSE',
    language: 'English',
    kind: 'adult_self',
  })
  const need = await create('/requirements', {
    learnerId: first.id,
    goal: 'Sample need to practise fractions',
    locality: 'Purnea',
  })
  const booked = await create('/requirements', {
    learnerId: first.id,
    goal: 'Sample need with a cancelled trial',
    locality: 'Purnea',
  })
  const otherNeed = await create('/requirements', {
    learnerId: second.id,
    goal: 'Sample need to understand algebra',
    locality: 'Purnea',
  })
  const trial = await create('/trials', {
    requirementId: booked.id,
    tutorId: 'tutor-meera',
    start: new Date(Date.now() + 86400000).toISOString(),
    termsAccepted: true,
  })
  const cancel = await page.request.post(`/api/v1/trials/${trial.id}/action`, {
    headers,
    data: { action: 'cancel' },
  })
  expect(cancel.status()).toBe(200)
  await mkdir('docs/visual-qa/parent-learning-needs', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/workspace?learner=${second.id}`)
    const selector = page.getByLabel('Learner', { exact: true })
    await expect(selector).toHaveValue(second.id)
    await expect(page.locator('.parent-next a')).toHaveAttribute(
      'href',
      `/match?requirement=${otherNeed.id}`,
    )
    await selector.selectOption(first.id)
    await expect(page).toHaveURL(new RegExp(`learner=${first.id}`))
    await expect(page.locator('.parent-next a')).not.toHaveAttribute(
      'href',
      `/match?requirement=${otherNeed.id}`,
    )
    await page.reload()
    await expect(selector).toHaveValue(first.id)
    await page.goBack()
    await expect(selector).toHaveValue(second.id)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/parent-learning-needs/home-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.goto(`/workspace?view=learners&learner=${first.id}`)
    const unused = page.locator('.parent-request').filter({ hasText: need.goal })
    const used = page.locator('.parent-request').filter({ hasText: booked.goal })
    await expect(used.getByRole('button', { name: 'Delete learning need' })).toHaveCount(0)
    await unused.getByRole('button', { name: 'Delete learning need' }).click()
    await unused.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(unused.getByRole('button', { name: 'Delete learning need' })).toBeFocused()
    await unused.getByRole('button', { name: 'Delete learning need' }).click()
    await page.screenshot({
      path: `docs/visual-qa/parent-learning-needs/delete-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const unused = page.locator('.parent-request').filter({ hasText: need.goal })
  // A booking in another tab is a visible conflict; do not remove the card on failure.
  await page.route(`**/requirements/${need.id}`, (route) =>
    route.fulfill({
      status: 409,
      json: { code: 'requirement_in_use', message: 'Trial already booked' },
    }),
  )
  await unused.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(unused.getByRole('alert')).toContainText('has a trial booking')
  await expect(unused).toBeVisible()
  await page.unroute(`**/requirements/${need.id}`)
  await unused.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(unused).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Learning needs', exact: true })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Learning need deleted.' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.parent-request')).toHaveCount(1)
  const dashboard = await (await page.request.get('/api/v1/dashboard')).json()
  expect(dashboard.requirements.map((item: { id: string }) => item.id)).not.toContain(need.id)
  expect(dashboard.requirements.map((item: { id: string }) => item.id)).toContain(otherNeed.id)
  expect(dashboard.learners).toHaveLength(2)
  expect(dashboard.trials).toHaveLength(1)
  expect(errors).toEqual([])
})
