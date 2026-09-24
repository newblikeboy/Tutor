import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5174'
async function login(page: Page, role = 'admin') {
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${role}-a@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(response.status()).toBe(200)
}
async function capture(page: Page, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await mkdir('docs/visual-qa/english-only/staff-tabs', { recursive: true })
  await page.screenshot({
    path: `docs/visual-qa/english-only/staff-tabs/${name}.png`,
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}
function requests(page: Page) {
  const paths: string[] = []
  // Development StrictMode can cancel a probe request before remounting.
  // Count completed reads, not those aborted probes.
  page.on('response', (r) => {
    if (r.request().method() === 'GET' && r.status() === 200) paths.push(new URL(r.url()).pathname)
  })
  return paths
}

test('staff groups related queues and loads only the selected overview and network tab', async ({
  page,
}) => {
  await login(page)
  const paths = requests(page)
  await page.goto('/workspace')
  await expect(page.getByRole('tab', { name: 'Upcoming interviews' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(paths.filter((p) => p === '/api/v1/staff/applications')).toHaveLength(0)
  expect(paths.filter((p) => p === '/api/v1/staff/followups')).toHaveLength(0)
  const sidebar = page.locator('.desk-sidebar')
  await expect(sidebar.getByRole('link', { name: 'Interviews', exact: true })).toHaveCount(0)
  await expect(sidebar.getByRole('link', { name: 'Follow-ups', exact: true })).toHaveCount(0)
  await capture(page, 'overview-en-desktop')
  await page.getByRole('tab', { name: 'Upcoming interviews' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Ready for review' })).toBeFocused()
  expect(paths.filter((p) => p === '/api/v1/staff/applications')).toHaveLength(0)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Ready for review' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect.poll(() => paths.filter((p) => p === '/api/v1/staff/applications').length).toBe(1)
  await sidebar.getByRole('link', { name: 'Applications', exact: true }).click()
  await page.getByLabel('Status', { exact: true }).selectOption('approved')
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click()
  expect(new URL(page.url()).searchParams.has('status')).toBe(false)
  await expect(sidebar.getByRole('link', { name: 'Applications', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.goBack()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('approved')
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Applications', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await sidebar.getByRole('link', { name: 'Tutor network', exact: true }).click()
  expect(paths.filter((p) => p === '/api/v1/staff/followups')).toHaveLength(0)
  await page.getByRole('tab', { name: 'Follow-ups', exact: true }).click()
  await expect.poll(() => paths.filter((p) => p === '/api/v1/staff/followups').length).toBe(1)
  await expect(sidebar.getByRole('link', { name: 'Tutor network', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.language-button')).toHaveCount(0)
  await capture(page, 'followups-en-mobile')
})

test('applicant tabs defer files and history, preserve unfinished review forms and survive reload', async ({
  page,
}) => {
  await login(page)
  const paths = requests(page)
  await page.goto('/workspace?view=tutors&application=tutor-arjun')
  await expect(page.locator('.staff-person-heading')).toContainText('Arjun')
  await expect(page.getByRole('tab', { name: 'Application', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(
    paths.filter(
      (p) => p === '/api/v1/staff/events' || p.endsWith('/files') || p === '/api/v1/staff/members',
    ),
  ).toHaveLength(0)
  await capture(page, 'application-en-desktop')
  await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
  await page
    .locator('summary')
    .filter({ hasText: /^Internal note$/ })
    .click()
  const note = page.getByLabel('Internal note', { exact: true })
  await note.fill('Unfinished review input stays here when changing tabs.')
  await page.getByRole('tab', { name: 'History', exact: true }).click()
  await expect(page.locator('.staff-history')).toBeVisible()
  expect(paths.filter((p) => p === '/api/v1/staff/events')).toHaveLength(1)
  expect(paths.filter((p) => p.endsWith('/files'))).toHaveLength(0)
  await page.getByRole('tab', { name: 'Review & decision', exact: true }).click()
  await expect(note).toHaveValue('Unfinished review input stays here when changing tabs.')
  await capture(page, 'review-en-desktop')
  await page.getByRole('tab', { name: 'Documents', exact: true }).click()
  await expect.poll(() => paths.filter((p) => p.endsWith('/files')).length).toBe(1)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.language-button')).toHaveCount(0)
  await capture(page, 'documents-en-mobile')
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('staff payment tables load separately and finance keeps its own navigation', async ({
  page,
}) => {
  await login(page, 'finance')
  const paths = requests(page)
  await page.goto('/billing')
  await expect(page.getByRole('tab', { name: 'Payment records', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('No payment records yet', { exact: true })).toBeVisible()
  expect(paths.filter((p) => p === '/api/v1/billing')).toHaveLength(1)
  expect(paths.filter((p) => p === '/api/v1/jobs')).toHaveLength(0)
  await page.getByRole('tab', { name: 'Payment follow-ups', exact: true }).click()
  await expect.poll(() => paths.filter((p) => p === '/api/v1/jobs').length).toBe(1)
  await capture(page, 'payments-en-desktop')
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Payment follow-ups', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(
    page.locator('.desk-sidebar').getByRole('link', { name: 'Applications', exact: true }),
  ).toHaveCount(0)
  expect((await page.request.get('/api/v1/staff/applications')).status()).toBe(403)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.language-button')).toHaveCount(0)
  await capture(page, 'payments-en-mobile')
})

test('mentor interview links stay inside assessments', async ({ page }) => {
  await login(page, 'mentor')
  await page.goto('/workspace?view=interviews')
  const sidebar = page.locator('.desk-sidebar')
  await expect(sidebar.getByRole('link', { name: 'Assessments', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('tab', { name: 'Interviews', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(sidebar.getByRole('link', { name: 'Tutor network', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Applications', exact: true }).click()
  await expect(page).toHaveURL(/view=assessments/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Applications', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(sidebar.getByRole('link', { name: 'Lesson reviews', exact: true })).toBeVisible()
})
