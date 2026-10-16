import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
test.use({ actionTimeout: 12000 })
async function login(page: Page, id: string) {
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(r.status()).toBe(200)
}
async function capture(page: Page, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('docs/visual-qa/help-tickets', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/help-tickets/${name}.png`, fullPage: true })
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
}
test('requester and assigned operator complete a private support request and preserve reopening', async ({
  browser,
}) => {
  test.setTimeout(120000)
  const contexts = await Promise.all(
    Array.from({ length: 2 }, () =>
      browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } }),
    ),
  )
  const [parent, support] = await Promise.all(contexts.map((c) => c.newPage()))
  try {
    await login(parent, 'parent-b')
    await login(support, 'support-a')
    await support.goto('/workspace')
    await expect(support).toHaveURL('/cases')
    expect((await support.request.get('/api/v1/dashboard')).status()).toBe(403)
    await parent.goto('/cases')
    await capture(parent, 'empty-desktop')
    await parent.getByRole('link', { name: 'New ticket', exact: true }).click()
    await parent.getByLabel('Subject', { exact: true }).fill('Help with an agreed schedule')
    await parent
      .getByLabel('Describe your issue')
      .fill('Please explain how the family and tutor can agree a change of teaching time.')
    await capture(parent, 'support-request-en-desktop')
    await parent.setViewportSize({ width: 390, height: 844 })
    await capture(parent, 'new-ticket-mobile')
    await parent.setViewportSize({ width: 1440, height: 1000 })
    await parent.getByRole('button', { name: 'Submit ticket', exact: true }).click()
    await expect(parent).toHaveURL(/\/cases\/.+/)
    const path = new URL(parent.url()).pathname
    await support.goto(path)
    await expect(
      support.getByRole('heading', { name: 'Restricted ticket', exact: true }),
    ).toBeVisible()
    await expect(
      support.getByText(
        'Please explain how the family and tutor can agree a change of teaching time.',
      ),
    ).toHaveCount(0)
    await capture(support, 'restricted-ticket-desktop')
    await support.getByRole('button', { name: 'Take ticket', exact: true }).click()
    await expect(
      support.getByRole('heading', { name: 'Help with an agreed schedule' }),
    ).toBeVisible()
    await support.getByLabel('After sending').selectOption('waiting_family')
    await support
      .getByLabel('Your reply', { exact: true })
      .fill('Please confirm the class date that you want to change.')
    await support.getByRole('button', { name: 'Request information', exact: true }).click()
    await parent.reload()
    await expect(parent.locator('.ticket-detail-heading')).toContainText('Awaiting your reply')
    await parent
      .getByLabel('Your reply', { exact: true })
      .fill('The class is next Tuesday at the agreed teaching time.')
    await parent.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(parent.locator('.ticket-detail-heading')).toContainText('In progress')
    await support.reload()
    await expect(
      support.getByText('The class is next Tuesday at the agreed teaching time.', { exact: true }),
    ).toBeVisible()
    await support.getByLabel('After sending').selectOption('resolve')
    await support
      .getByLabel('Resolution details')
      .fill(
        'Use Propose a new time in the tuition calendar. The other party must accept before the reservation changes.',
      )
    await capture(support, 'support-operator-en-desktop')
    await support.getByRole('button', { name: 'Resolve ticket', exact: true }).click()
    await expect(support.getByText('Resolved', { exact: true })).toBeVisible()
    await parent.reload()
    await expect(
      parent.getByText(
        'Use Propose a new time in the tuition calendar. The other party must accept before the reservation changes.',
      ),
    ).toBeVisible()
    await parent.setViewportSize({ width: 390, height: 844 })
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await capture(parent, 'support-response-en-mobile')
    await expect(parent.locator('.language-button')).toHaveCount(0)
    await parent
      .getByLabel('What still needs help?')
      .fill('Please also clarify how the makeup session balance is kept.')
    await parent.getByRole('button', { name: 'Reopen ticket', exact: true }).click()
    await expect(parent.getByText('Open', { exact: true })).toBeVisible()
    await parent.getByRole('link', { name: 'Back to tickets', exact: true }).click()
    await expect(parent.getByRole('tab', { name: 'All tickets (1)', exact: true })).toBeVisible()
    await capture(parent, 'ticket-list-mobile')
    await parent.setViewportSize({ width: 1440, height: 1000 })
    await capture(parent, 'ticket-list-desktop')
    await parent.getByRole('tab', { name: /^Resolved/ }).click()
    await expect(
      parent.getByRole('heading', { name: 'No tickets match these filters' }),
    ).toBeVisible()
    await parent.getByRole('tab', { name: /^Active/ }).click()
    await parent
      .getByRole('searchbox', { name: 'Search tickets', exact: true })
      .fill('agreed schedule')
    await parent.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(parent).toHaveURL(/q=agreed\+schedule/)
    await parent.reload()
    await expect(
      parent.getByRole('link', { name: 'Help with an agreed schedule', exact: true }),
    ).toBeVisible()
    await parent.getByRole('link', { name: 'Help with an agreed schedule', exact: true }).click()
    await parent.getByRole('link', { name: 'Back to tickets', exact: true }).click()
    await expect(parent).toHaveURL(/q=agreed\+schedule/)
    await parent.goto('/notifications?folder=activity')
    await expect(
      parent.getByRole('heading', { name: 'Your support request has an update' }).first(),
    ).toBeVisible()
    await parent.getByRole('link', { name: 'Open request update' }).first().click()
    await expect(parent).toHaveURL(new RegExp(path))
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('tutor tickets preserve failed drafts, recent history and filtered pagination', async ({
  page,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page, 'tutor-arjun')
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:/)
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  try {
    const db = mongo.db(runtime.databaseName)
    await page.goto('/cases?new=1')
    await page.getByLabel('What can we help with?').selectOption('privacy_deletion')
    await expect(page.getByText(/Saving a request does not erase data/)).toBeVisible()
    await page.getByLabel('What can we help with?').selectOption('support')
    await page.getByLabel('Subject', { exact: true }).fill('Help with Google Calendar connection')
    await page
      .getByLabel('Describe your issue')
      .fill('The sample connection needs help after reconnecting my Google account.')
    let failedKey = ''
    await page.route('**/api/v1/cases', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      failedKey = route.request().headers()['idempotency-key']
      return route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Fictional ticket submission outage' },
      })
    })
    await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
      'Help with Google Calendar connection',
    )
    await expect(page).toHaveURL('/cases?new=1')
    await capture(page, 'new-ticket-error-desktop')
    await page.unroute('**/api/v1/cases')
    const retried = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/cases'),
    )
    await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
    expect((await retried).headers()['idempotency-key']).toBe(failedKey)
    await expect(page).toHaveURL(/\/cases\/.+/)
    const path = new URL(page.url()).pathname
    const caseID = path.split('/').at(-1)!
    const now = Date.now()
    await db.collection('case_messages').insertMany(
      Array.from({ length: 28 }, (_, index) => ({
        _id: `${String(index).padStart(20, '0')}_history` as never,
        caseId: caseID,
        authorId: 'tutor-arjun',
        authorName: 'Arjun · sample',
        authorRole: 'tutor',
        body: `Sample historical reply ${index + 1}. Kept with the original ticket.`,
        createdAt: new Date(now - (28 - index) * 60000),
      })),
    )
    await page.reload()
    await expect(
      page.getByText('Sample historical reply 28. Kept with the original ticket.', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Sample historical reply 1. Kept with the original ticket.', { exact: true }),
    ).toHaveCount(0)
    const draft = 'Please also explain which account should host the online lesson.'
    await page.getByLabel('Your reply', { exact: true }).fill(draft)
    await page.getByRole('button', { name: 'Earlier replies', exact: true }).click()
    await expect(
      page.getByText('Sample historical reply 1. Kept with the original ticket.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue(draft)
    await capture(page, 'tutor-history-desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await capture(page, 'tutor-history-mobile')
    await page.getByRole('button', { name: 'Latest replies', exact: true }).click()
    await expect(
      page.getByText('Sample historical reply 28. Kept with the original ticket.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue(draft)
    await page.route(`**/api/v1${path}/action`, (route) =>
      route.fulfill({
        status: 409,
        json: { code: 'stale_version', message: 'Fictional concurrent ticket update' },
      }),
    )
    await page.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Your draft is kept')
    await page.getByRole('button', { name: 'Refresh conversation', exact: true }).click()
    await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue(draft)
    await page.unroute(`**/api/v1${path}/action`)
    await page.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue('')
    await expect(page.getByText(draft, { exact: true })).toBeVisible()
    expect(
      await db.collection('case_messages').countDocuments({ caseId: caseID, body: draft }),
    ).toBe(1)
    await db.collection('cases').insertMany(
      Array.from({ length: 32 }, (_, index) => ({
        _id: `sample-tutor-history-${String(index).padStart(3, '0')}` as never,
        ownerId: 'tutor-arjun',
        kind: 'support',
        title: `History filter fixture ${index + 1}`,
        body: 'Fictional ticket for checking the support queue pagination.',
        status: 'open',
        assignedTo: '',
        version: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now + index * 1000),
      })),
    )
    await page.goto('/cases?q=History+filter&kind=support&status=active')
    await expect(page.getByRole('tab', { name: 'All tickets (32)', exact: true })).toBeVisible()
    await expect(page.locator('.ticket-table tbody tr')).toHaveCount(25)
    await expect(page.locator('.ticket-table tbody tr').first()).toContainText(
      'History filter fixture 32',
    )
    const width = await page
      .locator('.desk-main')
      .evaluate(
        (node) =>
          node.clientWidth -
          parseFloat(getComputedStyle(node).paddingLeft) -
          parseFloat(getComputedStyle(node).paddingRight),
      )
    expect((await page.locator('.help-page').boundingBox())!.width).toBeGreaterThanOrEqual(
      width - 2,
    )
    await capture(page, 'tutor-list-mobile')
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.locator('.ticket-table tbody tr')).toHaveCount(7)
    await expect(page).toHaveURL(/cursor=/)
    await page.reload()
    await expect(page.locator('.ticket-table tbody tr')).toHaveCount(7)
    await page.getByLabel('Category', { exact: true }).selectOption('matching')
    await expect(
      page.getByRole('heading', { name: 'No tickets match these filters' }),
    ).toBeVisible()
    expect(new URL(page.url()).searchParams.has('cursor')).toBe(false)
    await page.getByRole('link', { name: 'Clear filters', exact: true }).click()
    await page.route('**/api/v1/cases?*', (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Fictional ticket list outage' },
      }),
    )
    await page.reload()
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await capture(page, 'ticket-list-error-mobile')
    await page.unroute('**/api/v1/cases?*')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.ticket-table tbody tr')).toHaveCount(25)
    for (const width of [360, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const allTickets = page.getByRole('tab', { name: /^All tickets/ })
    await allTickets.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /^Active/ })).toBeFocused()
    await expect(allTickets).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/status=active/)
    await expect(page.locator('.ticket-table tbody tr')).toHaveCount(25)
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => {
      document.documentElement.style.zoom = ''
    })
    await capture(page, 'tutor-list-wide')
    expect(errors).toEqual([])
  } finally {
    await mongo.close()
  }
})
