import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:5174/api/v1/ready',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
})
