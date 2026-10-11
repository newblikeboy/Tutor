import { connectGoogle } from './helpers/google'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'
import { verifiedSignup } from './signup-fixture'

const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const captureRoot = 'docs/visual-qa/mentor-workspace/intercon-layout'

async function capture(page: Page, name: string) {
  await mkdir(captureRoot, { recursive: true })
  for (const [size, width] of [
    ['desktop', 1440],
    ['mobile', 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${captureRoot}/${name}-${size}.png`, fullPage: true })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('mentor overview recovers from an unavailable API and shows an honest empty queue', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'mentor-a@example.test', password },
  })
  expect(login.status()).toBe(200)
  await page.route('**/api/v1/staff/overview', (route) =>
    route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Test API outage' } }),
  )
  await page.goto('/workspace')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.locator('.staff-metrics')).toHaveCount(0)
  await capture(page, 'overview-error')
  await page.unroute('**/api/v1/staff/overview')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No applications in this queue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Next interview', exact: true })).toHaveCount(0)
  await capture(page, 'overview-empty')
})

test('mentor workspace keeps real assignments, filters, interview gates and mobile navigation', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const applicants: string[] = []
  for (const label of ['interview', 'application']) {
    const context = await browser.newContext({ baseURL: origin })
    try {
      const signup = await verifiedSignup(context.request, {
        headers: { Origin: origin },
        data: {
          name: `Fictional mentor ${label}`,
          email: `mentor-design-${label}-${Date.now()}@example.test`,
          password,
          role: 'tutor',
          adult: true,
        },
      })
      expect(signup.status()).toBe(201)
      const account = await signup.json()
      const profile = applicationProfile(`Fictional mentor ${label}`)
      profile.about.location = {
        address: 'Fictional test location',
        locality: 'Line Bazar',
        city: 'Purnea',
        district: 'Purnea',
        state: 'Bihar',
        country: 'India',
        postalCode: '854301',
        latitude: 25.77,
        longitude: 87.47,
        accuracyMeters: 100,
        source: 'manual',
      }
      const submitted = await context.request.put('/api/v1/application', {
        headers: { Origin: origin, 'X-CSRF-Token': account.csrf },
        data: { version: 0, step: 5, profile, submit: true },
      })
      expect(submitted.status(), await submitted.text()).toBe(200)
      expect((await submitted.json()).assessorId).toBe('mentor-a')
      applicants.push(account.user.id)
    } finally {
      await context.close()
    }
  }
  const login = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: 'mentor-a@example.test', password },
  })
  expect(login.status()).toBe(200)
  const session = await login.json()
  await connectGoogle(page)
  const start = new Date(Date.now() + 60 * 60_000)
  const scheduled = await page.request.post(`/api/v1/applications/${applicants[0]}/decision`, {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
    data: {
      action: 'schedule',
      version: 1,
      interview: {
        start: start.toISOString(),
        end: new Date(+start + 30 * 60_000).toISOString(),
        timezone: 'Asia/Kolkata',
      },
    },
  })
  expect(scheduled.status(), await scheduled.text()).toBe(200)
  await expect
    .poll(async () => {
      const detail = await (
        await page.request.get(`/api/v1/staff/applications/${applicants[0]}`)
      ).json()
      return detail.application.interview.syncStatus
    })
    .toBe('ready')
  await page.goto('/workspace')
  const overview = await (await page.request.get('/api/v1/staff/overview')).json()
  await expect(page.locator('.staff-metrics strong')).toHaveText([
    String(overview.counts.submitted ?? 0),
    String((overview.counts.under_review ?? 0) + (overview.counts.assessed ?? 0)),
    String(overview.counts.assessment_scheduled ?? 0),
    String(overview.counts.approved ?? 0),
  ])
  await expect(page.getByRole('heading', { name: 'Mentor overview', exact: true })).toBeVisible()
  const groups = ['Tutor approval', 'Learner support', 'Account & support']
  const sidebar = page.locator('.desk-sidebar')
  await expect(sidebar.locator('.mentor-nav-group')).toHaveText(groups)
  await expect(sidebar.getByRole('link', { name: 'Mentor logins', exact: true })).toHaveCount(0)
  const applicationsTab = page.getByRole('tab', { name: 'New applications', exact: true })
  await expect(applicationsTab).toHaveAttribute('aria-selected', 'true')
  await applicationsTab.focus()
  await page.keyboard.press('ArrowRight')
  const interviewsTab = page.getByRole('tab', { name: 'Upcoming interviews', exact: true })
  await expect(interviewsTab).toBeFocused()
  await expect(applicationsTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(interviewsTab).toHaveAttribute('aria-selected', 'true')
  await applicationsTab.click()
  await expect(page.getByText('Fictional mentor application', { exact: true })).toBeVisible()
  await expect(page.getByText('Fictional mentor interview', { exact: true })).toBeVisible()
  await capture(page, 'overview')
  await page.goto('/workspace?view=assessments')
  await expect(
    page.locator('.staff-row').filter({ hasText: 'Fictional mentor application' }),
  ).toBeVisible()
  await capture(page, 'applications')
  const mode = page.getByLabel('Requested teaching mode', { exact: true })
  await mode.selectOption('home')
  await page.getByLabel('Search applicants', { exact: true }).fill('Fictional mentor application')
  await expect(page.locator('.staff-rows .staff-row')).toHaveCount(1)
  await page.reload()
  await expect(page.getByLabel('Search applicants', { exact: true })).toHaveValue(
    'Fictional mentor application',
  )
  await expect(mode).toHaveValue('home')
  await expect(page.locator('.staff-rows .staff-row')).toHaveCount(1)
  await page.locator('.staff-row').click()
  await expect(page).toHaveURL(new RegExp(`application=${applicants[1]}`))
  await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
  await expect(page.locator('.staff-approval-grid > section')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Reject application', exact: true })).toBeVisible()
  await capture(page, 'approval')
  await page.goto(`/workspace?view=assessments&application=${applicants[0]}&tab=review`)
  await expect(page.getByRole('link', { name: 'Join Meeting' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve tutor', exact: true })).toBeDisabled()
  await capture(page, 'interview')
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  const menu = page.getByRole('button', { name: 'Open menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true })
  await expect(drawer.locator('.mentor-nav-group')).toHaveText(groups)
  await expect(
    drawer.getByRole('link', { name: 'Tutor applications', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: `${captureRoot}/drawer-mobile.png` })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menu).toBeFocused()
  await menu.click()
  await drawer.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page).toHaveURL('/workspace')
  await expect(drawer).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await sidebar.getByRole('link', { name: 'Lesson reviews', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lesson reviews', exact: true })).toBeVisible()
  await capture(page, 'lesson-reviews')
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  const current = await (
    await page.request.get(`/api/v1/staff/applications/${applicants[0]}`)
  ).json()
  const deny = await page.request.post(`/api/v1/applications/${applicants[0]}/decision`, {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
    data: {
      action: 'suspend',
      version: current.application.version,
      reason: 'Mentors cannot perform administrative suspension.',
    },
  })
  expect(deny.status()).toBe(403)
  // Release this shared test host through the real API before lesson tests use it.
  const cancelled = await page.request.post(`/api/v1/applications/${applicants[0]}/decision`, {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
    data: {
      action: 'cancel_interview',
      version: current.application.version,
      reason: 'Close the fictional interview after the workspace checks.',
    },
  })
  expect(cancelled.status(), await cancelled.text()).toBe(200)
  expect(errors).toEqual([])
})
