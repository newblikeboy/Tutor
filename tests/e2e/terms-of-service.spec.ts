import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('terms render the supplied document and link to privacy without changing signup', async ({
  page,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/terms-of-service')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Terms of Service', exact: true }),
  ).toBeVisible()
  const document = page.getByRole('article', { name: 'GoCoaching Terms of Service' })
  await expect(document.locator(':scope > section')).toHaveCount(24)
  await expect(document).toContainText('principal-to-principal basis')
  await expect(document).toContainText('GoCoaching Learning Solution LLP. All rights reserved.')
  await expect(page.locator('.legal-page')).not.toContainText('[Insert')
  await expect(page.locator('.legal-metadata')).toHaveText(/Effective Date:\s*Last Updated:\s*$/)
  await expect(page).toHaveTitle('Terms of Service · GoCoaching')
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://gocoaching.in/terms-of-service',
  )
  await mkdir('docs/visual-qa/terms-of-service', { recursive: true })
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(page.frames()).toHaveLength(1)
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
    await page.screenshot({ path: `docs/visual-qa/terms-of-service/terms-${width}.png` })
  }
  const index = page.locator('.legal-mobile-toc')
  await index.locator('summary').focus()
  await page.keyboard.press('Enter')
  await index.getByRole('link', { name: '24. Contact Information', exact: true }).click()
  await expect(page).toHaveURL(/#contact-information$/)
  await expect(page.getByRole('region', { name: '24. Contact Information' })).toContainText(
    /Customer Support Email:\s*Grievance Officer:\s*Registered Office:\s*Contact Number:/,
  )
  await page.screenshot({ path: 'docs/visual-qa/terms-of-service/contact-390.png' })
  const privacy = document.getByRole('link', {
    name: 'https://gocoaching.in/privacy-policy',
    exact: true,
  })
  await expect(privacy).toHaveAttribute('href', '/privacy-policy')
  await privacy.click()
  await expect(page).toHaveTitle('Privacy Policy · GoCoaching')
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://gocoaching.in/privacy-policy',
  )
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Terms of Service', exact: true })
    .click()
  await expect(page).toHaveURL(/\/terms-of-service$/)
  await page.getByRole('article').getByRole('link', { name: 'Help & support', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Support & contact', level: 1 })).toBeVisible()
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0)
  await page.goto('/signup')
  await page.getByRole('link', { name: 'Terms of Service', exact: true }).click()
  await expect(page).toHaveURL(/\/terms-of-service$/)
  expect(errors).toEqual([])
})
