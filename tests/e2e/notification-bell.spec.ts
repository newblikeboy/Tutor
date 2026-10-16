import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb')
const origin = 'http://127.0.0.1:5174'
const password = 'E2E-only learning passphrase 426!'
const output = 'docs/visual-qa/notification-bell'
async function login(page: Page, id: string) {
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email: `${id}@example.test`, password },
      })
    ).status(),
  ).toBe(200)
}
async function write(page: Page, path: string, body: unknown) {
  const auth = await (await page.request.get('/api/v1/auth/session')).json()
  return page.request.post(`/api/v1${path}`, {
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': crypto.randomUUID() },
    data: body,
  })
}
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    const popup = page.getByRole('dialog', { name: 'Notifications', exact: true })
    if (await popup.isVisible()) {
      await expect
        .poll(async () => {
          const box = await popup.boundingBox()
          return !!box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 1000
        })
        .toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('notification bell counts both owned channels beyond pagination and stays available to every role', async ({
  page,
}) => {
  test.setTimeout(150000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  expect((await page.request.get('/api/v1/notifications/status')).status()).toBe(401)
  expect((await page.request.get('/api/v1/notifications/recent')).status()).toBe(401)
  const runtime = JSON.parse(await readFile('.local/e2e-runtime.json', 'utf8'))
  expect(runtime.databaseName).toMatch(/^tutor_e2e_\d+$/)
  expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:/)
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  try {
    const db = mongo.db(runtime.databaseName)
    const roles = [
      'parent-a',
      'tutor-arjun',
      'mentor-a',
      'admin-a',
      'support-a',
      'finance-a',
      'tutor-a',
    ]
    const fixtureNow = Date.now()
    const docs = roles.flatMap((ownerId) =>
      Array.from({ length: ownerId === 'parent-a' ? 30 : 3 }, (_, index) => ({
        _id: `bell:${ownerId}:${index.toString().padStart(3, '0')}`,
        ownerId,
        kind: 'case_update',
        targetId: 'fictional-bell-case',
        read: false,
        createdAt: new Date(fixtureNow - index * 60000),
      })),
    )
    await db.collection('notifications').insertMany(docs as never[])
    await db.collection('notifications').insertOne({
      _id: 'bell-parent-a-already-read' as never,
      ownerId: 'parent-a',
      kind: 'case_update',
      targetId: 'fictional-bell-case',
      read: true,
      readAt: new Date(),
      createdAt: new Date('2020-01-01T00:00:00Z'),
    })
    await login(page, 'admin-a')
    const delivered = await write(page, '/inbox', {
      nonce: crypto.randomUUID(),
      recipientId: 'parent-a',
      enrollmentId: '',
      subject: 'Fictional bell update',
      body: 'Sample notification to verify the workspace bell and recipient read count.',
    })
    expect(delivered.status(), await delivered.text()).toBe(201)
    const message = await delivered.json()
    await login(page, 'parent-a')
    const request = await write(page, '/cases', {
      kind: 'support',
      title: 'Fictional notification panel request',
      body: 'A sample request for checking the notification detail navigation.',
    })
    expect(request.status()).toBe(201)
    const serviceCase = await request.json()
    await db
      .collection('notifications')
      .updateMany({ ownerId: 'parent-a' }, { $set: { targetId: serviceCase.id } })
    let bell = page.getByRole('button', { name: /^Notifications/ })
    let panel = page.getByRole('dialog', { name: 'Notifications', exact: true })
    const freshPage = async () => {
      const context = page.context()
      await page.close()
      page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      bell = page.getByRole('button', { name: /^Notifications/ })
      panel = page.getByRole('dialog', { name: 'Notifications', exact: true })
    }
    for (const id of roles) {
      await freshPage()
      await login(page, id)
      await page.goto('/workspace')
      await expect(page.locator('.desk-main h1').first()).toBeVisible()
      await expect(page.locator('.desk-main .loading-state')).toHaveCount(0)
      const expected = id === 'parent-a' ? 31 : 3
      await expect(bell).toHaveAccessibleName(`Notifications, ${expected} unread`)
      await expect(bell.locator('.workspace-notification-count')).toHaveText(String(expected))
      const status = await (
        await page.request.get('/api/v1/notifications/status?ownerId=parent-b')
      ).json()
      expect(status).toEqual({
        unreadCount: expected,
        activityUnreadCount: expected - (id === 'parent-a' ? 1 : 0),
        updatesUnreadCount: id === 'parent-a' ? 1 : 0,
      })
      await bell.focus()
      const current = page.url()
      await page.keyboard.press('Enter')
      await expect(panel).toBeVisible()
      await expect(page).toHaveURL(current)
      await expect(page.locator('.site-header')).toHaveCount(0)
      await expect(page.locator('.loading-state')).toHaveCount(0)
      await expect(panel.getByRole('list', { name: 'Recent notifications' })).toBeVisible()
      await panel.getByRole('tab', { name: 'Unread', exact: true }).click()
      await expect(panel.locator('.notification-item[data-unread="false"]')).toHaveCount(0)
      await expect(panel.locator('.notification-item').first()).toBeVisible()
      await expect(bell).toHaveAccessibleName(`Notifications, ${expected} unread`)
      await panel.getByRole('tab', { name: 'All', exact: true }).click()
      if (['parent-a', 'tutor-arjun', 'mentor-a'].includes(id)) await capture(page, id)
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(bell).toBeFocused()
      await expect(page).toHaveURL(current)
      await bell.click()
      await page.locator('.desk-main').click({ position: { x: 4, y: 4 } })
      await expect(panel).toHaveCount(0)
      if (id === 'parent-a') {
        expect((await page.request.get('/api/v1/notifications/recent?unread=0')).status()).toBe(422)
        const recent = await (
          await page.request.get('/api/v1/notifications/recent?unread=1&ownerId=mentor-a')
        ).json()
        expect(recent).toHaveLength(12)
        expect(recent[0].id).toBe('bell:parent-a:000')
        expect(
          recent.every(
            (item: { id: string; read: boolean }) =>
              item.id.startsWith('bell:parent-a:') && !item.read,
          ),
        ).toBe(true)
        expect(
          (await (await page.request.get(`/api/v1/inbox/${message.id}`)).json()).message.readAt,
        ).toBeNull()
        await bell.click()
        await expect(panel.locator('.notification-item').first()).toContainText(
          'Fictional bell update',
        )
        await panel.getByRole('link', { name: /Fictional bell update/ }).click()
        await expect(page).toHaveURL(`/notifications?folder=inbox&id=${message.id}`)
        await expect(bell).toHaveAccessibleName('Notifications, 30 unread')
        expect(
          (await (await page.request.get(`/api/v1/inbox/${message.id}`)).json()).message.readAt,
        ).not.toBeNull()
        await bell.click()
        const activity = panel.locator('[data-notification-id="bell:parent-a:000"]')
        await page.route('**/api/v1/notifications/bell%3Aparent-a%3A000/read', (route) =>
          route.fulfill({
            status: 503,
            json: { code: 'unavailable', message: 'Fictional notification read outage' },
          }),
        )
        await activity.click()
        await expect(panel.getByRole('alert')).toBeVisible()
        await expect(panel).toBeVisible()
        await expect(page).toHaveURL(`/notifications?folder=inbox&id=${message.id}`)
        await expect(bell).toHaveAccessibleName('Notifications, 30 unread')
        await page.unroute('**/api/v1/notifications/bell%3Aparent-a%3A000/read')
        const readResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/notifications/bell%3Aparent-a%3A000/read'),
        )
        await activity.click()
        expect((await readResponse).status()).toBe(200)
        await expect(page).toHaveURL(`/cases/${serviceCase.id}`)
        await expect(
          page.getByText('Fictional notification panel request', { exact: true }),
        ).toBeVisible()
        await expect(bell).toHaveAccessibleName('Notifications, 29 unread')
        await expect(panel).toHaveCount(0)
        await bell.click()
        await panel.getByRole('link', { name: 'View all notifications', exact: true }).click()
        await expect(page).toHaveURL('/notifications?folder=activity')
        await expect(
          page
            .locator('.inbox-tabs')
            .getByRole('link', { name: /^Activity/ })
            .locator('.inbox-count'),
        ).toHaveText('29')
        const notifications = await (await page.request.get('/api/v1/notifications')).json()
        expect(notifications.nextCursor).toBeTruthy()
        expect(notifications.items.length).toBeLessThan(30)
        expect((await write(page, '/notifications/bell%3Amentor-a%3A000/read', {})).status()).toBe(
          404,
        )
        await page.getByRole('button', { name: 'Mark as read', exact: true }).first().click()
        await expect(bell).toHaveAccessibleName('Notifications, 28 unread')
        const bounds = await page.locator('.activity-row').first().boundingBox()
        const main = await page.locator('.desk-main').evaluate((node) => ({
          width: node.clientWidth,
          padding:
            parseFloat(getComputedStyle(node).paddingLeft) +
            parseFloat(getComputedStyle(node).paddingRight),
        }))
        expect(bounds!.width).toBeGreaterThanOrEqual(main.width - main.padding - 2)
        await capture(page, 'activity-read')
        const acknowledged = await db
          .collection('notifications')
          .findOne({ _id: 'bell:parent-a:000' as never })
        expect(acknowledged?.read).toBe(true)
        expect(acknowledged?.readAt).toBeInstanceOf(Date)
        expect((await write(page, '/notifications/bell%3Aparent-a%3A000/read', {})).status()).toBe(
          200,
        )
        expect(
          (await db.collection('notifications').findOne({ _id: 'bell:parent-a:000' as never }))
            ?.readAt,
        ).toEqual(acknowledged?.readAt)
        for (const notificationId of [
          'bell-parent-a-literal%3Avalue',
          'bell:parent-a:literal%3Avalue',
        ]) {
          await db.collection('notifications').insertOne({
            _id: notificationId as never,
            ownerId: 'parent-a',
            kind: 'case_update',
            targetId: serviceCase.id,
            read: false,
            createdAt: new Date(),
          })
          expect(
            (
              await write(page, `/notifications/${encodeURIComponent(notificationId)}/read`, {})
            ).status(),
          ).toBe(200)
          expect(
            (await db.collection('notifications').findOne({ _id: notificationId as never }))?.read,
          ).toBe(true)
        }
      }
      await write(page, '/auth/logout', {})
    }
    await freshPage()
    await login(page, 'parent-b')
    await page.goto('/workspace')
    await expect(bell).toHaveAccessibleName('Notifications, 0 unread')
    await expect(bell.locator('.workspace-notification-count')).toHaveCount(0)
    await bell.click()
    await expect(
      panel.getByRole('heading', { name: 'No notifications yet', exact: true }),
    ).toBeVisible()
    await panel.getByRole('tab', { name: 'Unread', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'You’re all caught up', exact: true }),
    ).toBeVisible()
    await capture(page, 'empty-popup')
    await page.keyboard.press('Escape')
    await page.route('**/api/v1/notifications/recent', (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Read-only recent notification outage' },
      }),
    )
    await bell.click()
    await expect(panel.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await capture(page, 'feed-unavailable')
    await page.unroute('**/api/v1/notifications/recent')
    await panel.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'No notifications yet', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await page.route('**/api/v1/notifications/status', (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Read-only notification status outage fixture' },
      }),
    )
    await page.reload()
    await expect(bell).toHaveAccessibleName('Notifications, unread count unavailable')
    await expect(bell.locator('.workspace-notification-count')).toHaveText('!')
    await capture(page, 'count-unavailable')
    await page.unroute('**/api/v1/notifications/status')
    await page.reload()
    await expect(bell).toHaveAccessibleName('Notifications, 0 unread')
    expect(errors).toEqual([])
  } finally {
    await mongo.close()
  }
})
