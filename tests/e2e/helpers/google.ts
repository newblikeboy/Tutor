import { expect, type Page } from '@playwright/test'
const origin = 'http://127.0.0.1:5174'

export async function connectGoogle(page: Page, role: 'mentor' | 'tutor' = 'mentor') {
  await page.goto(`/workspace?view=${role === 'mentor' ? 'interviews' : 'home'}`)
  const connect = page.getByRole('button', { name: 'Connect Google Account', exact: true })
  await expect(
    page.getByRole('heading', { name: /Google (Account Connected|Calendar & Meet)/ }),
  ).toBeVisible()
  if (await connect.isVisible()) await connect.click()
  await expect(
    page.getByRole('heading', { name: 'Google Account Connected', exact: true }),
  ).toBeVisible()
}

export async function conductInterview(page: Page, id: string) {
  const auth = await (await page.request.get('/api/v1/me')).json()
  const current = (await (await page.request.get(`/api/v1/staff/applications/${id}`)).json())
    .application
  const start = new Date(Date.now() + 3000)
  const result = await page.request.post(`/api/v1/applications/${id}/decision`, {
    headers: { Origin: origin, 'X-CSRF-Token': auth.csrf },
    data: {
      action: 'reschedule',
      version: current.version,
      reason: 'Bring forward this fictional test interview.',
      interview: {
        start: start.toISOString(),
        end: new Date(+start + 30 * 60000).toISOString(),
        timezone: 'Asia/Kolkata',
      },
    },
  })
  expect(result.status(), await result.text()).toBe(200)
  await expect
    .poll(
      async () => {
        const detail = (await (await page.request.get(`/api/v1/staff/applications/${id}`)).json())
          .application
        return (
          detail.interview.syncStatus === 'ready' &&
          Date.now() >= Date.parse(detail.interview.start)
        )
      },
      { timeout: 20000 },
    )
    .toBe(true)
  await page.goto(`/workspace?view=assessments&application=${id}&tab=review`)
  const form = page.getByRole('form', { name: 'Interview assessment', exact: true })
  await expect(form).toBeVisible({ timeout: 20000 })
  for (const label of [
    'Subject knowledge',
    'Teaching ability',
    'Communication skills',
    'Professionalism',
  ])
    await form.getByLabel(label, { exact: true }).selectOption('4')
  await form
    .getByLabel('Mentor feedback')
    .fill('Fictional observed teaching feedback supports the requested scope.')
  await form.getByLabel('Recommendation', { exact: true }).selectOption('approve')
  await form.getByLabel('I conducted this interview').check()
  await form.getByRole('button', { name: 'Submit assessment' }).click()
  await expect(page.getByRole('heading', { name: 'Interview assessment submitted' })).toBeVisible()
}
