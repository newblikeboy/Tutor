import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const password = 'E2E-only learning passphrase 426!'
async function signIn(page: Page, baseURL: string, identity: string) {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: new URL(baseURL).origin },
    data: { email: `${identity}@example.test`, password },
  })
  expect(response.status()).toBe(200)
  return response.json()
}
for (const scenario of [
  { role: 'parent', identity: 'parent-b', views: ['My learners', 'Sessions', 'Learning progress'] },
  { role: 'tutor', identity: 'tutor-meera', views: ['Sessions', 'My application'] },
  { role: 'mentor', identity: 'mentor-a', views: ['Assessments', 'Lesson reviews'] },
  { role: 'admin', identity: 'admin-a', views: ['Tutor network', 'Decision history'] },
]) {
  test(`${scenario.role} workspace has usable private navigation and bilingual responsive views`, async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await signIn(page, baseURL!, scenario.identity)
    await page.goto('/workspace')
    await page.locator('.desk-content').waitFor()
    await expect(page.locator('.site-header')).toHaveCount(0)
    await expect(page.locator('.footer-grid')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    await mkdir('docs/visual-qa', { recursive: true })
    for (const language of ['en', 'hi']) {
      if (language === 'hi') await page.locator('.language-button').click()
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        if (width === 390 || width === 1440) {
          await page.screenshot({
            path: `docs/visual-qa/workspace-${scenario.role}-${language}-${width}.png`,
            fullPage: true,
          })
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        }
      }
    }
    await page.locator('.language-button').click()
    for (const label of scenario.views) {
      await page.locator('.desk-sidebar').getByRole('link', { name: label, exact: true }).click()
      await page.reload()
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
      await expect(
        page.locator('.desk-sidebar').getByRole('link', { name: label, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
    await page.setViewportSize({ width: 390, height: 1000 })
    const menu = page.getByRole('button', { name: 'Open menu' })
    await menu.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: `docs/visual-qa/workspace-${scenario.role}-mobile-menu.png` })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    await menu.click()
    await page.getByRole('dialog').getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/workspace')
    await page.setViewportSize({ width: 720, height: 1000 })
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/visual-qa/workspace-${scenario.role}-200-percent.png` })
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1'
    })
    expect(errors).toEqual([])
  })
}

test('staff queue filters preserve their view on reload and produce a real empty result', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!, 'mentor-a')
  await page.goto('/workspace?view=assessments')
  await page.getByLabel('Search applications', { exact: true }).fill('Arjun')
  await page.getByLabel('Application status', { exact: true }).selectOption('approved')
  await expect(page.locator('.queue .record-card')).toHaveCount(1)
  await expect(page.locator('.queue')).toContainText('Arjun')
  await expect(page).toHaveURL('/workspace?view=assessments&q=Arjun&status=approved')
  await page.reload()
  await expect(page.getByLabel('Search applications', { exact: true })).toHaveValue('Arjun')
  await expect(page.getByLabel('Application status', { exact: true })).toHaveValue('approved')
  await page.getByLabel('Search applications', { exact: true }).fill('No such fictional tutor')
  await expect(page.getByRole('heading', { name: 'No applications match this view' })).toBeVisible()
  await page.screenshot({ path: 'docs/visual-qa/workspace-queue-empty.png', fullPage: true })
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.locator('.queue .record-card').first()).toBeVisible()
  await expect(page).toHaveURL('/workspace?view=assessments')
})

test('workspace loading, retry, session failure and sign-out preserve access boundaries', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!, 'parent-b')
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/dashboard', async (route) => {
    await pending
    await route.abort('failed')
  })
  await page.goto('/workspace')
  await expect(page.locator('.desk-main .loading-state')).toBeVisible()
  await page.screenshot({ path: 'docs/visual-qa/workspace-loading.png' })
  release()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await page.screenshot({ path: 'docs/visual-qa/workspace-error.png' })
  await page.unroute('**/api/v1/dashboard')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.desk-content')).toBeVisible()
  await page.route('**/api/v1/auth/session', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Your workspace couldn’t be opened')
  await expect(page.locator('.desk-content')).toHaveCount(0)
  await page.unroute('**/api/v1/auth/session')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.desk-content')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/workspace?view=sessions')
  await expect(page.getByRole('heading', { name: 'Your learning space is private.' })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in to continue' }).click()
  await expect(page).toHaveURL(/\/login\?return=%2Fworkspace%3Fview%3Dsessions/)
  await signIn(page, baseURL!, 'support-a')
  await page.goto('/workspace?view=tutors')
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'This area is not available to your role',
  )
  await expect(page.getByRole('button', { name: 'Suspend new bookings' })).toHaveCount(0)
})

test('family learner selection uses real owned records and persists across views and reload', async ({
  page,
  baseURL,
}) => {
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: new URL(baseURL!).origin },
    data: {
      name: 'Fictional workspace parent',
      email: 'workspace-family@example.test',
      password,
      role: 'parent',
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  const headers = { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': auth.csrf }
  const consent = await page.request.post('/api/v1/consents', {
    headers,
    data: { relationship: 'parent', accepted: true },
  })
  expect(consent.ok()).toBe(true)
  const consentId = (await consent.json()).id
  const ids: string[] = []
  for (const [name, goal] of [
    [
      'Aarohi · fictional learner with a deliberately long display name',
      'Practise comparing fractions using a number line.',
    ],
    ['Kabir · fictional learner', 'Understand ratios through everyday examples.'],
  ]) {
    const learner = await page.request.post('/api/v1/learners', {
      headers,
      data: { name, class: 8, board: 'CBSE', language: 'Hindi', kind: 'minor', consentId },
    })
    expect(learner.ok()).toBe(true)
    const id = (await learner.json()).id
    ids.push(id)
    expect(
      (
        await page.request.post('/api/v1/requirements', {
          headers,
          data: { learnerId: id, goal, locality: 'Purnea' },
        })
      ).ok(),
    ).toBe(true)
  }
  await page.goto('/workspace?view=learners')
  await page.getByRole('combobox', { name: 'Selected learner', exact: true }).selectOption(ids[1])
  await expect(page.locator('.learner-focus')).toContainText('Understand ratios')
  await expect(page.locator('.desk-needs')).not.toContainText('comparing fractions')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Selected learner', exact: true })).toHaveValue(
    ids[1],
  )
  await page.locator('.desk-sidebar').getByRole('link', { name: 'Learning progress' }).click()
  await expect(page.getByRole('combobox', { name: 'Selected learner', exact: true })).toHaveValue(
    ids[1],
  )
  await page.locator('.desk-sidebar').getByRole('link', { name: 'My learners' }).click()
  await page.getByRole('combobox', { name: 'Selected learner', exact: true }).selectOption(ids[0])
  await expect(page).toHaveURL(`/workspace?view=learners&learner=${ids[0]}`)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('My learners')
  await page.setViewportSize({ width: 360, height: 1000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/visual-qa/workspace-long-learner-name.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
