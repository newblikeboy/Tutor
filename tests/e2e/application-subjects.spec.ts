import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { applicationProfile } from './helpers/application'

test.use({ hasTouch: true })

test('education subject labels, checkboxes and touch preserve selections without crashing', async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('crash', () => errors.push('Browser renderer crashed'))
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      email: `subjects-${crypto.randomUUID()}@example.test`,
      password: 'Education subjects test 871!',
      name: 'Sample subject applicant',
      role: 'tutor',
      adult: true,
    },
  })
  expect(signup.status()).toBe(201)
  const auth = await signup.json()
  const headers = { Origin: 'http://127.0.0.1:5174', 'X-CSRF-Token': auth.csrf }
  const profile = applicationProfile('Sample subject applicant')
  profile.education.specialisation = 'Physics' // Retained authored text from an older application.
  expect(
    (
      await page.request.put('/api/v1/application', {
        headers,
        data: { version: 0, step: 1, profile, submit: false },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/apply')
  await page.getByRole('tab', { name: /Education/ }).click()
  const subjects = page
    .locator('.subject-select')
    .filter({ hasText: 'Main subject or specialisation' })
  const summary = subjects.locator('summary')
  const save = async () => {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/application') && r.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    expect((await response).status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  }
  await mkdir('docs/visual-qa/application-subjects', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await summary.click()
    await expect(subjects.getByRole('checkbox', { name: 'Physics', exact: true })).toBeChecked()
    for (const subject of ['Mathematics', 'Science']) {
      const box = subjects.getByRole('checkbox', { name: subject, exact: true })
      const label = subjects.locator('label > span').filter({ hasText: new RegExp(`^${subject}$`) })
      await box.uncheck()
      await summary.focus() // Reproduce the original summary-to-label focus sequence.
      if (width === 390) await label.tap()
      else await label.click()
      await expect(box).toBeChecked()
      await expect(subjects.locator('details')).toHaveAttribute('open', '')
      if (width === 390) await label.tap()
      else await label.click()
      await expect(box).not.toBeChecked()
      await box.check()
      await expect(box).toBeChecked()
      await label.dblclick()
      await expect(box).toBeChecked()
    }
    await subjects.getByRole('checkbox', { name: 'Science', exact: true }).press('Escape')
    await expect(summary).toBeFocused()
    await expect(subjects.locator('details')).not.toHaveAttribute('open')
    await summary.click()
    await subjects.getByRole('checkbox', { name: 'Physics', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(subjects.locator('details')).not.toHaveAttribute('open')
    await summary.click()
    await summary.press('Shift+Tab')
    await expect(subjects.locator('details')).not.toHaveAttribute('open')
    await save()
    await page.reload()
    await expect(summary).toContainText('Physics, Mathematics, Science')
    const stored = (await (await page.request.get('/api/v1/application')).json()).application
    expect(stored.profile.education.specialisation).toBe('Physics, Mathematics, Science')
    await summary.click()
    for (const subject of ['Physics', 'Mathematics', 'Science'])
      await expect(subjects.getByRole('checkbox', { name: subject, exact: true })).toBeChecked()
    await page.screenshot({
      path: `docs/visual-qa/application-subjects/subjects-${width}.png`,
      fullPage: true,
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('heading', { name: 'Education & experience', exact: true }).click()
    await expect(subjects.locator('details')).not.toHaveAttribute('open')
  }
  await summary.click()
  await subjects
    .locator('label > span')
    .filter({ hasText: /^Physics$/ })
    .click()
  await expect(subjects.getByRole('checkbox', { name: 'Physics', exact: true })).toHaveCount(0)
  for (const subject of ['Mathematics', 'Science'])
    await subjects.getByRole('checkbox', { name: subject, exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Education & experience', exact: true }),
  ).toBeVisible()
  await expect(subjects.getByRole('alert')).toHaveText('Select at least one subject.')
  await summary.click()
  for (const label of await subjects.locator('label > span').all()) await label.click()
  await expect(subjects.getByRole('checkbox', { checked: true })).toHaveCount(5)
  await expect(subjects.getByRole('alert')).toHaveCount(0)
  await save()
  await page.reload()
  await expect(summary).toHaveText('Mathematics, Science, English, Hindi, Social Science')
  await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What you can teach', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
