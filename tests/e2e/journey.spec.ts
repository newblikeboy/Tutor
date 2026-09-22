import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
async function login(page: Page, id: string, staff = false) {
  await page.goto(`/login${staff ? '?staff=1' : ''}`)
  await page.getByLabel('Development account').selectOption(id)
  await page.getByRole('button', { name: 'Get development code', exact: true }).click()
  const code = await page.getByTestId('development-code').innerText()
  await page.getByLabel('One-time code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Continue securely', exact: true }).click()
  await expect(page).toHaveURL(/workspace/)
}
async function capture(page: Page, name: string) {
  await mkdir('docs/visual-qa', { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `docs/visual-qa/${name}.png`, fullPage: true })
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
  await tutor.getByLabel('Name', { exact: true }).fill('Kavya · fictional tutor')
  await tutor
    .getByLabel('Education and relevant experience')
    .fill('Fictional BSc Mathematics for development assessment.')
  await tutor.getByLabel('Years of teaching experience').fill('4')
  await tutor
    .getByLabel('Your teaching approach')
    .fill(
      'I use number lines, ask learners to explain their thinking, and adapt practice to observed misconceptions.',
    )
  await tutor.getByRole('button', { name: 'Submit for assessment' }).click()
  await expect(tutor.getByText('Submitted', { exact: true })).toBeVisible()
  await capture(tutor, 'application-submitted-en-desktop')
  const publicResponse = await tutor.request.get('/api/v1/tutors')
  expect((await publicResponse.json()).some((v: { id: string }) => v.id === 'tutor-a')).toBe(false)
  await login(mentor, 'mentor-a', true)
  const application = mentor
    .locator('article')
    .filter({ has: mentor.getByRole('heading', { name: 'Kavya · fictional tutor' }) })
  await application.getByRole('button', { name: 'Take this assessment' }).click()
  await application.getByRole('button', { name: 'Record assessment session' }).click()
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
  await mentor.locator('.language-button').click()
  await capture(mentor, 'mentor-scorecard-hi-mobile')
  await axe(mentor)
  await mentor.locator('.language-button').click()
  await mentor.setViewportSize({ width: 1440, height: 1000 })
  await application.getByRole('button', { name: 'Save assessment evidence' }).click()
  await application.getByLabel('From class').fill('8')
  await application.getByLabel('To class').fill('8')
  await application
    .getByLabel('Decision reason')
    .fill('The observed explanation and learner checks support class eight online Mathematics.')
  await application.getByRole('button', { name: 'Approve this scope' }).click()
  await expect(application.getByText('Approved', { exact: true })).toBeVisible()
  await login(parent, 'parent-a')
  await parent.goto('/match?tutor=tutor-a')
  await parent.getByRole('button', { name: 'Confirm and continue' }).click()
  await expect(parent.getByRole('alert')).toBeVisible()
  await expect(parent.getByLabel('Learner’s first name or nickname')).toHaveCount(0)
  await parent.getByLabel('I am the parent or legal guardian').check()
  await parent.getByLabel('I agree to the draft privacy notice').check()
  await parent.getByRole('button', { name: 'Confirm and continue' }).click()
  await parent.getByLabel('Learner’s first name or nickname').fill('Aarohi · sample')
  await parent
    .getByLabel('What would you like help with?')
    .fill('Build understanding of equivalent fractions and explain each step with confidence.')
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(parent.getByRole('button', { name: 'Send learning requirement' })).toBeVisible()
  await parent.reload()
  await expect(parent.getByText('Your saved draft is ready to continue.')).toBeVisible()
  await capture(parent, 'requirement-review-en-desktop')
  await axe(parent)
  await parent.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(parent.getByLabel('What would you like help with?')).toHaveValue(
    /equivalent fractions/,
  )
  await parent.getByRole('button', { name: 'Continue', exact: true }).click()
  await parent.getByRole('button', { name: 'Send learning requirement' }).click()
  await expect(parent.getByText('Your requirement is saved.')).toBeVisible()
  await parent.getByLabel('Select a tutor').selectOption('tutor-a')
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)
  const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  await parent.getByLabel('Preferred date & time').fill(local)
  await parent.getByLabel('I accept the development trial terms.').check()
  await parent.getByRole('button', { name: 'Request a trial', exact: true }).click()
  await expect(parent.getByText('Trial requested — waiting for tutor acceptance')).toBeVisible()
  await parent.getByRole('link', { name: 'Open my workspace' }).click()
  await capture(parent, 'parent-requested-en-desktop')
  await tutor.goto('/workspace')
  await tutor.getByRole('button', { name: 'Accept & confirm time' }).click()
  await expect(tutor.getByText('Confirmed', { exact: true })).toBeVisible()
  await capture(tutor, 'tutor-confirmed-en-desktop')
  await axe(tutor)
  await tutor.setViewportSize({ width: 390, height: 844 })
  await capture(tutor, 'tutor-confirmed-en-mobile')
  await tutor.locator('.language-button').click()
  await capture(tutor, 'tutor-confirmed-hi-mobile')
  await axe(tutor)
  await tutor.locator('.language-button').click()
  await tutor.setViewportSize({ width: 1440, height: 1000 })
  await tutor
    .getByLabel('What did the learner work through?')
    .fill(
      'Aarohi used a number line to show why one half and two quarters represent the same amount.',
    )
  await tutor
    .getByLabel('Practice and next teaching steps')
    .fill('Practise comparing thirds and sixths using a number line, then explain the denominator.')
  await tutor.getByRole('button', { name: 'Record development lesson' }).click()
  await expect(tutor.getByText('Awaiting academic review', { exact: true })).toBeVisible()
  await mentor.reload()
  await mentor
    .getByLabel('Academic review and evidence')
    .fill(
      'The worked examples support continued practice with equivalent fractions. Review thirds and sixths next.',
    )
  await mentor.getByRole('button', { name: 'Share reviewed progress with family' }).click()
  await expect(mentor.getByText('Reviewed', { exact: true })).toBeVisible()
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
  await parent.locator('.language-button').click()
  await capture(parent, 'parent-reviewed-hi-mobile')
  await axe(parent)
  await login(admin, 'admin-a', true)
  await capture(admin, 'admin-en-desktop')
  await axe(admin)
  await admin.setViewportSize({ width: 390, height: 844 })
  await capture(admin, 'admin-en-mobile')
  await admin.locator('.language-button').click()
  await capture(admin, 'admin-hi-mobile')
  await axe(admin)
  await admin.locator('.language-button').click()
  const trigger = admin.getByRole('button', { name: 'Suspend new bookings' }).first()
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
  await page.locator('.language-button').click()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await capture(page, `home-hi-${width}`)
    await axe(page)
  }
  await page.locator('.language-button').click()
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
  await page.locator('.language-button').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'profile-hi-mobile')
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
  await page.locator('.language-button').click()
  await capture(page, 'components-hi-states')
})

test('Hindi adult learner completes the saved requirement flow', async ({ page }) => {
  await login(page, 'adult-a')
  await page.locator('.language-button').click()
  await page.goto('/match')
  await expect(page.getByLabel('मेरे लिए, मेरी उम्र 18 वर्ष या अधिक है')).toBeChecked()
  await page.getByRole('button', { name: 'पुष्टि करें और आगे बढ़ें' }).click()
  await page.getByLabel('विद्यार्थी का पहला नाम या घर का नाम').fill('काल्पनिक वयस्क विद्यार्थी')
  await page
    .getByLabel('किस चीज़ में मदद चाहिए?')
    .fill('भिन्न और अनुपात को रोज़मर्रा के उदाहरणों से समझना और अभ्यास करना।')
  await capture(page, 'adult-requirement-hi-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'adult-requirement-hi-mobile')
  await axe(page)
  await page.getByRole('button', { name: 'आगे बढ़ें', exact: true }).click()
  await expect(page.getByRole('button', { name: 'सीखने की ज़रूरत भेजें' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('आपका सहेजा मसौदा तैयार है।')).toBeVisible()
  await page.getByRole('button', { name: 'सीखने की ज़रूरत भेजें' }).click()
  await expect(page.getByText('आपकी ज़रूरत सहेज ली गई है।')).toBeVisible()
  const result = await page.request.get('/api/v1/dashboard')
  expect((await result.json()).learners[0].kind).toBe('adult_self')
})
