import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('photo homepage keeps its bilingual layout, keyboard access and real entry points', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.locator('.home-tutors .tutor-card').first().waitFor()
  await expect(page.getByRole('region', { name: 'Development preview', exact: true })).toHaveCount(
    0,
  )
  await expect(page.locator('.home-image-credit')).toHaveText('AI-generated illustrative scene')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()

  for (const language of ['en', 'hi']) {
    if (language === 'hi') await page.locator('.language-button').click()
    await expect(page.locator('html')).toHaveAttribute('lang', language)
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => document.fonts.ready)
      await page.locator('.home-hero-image').evaluate((image: HTMLImageElement) => image.decode())
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const bounds = await page.locator('.home-hero').evaluate((hero) => {
        const rect = hero.getBoundingClientRect()
        const copy = hero.querySelector('.hero-copy')!.getBoundingClientRect()
        const figure = hero.querySelector('figure')!.getBoundingClientRect()
        return {
          left: copy.left,
          right: figure.right,
          heroLeft: rect.left,
          heroRight: rect.right,
          copyRight: copy.right,
          figureLeft: figure.left,
          copyBottom: copy.bottom,
          figureTop: figure.top,
        }
      })
      expect(bounds.left).toBeCloseTo(bounds.heroLeft, 0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.heroRight + 1)
      if (width >= 1024) expect(bounds.copyRight).toBeLessThan(bounds.figureLeft)
      else expect(bounds.copyBottom).toBeLessThan(bounds.figureTop)
      if (width === 390 || width === 1440) {
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
        expect(accessibility.violations).toEqual([])
      }
    }
    const summary = page.locator('.home-faq summary').first()
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.home-faq details').first()).toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(page.locator('.home-faq details').first()).not.toHaveAttribute('open')
    await page.setViewportSize({ width: 720, height: 1000 })
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `docs/visual-qa/landing-${language}-200-percent.png`,
      fullPage: false,
    })
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1'
    })
  }

  await page.locator('.language-button').click()
  await page.setViewportSize({ width: 390, height: 1000 })
  const menu = page.getByRole('button', { name: 'Open menu' })
  await menu.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await page.locator('.home-actions .text-link').click()
  await expect(page).toHaveURL(/\/tutors$/)
  await page
    .locator('.tutor-card')
    .first()
    .getByRole('link', { name: 'View teaching profile' })
    .click()
  await expect(page.locator('.profile-header')).toBeVisible()
  await page.goto('/')
  await page.locator('.home-actions .btn').click()
  await expect(page).toHaveURL(/\/match$/)
  await page.getByRole('link', { name: 'Sign in to continue' }).click()
  await expect(page).toHaveURL(/\/login\?return=%2Fmatch$/)
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('homepage remains usable while tutors load and recovers from a failed request', async ({
  page,
}) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/tutors', async (route) => {
    await pending
    await route.abort('failed')
  })
  await page.goto('/')
  await expect(page.locator('.home-tutors').getByRole('status')).toBeVisible()
  await page.locator('.home-hero-image').evaluate((image: HTMLImageElement) => image.decode())
  await expect(page.locator('.home-actions .btn')).toBeVisible()
  await page
    .locator('.home-tutors')
    .screenshot({ path: 'docs/visual-qa/landing-tutors-loading.png' })
  release()
  await expect(page.locator('.home-tutors').getByRole('alert')).toBeVisible()
  await page.locator('.home-tutors').screenshot({ path: 'docs/visual-qa/landing-tutors-error.png' })
  await page.unroute('**/api/v1/tutors')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.home-tutors .tutor-card').first()).toBeVisible()
  await expect(page.locator('.home-tutors').getByRole('alert')).toHaveCount(0)
})

test('landing section link works with reduced motion and high contrast', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.home-hero-image')).toBeVisible()
  expect(
    await page
      .locator('.home-hero')
      .evaluate((hero) => hero.getAnimations({ subtree: true }).length),
  ).toBe(0)
  await page.locator('.home-discover').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#home-process-title$/)
  await expect(page.locator('#home-process-title')).toBeInViewport()
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await expect(page.locator('.home-actions .btn')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: 'docs/visual-qa/landing-editorial/high-contrast.png',
    animations: 'disabled',
  })
  await page.locator('.home-actions .text-link').click()
  await expect(page).toHaveURL(/\/tutors$/)
})
