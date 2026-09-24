import { fillApplication, fillStaffFees } from './helpers/application'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
async function login(page: Page, id: string, staff = false) {
  await page.goto(`/login${staff ? '?staff=1' : ''}`)
  await page.getByLabel('Email address', { exact: true }).fill(id + '@example.test')
  await page.getByLabel('Password', { exact: true }).fill('E2E-only learning passphrase 426!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/workspace/)
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa/english-only/parent-ux/journey', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `docs/visual-qa/english-only/parent-ux/journey/${name}.png`,
    fullPage: true,
  })
}
async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([])
}
test('complete application → scoped approval → requirement → trial → reviewed progress', async ({
  browser,
}) => {
  // Four real Atlas-backed roles plus visual/axe review need a larger total budget;
  // individual interaction assertions retain their normal timeouts.
  test.setTimeout(180_000)
  const contexts = await Promise.all([
    browser.newContext({
      baseURL: 'http://127.0.0.1:5174',
      viewport: { width: 1440, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    }),
    browser.newContext({
      baseURL: 'http://127.0.0.1:5174',
      viewport: { width: 1440, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    }),
    browser.newContext({
      baseURL: 'http://127.0.0.1:5174',
      viewport: { width: 1440, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    }),
    browser.newContext({
      baseURL: 'http://127.0.0.1:5174',
      viewport: { width: 1440, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    }),
  ])
  const [tutor, mentor, parent, admin] = await Promise.all(contexts.map((c) => c.newPage()))
  await login(tutor, 'tutor-a')
  await tutor.goto('/apply')
  await fillApplication(tutor, 'Kavya · fictional tutor')
  await expect(tutor.getByText('Submitted', { exact: true })).toBeVisible()
  await capture(tutor, 'application-submitted-en-desktop')
  const publicResponse = await tutor.request.get('/api/v1/tutors')
  expect((await publicResponse.json()).some((v: { id: string }) => v.id === 'tutor-a')).toBe(false)
  await login(mentor, 'mentor-a', true)
  await mentor.locator('.staff-row').filter({ hasText: 'Kavya · fictional tutor' }).click()
  const application = mentor.locator('article.staff-detail')
  await application.getByRole('tab', { name: 'Review & decision', exact: true }).click()
  await application.getByRole('checkbox', { name: 'I have no conflict of interest' }).check()
  await application.getByRole('button', { name: 'Start review', exact: true }).click()
  await application
    .getByLabel('Interview date and time (IST)')
    .fill(new Date(Date.now() - 60_000 + 19_800_000).toISOString().slice(0, 16))
  await application.getByRole('button', { name: 'Create Zoom meeting', exact: true }).click()
  await expect(application.getByRole('link', { name: 'Join Zoom meeting' })).toBeVisible()
  for (const label of [
    'Subject knowledge',
    'Explanation',
    'Misconceptions',
    'Patience',
    'Planning',
    'Reliability',
  ])
    await application.getByLabel(label, { exact: true }).selectOption('4')
  await application
    .getByLabel('Assessment evidence', { exact: true })
    .fill(
      'Explained equivalent fractions with a number line and checked the denominator misconception.',
    )
  await capture(mentor, 'mentor-scorecard-en-desktop')
  await axe(mentor)
  await mentor.setViewportSize({ width: 390, height: 844 })
  await capture(mentor, 'mentor-scorecard-en-mobile')
  await expect(mentor.locator('.language-button')).toHaveCount(0)
  await capture(mentor, 'mentor-scorecard-en-mobile')
  await axe(mentor)
  await expect(mentor.locator('.language-button')).toHaveCount(0)
  await mentor.setViewportSize({ width: 1440, height: 1000 })
  await application.getByRole('button', { name: 'Save assessment', exact: true }).click()
  await fillStaffFees(mentor)
  await application.getByLabel('From class').fill('8')
  await application.getByLabel('To class').fill('8')
  await application
    .getByLabel('Reason / feedback', { exact: true })
    .fill('The observed explanation and learner checks support class eight online Mathematics.')
  await application.getByRole('button', { name: 'Approve tutor', exact: true }).click()
  await expect(application.getByText('Approved', { exact: true })).toBeVisible()
  await login(parent, 'parent-a')
  await parent.goto('/match?tutor=tutor-a')
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(parent.getByRole('alert')).toBeVisible()
  await expect(parent.getByLabel('First name or nickname')).toHaveCount(0)
  await parent.getByLabel('I am the parent or legal guardian').check()
  await parent.getByLabel('I agree to the draft privacy notice').check()
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await parent.getByLabel('First name or nickname').fill('Aarohi · sample')
  await parent
    .getByLabel('What would you like help with?')
    .fill('Build understanding of equivalent fractions and explain each step with confidence.')
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(parent.getByRole('button', { name: 'Choose a tutor', exact: true })).toBeVisible()
  await parent.reload()
  await expect(parent.getByText('Saved', { exact: true })).toBeVisible()
  await capture(parent, 'requirement-review-en-desktop')
  await axe(parent)
  await parent.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(parent.getByLabel('What would you like help with?')).toHaveValue(
    /equivalent fractions/,
  )
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await parent.getByRole('button', { name: 'Choose a tutor', exact: true }).click()
  await expect(parent.getByLabel('Select a tutor')).toBeVisible()
  await parent.getByLabel('Select a tutor').selectOption('tutor-a')
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)
  const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  await parent.getByLabel('Preferred date & time').fill(local)
  await parent.getByLabel('I accept the development trial terms.').check()
  await parent.getByRole('button', { name: 'Request a trial', exact: true }).click()
  await expect(parent.getByText('Waiting for tutor', { exact: true })).toBeVisible()
  await parent.getByRole('link', { name: 'View all trials' }).click()
  await capture(parent, 'parent-requested-en-desktop')
  await tutor.goto('/workspace')
  const teachingTrial = tutor.getByRole('article').filter({
    has: tutor.getByRole('heading', { name: 'Aarohi · sample · Mathematics', exact: true }),
  })
  await teachingTrial.getByRole('button', { name: 'Accept & confirm time' }).click()
  await expect(tutor.locator('.teacher-next')).toContainText('Aarohi · sample')
  await capture(tutor, 'polish/teacher-populated-en-desktop')
  await tutor.setViewportSize({ width: 390, height: 844 })
  await capture(tutor, 'polish/teacher-populated-en-mobile')
  await tutor.setViewportSize({ width: 1440, height: 1000 })
  await tutor.getByRole('link', { name: 'Open trial', exact: true }).click()
  await expect(teachingTrial.getByText('Confirmed', { exact: true })).toBeVisible()
  await capture(tutor, 'tutor-confirmed-en-desktop')
  await axe(tutor)
  await tutor.setViewportSize({ width: 390, height: 844 })
  await capture(tutor, 'tutor-confirmed-en-mobile')
  await expect(tutor.locator('.language-button')).toHaveCount(0)
  await capture(tutor, 'tutor-confirmed-en-mobile')
  await axe(tutor)
  await expect(tutor.locator('.language-button')).toHaveCount(0)
  await tutor.setViewportSize({ width: 1440, height: 1000 })
  await teachingTrial
    .getByLabel('What did the learner work through?')
    .fill(
      'Aarohi used a number line to show why one half and two quarters represent the same amount.',
    )
  await teachingTrial
    .getByLabel('Practice and next teaching steps')
    .fill('Practise comparing thirds and sixths using a number line, then explain the denominator.')
  await teachingTrial.getByRole('button', { name: 'Record development lesson' }).click()
  await tutor
    .locator('.teacher-filters')
    .getByRole('link', { name: /Awaiting review/ })
    .click()
  await expect(teachingTrial.getByText('Awaiting academic review', { exact: true })).toBeVisible()
  await mentor.goto('/workspace?view=reviews')
  const mentoredTrial = mentor.getByRole('article').filter({
    has: mentor.getByRole('heading', { name: 'Aarohi · sample · Mathematics', exact: true }),
  })
  await mentoredTrial
    .getByLabel('Academic review and evidence')
    .fill(
      'The worked examples support continued practice with equivalent fractions. Review thirds and sixths next.',
    )
  await mentoredTrial.getByRole('button', { name: 'Share reviewed progress with family' }).click()
  await expect(mentoredTrial.getByText('Reviewed', { exact: true })).toBeVisible()
  await parent.reload()
  await expect(
    parent.getByText(
      'The worked examples support continued practice with equivalent fractions. Review thirds and sixths next.',
    ),
  ).toBeVisible()
  await capture(parent, 'parent-reviewed-en-desktop')
  await axe(parent)
  await parent.setViewportSize({ width: 390, height: 844 })
  await capture(parent, 'parent-reviewed-en-mobile')
  await expect(parent.locator('.language-button')).toHaveCount(0)
  await capture(parent, 'parent-reviewed-en-mobile')
  await axe(parent)
  await login(admin, 'admin-a', true)
  await capture(admin, 'admin-en-desktop')
  await axe(admin)
  await admin.setViewportSize({ width: 390, height: 844 })
  await capture(admin, 'admin-en-mobile')
  await expect(admin.locator('.language-button')).toHaveCount(0)
  await capture(admin, 'admin-en-mobile')
  await axe(admin)
  await expect(admin.locator('.language-button')).toHaveCount(0)
  await admin.goto('/workspace?view=tutors&application=tutor-a')
  const trigger = admin.getByRole('button', { name: 'Suspend tutor', exact: true })
  await trigger.click()
  await expect(admin.getByRole('dialog')).toBeVisible()
  await admin.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  for (const c of contexts) await c.close()
})
test('responsive public routes, both languages, keyboard and real empty state', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(
      await page.evaluate(
        () =>
          document.querySelector('.hero-copy')!.getBoundingClientRect().right <=
          document.querySelector('.hero')!.getBoundingClientRect().right + 1,
      ),
    ).toBe(true)
    await capture(page, `home-en-${width}`)
  }
  await axe(page)
  await expect(page.locator('.language-button')).toHaveCount(0)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await capture(page, `home-hi-${width}`)
    await axe(page)
  }
  await expect(page.locator('.language-button')).toHaveCount(0)
  await page.goto('/tutors')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.locator('.tutor-card').first()).toBeVisible()
  await capture(page, 'search-en-desktop')
  await axe(page)
  await page.getByLabel('Subject', { exact: true }).selectOption('Science')
  await expect(
    page.getByRole('heading', { name: 'No approved match for these filters' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'No approved match for these filters' }),
  ).toBeVisible()
  await capture(page, 'search-empty-en-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Refine your search' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await capture(page, 'search-filter-mobile')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Refine your search' })).toBeFocused()
  await page.goto('/tutors/tutor-meera')
  await capture(page, 'profile-en-mobile')
  await axe(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capture(page, 'profile-en-desktop')
  await expect(page.locator('.language-button')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'profile-en-mobile')
  await axe(page)
  expect(errors).toEqual([])
})
test('loading, network error, retry, components and 200% reflow', async ({ page }) => {
  await page.route('**/api/v1/tutors?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.abort()
  })
  await page.goto('/tutors')
  await expect(page.getByText('Loading your information…')).toBeAttached()
  await capture(page, 'search-loading')
  await expect(page.getByText('We couldn’t load this just now')).toBeVisible()
  await capture(page, 'search-network-error')
  await page.unroute('**/api/v1/tutors?**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.tutor-card').first()).toBeVisible()
  await page.goto('/components')
  await axe(page)
  await page.getByRole('button', { name: 'Open example dialog' }).click()
  await page
    .getByRole('dialog')
    .getByLabel('Name', { exact: true })
    .fill('A long illustrative name for keyboard review')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open example dialog' })).toBeFocused()
  await page.setViewportSize({ width: 720, height: 500 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await capture(page, 'components-200-percent')
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1'
  })
  await page.getByRole('tab', { name: 'Feedback & states' }).click()
  await capture(page, 'components-states')
  await expect(page.locator('.language-button')).toHaveCount(0)
  await capture(page, 'components-hi-states')
})

test('Adult learner with Hindi authored text completes the saved requirement flow', async ({
  page,
}) => {
  await login(page, 'adult-a')
  await expect(page.locator('.language-button')).toHaveCount(0)
  await page.goto('/match')
  await page.getByLabel('Myself, aged 18 or over').check()
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click()
  await page.getByLabel('First name or nickname').fill('काल्पनिक वयस्क विद्यार्थी')
  await page
    .getByLabel('What would you like help with?')
    .fill('भिन्न और अनुपात को रोज़मर्रा के उदाहरणों से समझना और अभ्यास करना।')
  await capture(page, 'adult-requirement-hi-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'adult-requirement-en-mobile')
  await axe(page)
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose a tutor', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Choose a tutor', exact: true }).click()
  await expect(page.getByLabel('Choose a tutor', { exact: true })).toBeVisible()
  const result = await page.request.get('/api/v1/dashboard')
  expect((await result.json()).learners[0].kind).toBe('adult_self')
})
