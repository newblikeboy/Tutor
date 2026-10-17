import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const captureRoot = 'docs/visual-qa/customer-workspaces/parent'

async function capture(page: Page, name: string) {
  await mkdir(captureRoot, { recursive: true })
  for (const [size, width] of [
    ['desktop', 1440],
    ['mobile', 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${captureRoot}/${name}-${size}.png`, fullPage: true })
    if (size === 'mobile' && name === 'selected-learner-home') {
      await page.screenshot({ path: `${captureRoot}/home-viewport-mobile.png` })
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('parent learning space keeps learner choices and reachable mobile journeys', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await verifiedSignup(page.request, {
    headers: { Origin: origin },
    data: {
      name: 'Fictional customer family',
      email: `customer-family-${crypto.randomUUID()}@example.test`,
      password,
      role: 'parent',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: origin, 'X-CSRF-Token': auth.csrf }
  await page.goto('/workspace')
  await expect(page.locator('.parent-welcome')).toBeVisible()
  await expect(page.locator('.learning-motif')).toHaveAttribute('aria-hidden', 'true')
  await capture(page, 'first-use')
  await page.getByRole('main').getByRole('link', { name: 'Add learner', exact: true }).click()
  await expect(page).toHaveURL('/match?new=1&profile=1')
  await expect(page.getByRole('heading', { name: 'Your relationship', exact: true })).toBeVisible()

  const consent = await page.request.post('/api/v1/consents', {
    headers,
    data: { relationship: 'parent', accepted: true },
  })
  expect(consent.status()).toBe(201)
  const consentId = (await consent.json()).id
  const ids: string[] = []
  for (const [name, grade] of [
    ['Aarohi · fictional learner with a long display name', 5],
    ['Kabir · fictional learner', 8],
  ] as const) {
    const learner = await page.request.post('/api/v1/learners', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name, class: grade, board: 'CBSE', language: 'English', kind: 'minor', consentId },
    })
    expect(learner.status(), await learner.text()).toBe(201)
    ids.push((await learner.json()).id)
  }
  await page.goto(`/workspace?learner=${ids[0]}`)
  await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(ids[0])
  await capture(page, 'long-learner-home')
  await page.getByLabel('Learner', { exact: true }).selectOption(ids[1])
  await page.reload()
  await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(ids[1])
  const find = page.getByRole('main').getByRole('link', { name: 'Find a tutor', exact: true })
  await expect(find).toHaveAttribute('href', `/match?learner=${ids[1]}`)
  await capture(page, 'selected-learner-home')
  await find.click()
  await expect(page).toHaveURL(`/match?learner=${ids[1]}`)
  await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(ids[1])
  await expect(page.locator('.parent-finder summary')).toBeVisible()
  await capture(page, 'finder')
  await page.goto(`/workspace?learner=${ids[1]}`)
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  const everyday = page.getByRole('navigation', { name: 'Everyday navigation', exact: true })
  await expect(everyday.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await everyday.getByRole('link', { name: 'Learners', exact: true }).click()
  await expect(page).toHaveURL('/workspace?view=learners')
  await expect(page.getByRole('table', { name: 'Your learners', exact: true })).toBeVisible()
  await capture(page, 'learners-table')
  await page.setViewportSize({ width: 390, height: 1000 })
  await page
    .getByRole('link', { name: 'Kabir · fictional learner View progress', exact: true })
    .click()
  await expect(page).toHaveURL(`/workspace?view=learners&learner=${ids[1]}`)
  await expect(page.getByLabel('Learner', { exact: true })).toHaveValue(ids[1])
  await expect(everyday.getByRole('link', { name: 'Learners', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(
    page.getByRole('heading', { name: 'Kabir · fictional learner', exact: true }),
  ).toBeVisible()
  await capture(page, 'learner-report')
  await page.setViewportSize({ width: 390, height: 1000 })
  const menu = page.getByRole('button', { name: 'Open menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true })
  await page.screenshot({ path: `${captureRoot}/drawer-mobile.png` })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await expect(drawer).toHaveCount(0)
  await everyday.getByRole('link', { name: 'Classes', exact: true }).click()
  await expect(page).toHaveURL('/tuition')
  await expect(everyday.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await everyday.getByRole('link', { name: 'Updates', exact: true }).click()
  await expect(page).toHaveURL('/notifications')
  await expect(everyday.getByRole('link', { name: 'Updates', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.goto(`/workspace?learner=${ids[1]}`)
  await expect(page.locator('.parent-next')).toBeVisible()
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  expect(errors).toEqual([])
})
