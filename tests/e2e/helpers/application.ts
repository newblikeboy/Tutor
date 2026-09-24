import { expect, type Page } from '@playwright/test'
import { emptyApplication } from '../../../apps/web/src/lib/application'
export const noticeVersion = 'application-2026-09-23-v1-draft'
export function applicationProfile(name: string) {
  const p = emptyApplication(name, noticeVersion)
  Object.assign(p.about, {
    mobile: '9876543210',
    city: 'Purnea',
    locality: 'Line Bazar',
    pin: '854301',
    communicationLanguages: ['Hindi', 'English'],
  })
  Object.assign(p.education, {
    qualification: 'BSc',
    specialisation: 'Mathematics',
    institution: 'Fictional test college',
    completionYear: 2020,
    pursuing: 'no',
    newToTutoring: true,
    occupation: 'independent_tutor',
    outsideWork: 'none',
  })
  p.teachingAreas = [
    {
      id: 'math',
      subject: 'Mathematics',
      minClass: 6,
      maxClass: 10,
      boards: ['CBSE'],
      languages: ['Hindi'],
      modes: ['home', 'online'],
      priorExperience: 'no',
    },
  ]
  p.firstAreaId = 'math'
  Object.assign(p.availability, {
    slots: [{ day: 1, start: '16:00', end: '18:00' }],
    earliestStart: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
    weeklyHours: 10,
    maxStudents: 3,
    durations: [60],
    period: 'ongoing',
    home: {
      localities: ['Line Bazar', 'Bhatta Bazar'],
      travelKm: 5,
      charges: 'included',
      bufferMinutes: 30,
    },
    online: {
      device: 'laptop',
      camera: 'ready',
      microphone: 'ready',
      internet: 'reliable',
      privateSpace: 'yes',
      screenSharing: 'yes',
      digitalWriting: 'yes',
    },
  })
  Object.assign(p.approach, {
    introduction:
      'I use examples and ask learners to explain their thinking, then adapt practice to observed misconceptions.',
    scenario: 'I try a simpler example and ask which step is unclear.',
    understanding: 'I ask them to explain the idea and solve another example.',
    assessmentSlots: [{ day: 2, start: '16:00', end: '18:00' }],
  })
  p.fees.preference = 'expected'
  p.fees.rates = [
    { areaId: 'math', mode: 'home', amountPaise: 50000 },
    { areaId: 'math', mode: 'online', amountPaise: 40000 },
  ]
  Object.assign(p.declarations, { accuracy: true, conduct: true, dataUse: true })
  return p
}
export async function fillApplication(
  page: Page,
  name: string,
  capture?: (step: number) => Promise<void>,
) {
  const p = applicationProfile(name)
  const next = async (step: number) => {
    if (capture) await capture(step)
    await page.getByRole('button', { name: 'Save & continue', exact: true }).click()
    await expect(page.locator('.af-card-heading h2')).toHaveText(
      [
        '',
        'Education & experience',
        'What you can teach',
        'Time & location',
        'Teaching approach',
        'Your fees',
        'Check & submit',
      ][step + 1],
    )
  }
  await page.getByLabel('Full name', { exact: true }).fill(name)
  await page.getByLabel('Mobile number', { exact: true }).fill(p.about.mobile)
  await page.getByLabel('City', { exact: true }).fill('Purnea')
  await page.getByLabel('Hindi', { exact: true }).check()
  await next(0)
  await page.getByLabel('Highest completed qualification').fill('BSc')
  await page.getByLabel('Subject / specialisation').fill('Mathematics')
  await page.getByLabel('Institution', { exact: true }).fill('Fictional test college')
  await page.getByLabel('Year completed').fill('2020')
  await page.getByLabel('Currently studying?').selectOption('no')
  await page.getByLabel('I am new to tutoring').check()
  await page.getByLabel('Current occupation').selectOption('independent_tutor')
  await page.getByLabel('Restrictions on outside teaching').selectOption('none')
  await next(1)
  await page.getByRole('button', { name: 'Add teaching area' }).click()
  await page.getByLabel('Subject', { exact: true }).selectOption('Mathematics')
  await page.getByLabel('From class').fill('6')
  await page.getByLabel('To class').fill('10')
  await page.getByLabel('CBSE', { exact: true }).check()
  await page.getByLabel('Hindi', { exact: true }).check()
  await page.getByLabel('Home Tuition', { exact: true }).check()
  await page.getByLabel('Online', { exact: true }).check()
  await page.getByLabel('Have you taught this area before?').selectOption('no')
  await page.getByLabel('First area for assessment').selectOption({ index: 1 })
  await next(2)
  await page.getByRole('button', { name: 'Add time slot' }).click()
  await page.getByLabel('Earliest start date').fill(p.availability.earliestStart)
  await page.getByLabel('Hours available per week').fill('10')
  await page.getByLabel('Additional students you can take').fill('3')
  await page.getByLabel('Teaching commitment').selectOption('ongoing')
  await page.getByLabel('60', { exact: true }).check()
  await page.getByLabel('Your locality').fill('Line Bazar')
  await page.getByLabel('PIN code').fill('854301')
  await page.getByLabel('Service localities').fill('Line Bazar\nBhatta Bazar')
  await page.getByLabel('Maximum travel distance').fill('5')
  await page.getByLabel('Travel charges', { exact: true }).selectOption('included')
  await page.getByLabel('Travel buffer between classes').fill('30')
  for (const [label, value] of [
    ['Primary device', 'laptop'],
    ['Camera', 'ready'],
    ['Microphone', 'ready'],
    ['Internet connection', 'reliable'],
    ['Quiet, private teaching space', 'yes'],
    ['Can you share your screen?', 'yes'],
    ['Can you write digitally?', 'yes'],
  ])
    await page.getByLabel(label, { exact: true }).selectOption(value)
  await next(3)
  await page.getByLabel('Introduce yourself as a tutor').fill(p.approach.introduction)
  await page.getByLabel('A learner does not understand.').fill(p.approach.scenario)
  await page.getByLabel('How do you check understanding?').fill(p.approach.understanding)
  await page.getByRole('button', { name: 'Add time slot' }).click()
  await next(4)
  await page.getByLabel('Fee preference').selectOption('expected')
  await page.getByLabel('Mathematics · 6–10 · Home Tuition', { exact: true }).fill('500')
  await page.getByLabel('Mathematics · 6–10 · Online', { exact: true }).fill('400')
  await next(5)
  await expect(page.getByLabel('Send me optional opportunities and updates.')).not.toBeChecked()
  await page.getByLabel('My information is accurate.').check()
  await page.getByLabel('I agree to the conduct standards below.').check()
  await page.getByLabel('I agree to the application data use described below.').check()
  if (capture) await capture(6)
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible()
}
