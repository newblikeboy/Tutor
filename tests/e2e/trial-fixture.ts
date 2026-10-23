import { expect, type APIRequestContext } from '@playwright/test'
import { signupDatabase } from './signup-fixture'

// Move only a fictional confirmed schedule into the past. The real Go lifecycle
// closes it on an authorised read or worker sweep; fixtures never set completed.
export async function endTrialFixture(request: APIRequestContext, id: string) {
  const { client, database } = await signupDatabase()
  try {
    const end = new Date(Date.now() - 1000)
    const changed = await database
      .collection('trials')
      .updateOne(
        { _id: id as never, status: 'confirmed' },
        { $set: { start: new Date(end.getTime() - 3600000), end } },
      )
    expect(changed.matchedCount).toBe(1)
  } finally {
    await client.close()
  }
  await expect
    .poll(async () => {
      const response = await request.get('/api/v1/dashboard')
      expect(response.status()).toBe(200)
      const dashboard = await response.json()
      return dashboard.trials.find((trial: { id: string }) => trial.id === id)?.status
    })
    .toBe('completed')
}
