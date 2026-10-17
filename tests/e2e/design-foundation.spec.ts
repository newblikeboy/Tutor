import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

const origin = 'http://127.0.0.1:5174'
const phase = process.env.DESIGN_AUDIT_CAPTURE === 'before' ? 'before' : 'after'
const root = `docs/visual-qa/design-foundation/${phase}`

async function capture(page: Page, name: string) {
  await mkdir(root, { recursive: true })
  await expect(page.locator('.loading-state')).toHaveCount(0)
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${root}/${name}-${width}.png`, fullPage: true })
    // All audited screens are first-party and contain no frames. Run the same
    // axe rules in that frame, avoiding a separate blank-page finishRun worker.
    expect(page.frames()).toHaveLength(1)
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
  }
}

test('shared design foundation across public, parent, tutor and staff surfaces', async ({
  page,
}) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/components')
  await expect(page.getByRole('tab', { name: 'Controls', exact: true })).toBeVisible()
  await capture(page, 'components')
  const invalidName = page.getByRole('textbox', { name: 'Example name with an error' })
  await expect(invalidName).toHaveAttribute('aria-invalid', 'true')
  await expect(invalidName).toHaveAccessibleDescription(
    'These fields demonstrate how instructions and validation are presented together. Enter a full name. Add a name to continue.',
  )
  await invalidName.fill('Unfinished example')
  await expect(
    page.getByRole('combobox', { name: 'Example selection with an error' }),
  ).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('tab', { name: 'Controls', exact: true }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Tables', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Tables', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const tableRegion = page.getByRole('region', { name: 'Example class records', exact: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(tableRegion).not.toHaveAttribute('tabindex')
  await expect(page.locator('.student-table-help')).toHaveCount(0)
  await capture(page, 'table')
  await expect(tableRegion).toHaveAttribute('tabindex', '0')
  await tableRegion.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => tableRegion.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 1024) {
      await expect(tableRegion).not.toHaveAttribute('tabindex')
      await expect(page.locator('.student-table-help')).toHaveCount(0)
    }
  }
  await page.getByRole('tab', { name: 'Controls', exact: true }).click()
  await expect(invalidName).toHaveValue('Unfinished example')
  const dialogTrigger = page.getByRole('button', { name: 'Open example dialog', exact: true })
  await dialogTrigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialogTrigger).toBeFocused()
  await page.goto('/tutors?searched=1&class=8&mode=online&time=17%3A00&language=English')
  await expect(page.locator('.results-bar')).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Tutor results', exact: true }),
  ).toBeAttached()
  await capture(page, 'search')
  await expect(page.locator('.results-bar')).toContainText(/tutors? shown/)
  await expect(page.locator('.search-time-note')).toContainText('Check available times')
  await page.getByRole('button', { name: 'Remove English language filter', exact: true }).click()
  expect(new URL(page.url()).searchParams.has('language')).toBe(false)
  expect(new URL(page.url()).searchParams.get('time')).toBe('17:00')
  expect(new URL(page.url()).searchParams.get('class')).toBe('8')
  await page.reload()
  await expect(page.locator('.filter-chips')).toContainText('Preferred time: 17:00')
  await page.goto('/tutors/tutor-meera?class=8&mode=online')
  await expect(page.locator('.approved-profile-identity')).toBeVisible()
  await capture(page, 'public-profile')
  await page.goto('/login')
  await expect(page.getByRole('main')).toBeVisible()
  await capture(page, 'sign-in')

  // The real test login sets an opaque session cookie. Full navigations discard
  // the previous role's React Query cache; no auth or API response is mocked.
  for (const [id, route, landmark, name] of [
    ['parent-a', '/workspace?view=learners', '.desk-content', 'parent-students'],
    ['tutor-meera', '/tutor-profile', '.tutor-public-profile-page', 'tutor-profile'],
    ['mentor-a', '/workspace', '.staff-metrics', 'mentor-queue'],
    ['admin-a', '/subjects', '.student-roster', 'admin-subjects'],
  ]) {
    const login = await page.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email: `${id}@example.test`, password: 'E2E-only learning passphrase 426!' },
    })
    expect(login.status()).toBe(200)
    await page.goto(route)
    await expect(page.locator(landmark)).toBeVisible()
    await capture(page, name)
    if (id === 'parent-a') {
      const csrf = (await login.json()).csrf
      const created = await page.request.post('/api/v1/learners', {
        headers: { Origin: origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() },
        data: {
          name: 'Fictional design audit student',
          kind: 'adult_self',
          class: 8,
          board: 'CBSE',
          language: 'English',
        },
      })
      expect(created.status()).toBe(201)
      await page.reload()
      await expect(page.getByRole('table', { name: 'Your learners', exact: true })).toBeVisible()
      await capture(page, 'parent-populated-students')
    }
  }
  expect(errors).toEqual([])
})
