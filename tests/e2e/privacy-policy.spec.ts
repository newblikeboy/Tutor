import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test('privacy policy includes the supplied document, blank fields, responsive index and legacy link', async ({
  page,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/privacy-policy')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy Policy', exact: true }),
  ).toBeVisible()
  const document = page.getByRole('article', { name: 'GoCoaching Privacy Policy' })
  await expect(document.locator(':scope > section')).toHaveCount(17)
  await expect(document).toContainText('Limited Use requirements')
  await expect(document).toContainText('GoCoaching Learning Solution LLP. All rights reserved.')
  await expect(page.locator('.legal-page')).not.toContainText('[Insert')
  await expect(page.locator('.legal-metadata')).toHaveText(/Effective Date:\s*Last Updated:\s*$/)
  await expect(page).toHaveTitle('Privacy Policy · GoCoaching')
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://gocoaching.in/privacy-policy',
  )
  await mkdir('docs/visual-qa/privacy-policy', { recursive: true })
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(page.frames()).toHaveLength(1)
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([])
    await page.screenshot({ path: `docs/visual-qa/privacy-policy/policy-${width}.png` })
  }
  const index = page.locator('.legal-mobile-toc')
  await index.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(index).toHaveAttribute('open', '')
  await index
    .getByRole('link', { name: '17. Contact and Grievance Redressal', exact: true })
    .click()
  await expect(page).toHaveURL(/#contact-and-grievance-redressal$/)
  const contact = page.getByRole('region', { name: '17. Contact and Grievance Redressal' })
  await expect(contact).toContainText(
    /Privacy\/Support Email:\s*Grievance Officer:\s*Registered Office:\s*Contact Number:/,
  )
  await page.screenshot({ path: 'docs/visual-qa/privacy-policy/contact-390.png' })
  await page.getByRole('article').getByRole('link', { name: 'Help & support', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Support & contact' })).toBeVisible()
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0)
  await page.goto('/privacy')
  await expect(page).toHaveURL(/\/privacy-policy$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy Policy', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy', exact: true }),
  ).toHaveAttribute('href', '/privacy-policy')
  await page.goto('/signup')
  await page.locator('a[href="/privacy-policy"]').click()
  await expect(page).toHaveURL(/\/privacy-policy$/)
  expect(errors).toEqual([])
})
