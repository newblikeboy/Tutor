import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('public footer has useful links and keeps dummy contacts out of business metadata', async ({
  page,
}) => {
  test.setTimeout(120000)
  const phase = process.env.FOOTER_CAPTURE === 'before' ? 'before' : 'after'
  const folder = `docs/visual-qa/public-footer/${phase}`
  await mkdir(folder, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const route of ['/', '/privacy-policy']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const footer = page.getByRole('contentinfo')
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => document.fonts.ready)
      await footer.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(page.frames()).toHaveLength(1)
      expect(
        (await new AxeBuilder({ page }).include('footer').setLegacyMode().analyze()).violations,
      ).toEqual([])
      await footer.screenshot({
        path: `${folder}/${route === '/' ? 'home' : 'privacy'}-${width}.png`,
      })
    }
    if (phase === 'before') continue
    await expect(footer.getByRole('navigation', { name: 'Find a tutor' })).toBeVisible()
    await expect(footer.getByRole('navigation', { name: 'About GoCoaching' })).toBeVisible()
    const dummy = footer.locator('[data-nosnippet]')
    await expect(dummy).toContainText('Dummy contact details')
    await expect(dummy).toContainText('contact@example.com')
    await expect(dummy).toContainText('+91 00000 00000')
    await expect(dummy.locator('a')).toHaveCount(0)
    for (const link of await footer.getByRole('link').all())
      expect(await link.getAttribute('href')).not.toMatch(/^(#|javascript:|mailto:|tel:)/)
    if (route === '/') {
      const data = JSON.parse((await page.locator('#gocoaching-organization').textContent())!)
      expect(data['@type']).toBe('Organization')
      expect(data.legalName).toBe('GoCoaching Learning Solution LLP')
      for (const field of ['address', 'telephone', 'email', 'contactPoint', 'aggregateRating'])
        expect(data).not.toHaveProperty(field)
    } else await expect(page.locator('#gocoaching-organization')).toHaveCount(0)
  }
  if (phase === 'after') {
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Online tutors', exact: true })
      .focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/mode=online/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Home tuition tutors', exact: true })
      .click()
    await expect(page).toHaveURL(/mode=home/)
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Become a tutor', exact: true })
      .click()
    await expect(page).toHaveURL(/\/login\?return=/)
    const sitemap = await page.request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain('https://gocoaching.in/terms-of-service')
    expect(xml).not.toMatch(/\/workspace|\/account|\/study|\/api\//)
    expect(
      await page.evaluate(
        (text) =>
          new DOMParser().parseFromString(text, 'application/xml').querySelectorAll('parsererror')
            .length,
        xml,
      ),
    ).toBe(0)
    expect(await (await page.request.get('/robots.txt')).text()).toContain(
      'Sitemap: https://gocoaching.in/sitemap.xml',
    )
  }
  expect(errors).toEqual([])
})
