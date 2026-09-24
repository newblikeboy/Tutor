import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
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
  await mkdir('docs/visual-qa', { recursive: true })
  await page.screenshot({ path: `docs/visual-qa/english-only/${name}.png`, fullPage: true })
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
    await parent.getByText('Start a request', { exact: true }).click()
    await parent.getByLabel('A short title').fill('Help with an agreed schedule')
    await parent
      .getByLabel('Tell us what happened')
      .fill('Please explain how the family and tutor can agree a change of teaching time.')
    await capture(parent, 'support-request-en-desktop')
    await parent.getByRole('button', { name: 'Save request', exact: true }).click()
    await expect(parent).toHaveURL(/\/cases\/.+/)
    const path = new URL(parent.url()).pathname
    await support.goto(path)
    await expect(
      support.getByRole('heading', { name: 'Restricted request', exact: true }),
    ).toBeVisible()
    await expect(
      support.getByText(
        'Please explain how the family and tutor can agree a change of teaching time.',
      ),
    ).toHaveCount(0)
    await support.getByRole('button', { name: 'Take responsibility' }).click()
    await expect(
      support.getByRole('heading', { name: 'Help with an agreed schedule' }),
    ).toBeVisible()
    await support.getByLabel('Request status').selectOption('resolve')
    await support
      .getByLabel('Response or decision evidence')
      .fill(
        'Use Propose a new time in the tuition calendar. The other party must accept before the reservation changes.',
      )
    await capture(support, 'support-operator-en-desktop')
    await support.getByRole('button', { name: 'Save response', exact: true }).click()
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
      .getByLabel('Response or decision evidence')
      .fill('Please also clarify how the makeup session balance is kept.')
    await parent.getByRole('button', { name: 'Save response', exact: true }).click()
    await expect(parent.getByText('Open', { exact: true })).toBeVisible()
    await parent.goto('/notifications')
    await expect(
      parent.getByRole('heading', { name: 'Your support request has an update' }).first(),
    ).toBeVisible()
    await parent.getByRole('link', { name: 'Open request update' }).first().click()
    await expect(parent).toHaveURL(new RegExp(path))
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
