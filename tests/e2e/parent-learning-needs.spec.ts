import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('saved learner context leads directly to the finder and retains historical requirements', async ({
  page,
}) => {
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
  await mkdir('docs/visual-qa/parent-learning-needs', { recursive: true })
  await mkdir('docs/visual-qa/parent-navigation', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/workspace?learner=${second.id}`)
    const selector = page.getByLabel('Learner', { exact: true })
    await expect(selector).toHaveValue(second.id)
    await expect(page.locator('.parent-next a')).toHaveAttribute(
      'href',
      `/match?learner=${second.id}`,
    )
    await selector.selectOption(first.id)
    await expect(page).toHaveURL(new RegExp(`learner=${first.id}`))
    await expect(page.locator('.parent-next a')).toHaveAttribute(
      'href',
      `/match?learner=${first.id}`,
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
    if (width === 390) await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await expect(
      page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', {
        name: 'Find a tutor',
        exact: true,
      }),
    ).toHaveCount(0)
    await page.screenshot({
      path: `docs/visual-qa/parent-navigation/menu-${width}.png`,
      fullPage: true,
    })
    if (width === 390) await page.keyboard.press('Escape')
    await page.getByRole('main').getByRole('link', { name: 'Find a tutor', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/match\\?learner=${second.id}`))
    await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(second.id)
    await page.goto(`/workspace?view=learners&learner=${first.id}`)
    await expect(page.getByRole('heading', { name: 'Learning needs', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add learning needs', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'Edit profile', exact: true }).click()
    await expect(page.getByLabel('First name or nickname')).toHaveValue(first.name)
  }
  const dashboard = await (await page.request.get('/api/v1/dashboard')).json()
  expect(dashboard.requirements.map((item: { id: string }) => item.id)).toContain(need.id)
  expect(dashboard.learners).toHaveLength(2)
  expect(dashboard.trials).toHaveLength(0)
  expect(errors).toEqual([])
})
