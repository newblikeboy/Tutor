import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('quick finder modes and multiple subjects reach discovery and survive refresh', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mkdir('docs/visual-qa/quick-tutor-finder', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/tutors')
    const finder = page.locator('#quick-tutor-finder')
    await expect(finder.getByText('Mode of Teaching', { exact: true })).toBeVisible()
    await expect(finder.getByText('Teacher needed', { exact: true })).toHaveCount(0)
    await expect(finder.getByRole('button', { name: 'Online', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await finder.getByRole('button', { name: 'Offline', exact: true }).click()
    await expect(finder.getByRole('button', { name: 'Offline', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(finder.getByRole('button', { name: 'Online', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    const summary = finder.locator('summary')
    await summary.focus()
    await summary.press('Space')
    // Exercise the label text itself: clicking the checkbox skips its blur sequence.
    const mathematicsLabel = finder.locator('label > span').filter({ hasText: /^Mathematics$/ })
    await mathematicsLabel.click()
    await expect(finder.getByRole('checkbox', { name: 'Mathematics', exact: true })).toBeChecked()
    await expect(finder.locator('details')).toHaveAttribute('open', '')
    await mathematicsLabel.click()
    await expect(
      finder.getByRole('checkbox', { name: 'Mathematics', exact: true }),
    ).not.toBeChecked()
    await finder.getByRole('checkbox', { name: 'Social Science', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(finder.locator('details')).not.toHaveAttribute('open')
    await summary.click()
    await page.keyboard.press('Shift+Tab')
    await expect(finder.locator('details')).not.toHaveAttribute('open')
    await summary.click()
    await finder.getByRole('checkbox', { name: 'Mathematics', exact: true }).check()
    await finder.getByRole('checkbox', { name: 'Science', exact: true }).check()
    await expect(summary).toHaveText('Mathematics, Science')
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `docs/visual-qa/quick-tutor-finder/finder-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await finder.getByRole('checkbox', { name: 'Science', exact: true }).press('Escape')
    await expect(summary).toBeFocused()
    await expect(finder.getByRole('checkbox', { name: 'Science', exact: true })).toBeHidden()
    const target = new URL(
      (await finder.getByRole('link', { name: 'Search tutors' }).getAttribute('href')) as string,
      'http://local.test',
    )
    expect(target.searchParams.get('mode')).toBe('home')
    expect(target.searchParams.getAll('subject')).toEqual(['Mathematics', 'Science'])
    expect(target.searchParams.has('plan')).toBe(false)
    await finder.getByRole('button', { name: 'Online', exact: true }).click()
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/v1/tutors' && url.searchParams.getAll('subject').length === 2
    })
    await finder.getByRole('link', { name: 'Search tutors' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const request = new URL(response.url()).searchParams
    expect(request.getAll('subject')).toEqual(['Mathematics', 'Science'])
    expect(request.get('mode')).toBe('online')
    await expect(page.locator('.filter-chips')).toContainText('Mathematics')
    await expect(page.locator('.filter-chips')).toContainText('Science')
    await page.reload()
    await expect(page.locator('.filter-chips')).toContainText('Science')
    if (width < 700) await page.getByRole('button', { name: 'Refine results', exact: true }).click()
    const filters = width < 700 ? page.getByRole('dialog') : page.locator('.filter-fields').first()
    await filters.locator('summary').click()
    await expect(filters.getByRole('checkbox', { name: 'Mathematics', exact: true })).toBeChecked()
    await expect(filters.getByRole('checkbox', { name: 'Science', exact: true })).toBeChecked()
    await filters
      .locator('label > span')
      .filter({ hasText: /^Science$/ })
      .click()
    await expect(filters.getByRole('checkbox', { name: 'Science', exact: true })).not.toBeChecked()
    await expect(page).not.toHaveURL(/subject=Science/)
    await filters.getByRole('checkbox', { name: 'Mathematics', exact: true }).click()
    await expect(
      filters.getByRole('checkbox', { name: 'Mathematics', exact: true }),
    ).not.toBeChecked()
    await expect(page).not.toHaveURL(/subject=/)
    await filters.getByRole('checkbox', { name: 'Mathematics', exact: true }).press('Escape')
    if (width < 700) {
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  }
  await page.goto('/tutors')
  const finder = page.locator('#quick-tutor-finder')
  await finder.locator('summary').click()
  for (const label of await finder.locator('label > span').all()) await label.click()
  for (const checkbox of await finder.getByRole('checkbox').all())
    await expect(checkbox).toBeChecked()
  await expect(finder.locator('summary')).toContainText('Social Science')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await finder.getByRole('button', { name: 'Online', exact: true }).click()
  await expect(finder.getByRole('checkbox').first()).toBeHidden()
  expect(errors).toEqual([])
})
