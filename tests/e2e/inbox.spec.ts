import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
const origin = 'http://127.0.0.1:5174'
const passphrase = 'Fictional inbox violet river school 428!'
async function login(page: Page, id: string) {
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
  })
  expect(r.status()).toBe(200)
  await page.goto('/notifications')
}
async function activate(page: Page) {
  await page.getByLabel('Inbox passphrase', { exact: true }).fill(passphrase)
  await page.getByLabel('Confirm inbox passphrase', { exact: true }).fill(passphrase)
  await page.getByLabel('I have saved my inbox passphrase somewhere safe.').check()
  await page.getByRole('button', { name: 'Activate inbox', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock inbox', exact: true })).toBeVisible({
    timeout: 30000,
  })
}
async function signup(page: Page, role: 'parent' | 'tutor') {
  const response = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: origin },
    data: {
      email: `inbox-${role}-${Date.now()}@example.test`,
      password: 'E2E-only learning passphrase 426!',
      name: role === 'parent' ? 'Fictional inbox family' : 'Fictional inbox tutor',
      role,
      adult: true,
    },
  })
  expect(response.status()).toBe(201)
  const { user } = await response.json()
  await page.goto('/notifications')
  return user.id as string
}
async function unlock(page: Page) {
  await page.getByLabel('Inbox passphrase', { exact: true }).fill(passphrase)
  await page.getByRole('button', { name: 'Unlock inbox', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock inbox', exact: true })).toBeVisible({
    timeout: 30000,
  })
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.loading-state')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('docs/visual-qa/encrypted-inbox', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/encrypted-inbox/${name}.png`, fullPage: true })
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
}
test('encrypted one-way updates persist with recipient-only read receipts and mobile reflow', async ({
  browser,
}) => {
  test.setTimeout(300000)
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({
        baseURL: origin,
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'Asia/Kolkata',
      }),
    ),
  )
  const [admin, parent, tutor] = await Promise.all(contexts.map((c) => c.newPage()))
  const bodies: string[] = [],
    errors: string[] = []
  for (const page of [admin, parent, tutor]) {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/inbox') && r.method() === 'POST')
        bodies.push(r.postData() ?? '')
    })
  }
  try {
    await login(admin, 'admin-a')
    await capture(admin, 'admin-activate-desktop')
    await activate(admin)
    await capture(admin, 'admin-empty-desktop')
    const parentID = await signup(parent, 'parent')
    await parent.setViewportSize({ width: 390, height: 844 })
    await capture(parent, 'parent-activate-mobile')
    await activate(parent)
    const recipientTutorID = await signup(tutor, 'tutor')
    await activate(tutor)
    await admin.getByRole('link', { name: 'New update', exact: true }).click()
    const recipients = admin.getByLabel('Recipient', { exact: true })
    await expect(recipients).toBeVisible()
    expect(
      (await recipients.locator('option').allTextContents()).some((v) =>
        v.includes('Inbox not activated'),
      ),
    ).toBe(true)
    await recipients.selectOption(`${parentID}|`)
    await admin.getByLabel('Subject', { exact: true }).fill('Your child’s learning review')
    await admin
      .getByLabel('Message', { exact: true })
      .fill(
        'Fictional family update: the learning review is ready. We will cover fractions next week.',
      )
    await capture(admin, 'admin-compose-desktop')
    await admin.setViewportSize({ width: 390, height: 844 })
    await capture(admin, 'admin-compose-mobile')
    // Simulate a lost HTTP response after the server committed the update.
    let lost = false
    await admin.route('**/api/v1/inbox', async (route) => {
      if (route.request().method() !== 'POST' || lost) {
        await route.continue()
        return
      }
      lost = true
      await route.fetch()
      await route.abort('failed')
    })
    await admin.getByRole('button', { name: 'Send encrypted update' }).click()
    await expect(admin.locator('.inbox-compose [role="alert"]')).toBeVisible()
    await expect(admin.getByLabel('Subject', { exact: true })).toHaveValue(
      'Your child’s learning review',
    )
    await admin.getByRole('button', { name: 'Send encrypted update' }).click()
    await expect(admin.getByRole('heading', { name: 'Your child’s learning review' })).toBeVisible({
      timeout: 30000,
    })
    await expect(admin.getByText('Not read yet', { exact: true })).toBeVisible()
    const id = new URL(admin.url()).searchParams.get('id')!
    const detail = async (messageID: string) =>
      (await (await admin.request.get(`/api/v1/inbox/${messageID}`)).json()).message
    const before = await detail(id)
    expect(before.readAt).toBeNull()
    expect(JSON.stringify(before)).not.toContain('fractions')
    expect(JSON.stringify(before)).not.toContain('learning review')
    await admin.setViewportSize({ width: 1440, height: 1000 })
    await capture(admin, 'admin-sent-desktop')
    await parent.reload()
    await expect(
      parent.getByRole('heading', { name: 'Unlock your inbox', exact: true }),
    ).toBeVisible()
    await parent.getByLabel('Inbox passphrase', { exact: true }).fill('A wrong but long passphrase')
    await parent.getByRole('button', { name: 'Unlock inbox', exact: true }).click()
    await expect(parent.getByText('Could not unlock the inbox.', { exact: false })).toBeVisible()
    await unlock(parent)
    await expect(parent.locator('.inbox-row')).toHaveCount(1)
    await expect(parent.locator('.inbox-row')).toContainText('Your child’s learning review')
    await capture(parent, 'parent-inbox-mobile')
    expect((await detail(id)).readAt).toBeNull()
    await parent.locator('.inbox-row').click()
    await expect(
      parent.getByRole('heading', { name: 'Your child’s learning review' }),
    ).toBeVisible()
    await expect.poll(async () => (await detail(id)).readAt).not.toBeNull()
    await expect(parent.locator('.inbox-receipt')).toContainText('Read')
    await expect(parent.getByRole('link', { name: 'New update', exact: true })).toHaveCount(0)
    await expect(parent.locator('textarea')).toHaveCount(0)
    await capture(parent, 'parent-read-mobile')
    await expect(admin.locator('.inbox-receipt')).toContainText('Read', { timeout: 25000 })
    await capture(admin, 'admin-read-desktop')
    await admin.getByRole('link', { name: 'New update', exact: true }).click()
    await recipients.selectOption(`${recipientTutorID}|`)
    await admin.getByLabel('Subject', { exact: true }).fill('Interview preparation')
    await admin
      .getByLabel('Message', { exact: true })
      .fill('Fictional tutor update: please prepare a short lesson demonstration.')
    await admin.getByRole('button', { name: 'Send encrypted update' }).click()
    await expect(admin.getByRole('heading', { name: 'Interview preparation' })).toBeVisible()
    const tutorID = new URL(admin.url()).searchParams.get('id')!
    await tutor.route(`**/api/v1/inbox/${tutorID}`, async (route) => {
      const response = await route.fetch(),
        data = await response.json()
      data.message.ciphertext = data.message.ciphertext.slice(4)
      await route.fulfill({ response, json: data })
    })
    await tutor.goto(`/notifications?folder=inbox&id=${tutorID}`)
    await unlock(tutor)
    await expect(
      tutor.getByText('This update could not be decrypted', { exact: false }),
    ).toBeVisible()
    expect((await detail(tutorID)).readAt).toBeNull()
    await tutor.unroute(`**/api/v1/inbox/${tutorID}`)
    await tutor.reload()
    await unlock(tutor)
    await expect(tutor.getByRole('heading', { name: 'Interview preparation' })).toBeVisible()
    await expect(tutor.locator('.inbox-receipt')).toContainText('Read')
    await tutor.getByRole('link', { name: 'New update', exact: true }).click()
    await expect(tutor.getByLabel('Recipient', { exact: true }).locator('option')).toHaveCount(1)
    await expect(tutor.getByRole('button', { name: 'Send encrypted update' })).toBeDisabled()
    await admin.getByRole('button', { name: 'Lock inbox', exact: true }).click()
    await expect(admin.getByRole('heading', { name: 'Unlock your inbox' })).toBeVisible()
    await expect(admin.getByText('Fictional tutor update:', { exact: false })).toHaveCount(0)
    expect(
      bodies.every(
        (body) =>
          !body.includes(passphrase) &&
          !body.includes('Fictional family update') &&
          !body.includes('Interview preparation'),
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
