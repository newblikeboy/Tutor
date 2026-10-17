// Synthetic browser measurements of an already-built local preview, not field data.
// Start Vite preview with its /api proxy pointing to an isolated test API first.
// node scripts/measure-public-performance.mjs http://127.0.0.1:5175
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:5175')
if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:')
  throw new Error('Use a loopback preview and an isolated test API, never production')
const routes = ['/', '/tutors?searched=1&class=8&subject=Mathematics&mode=online']
const configuration = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  cpuSlowdown: 4,
  latencyMs: 150,
  downloadBytesPerSecond: 200000,
  uploadBytesPerSecond: 93750,
  cache: 'disabled; new anonymous context per navigation',
  samplesPerRoute: 3,
  reducedMotion: 'reduce',
}
const browser = await chromium.launch({
  args: ['--disable-gpu', '--renderer-process-limit=1'],
})
const samples = []
try {
  for (const route of routes) {
    for (let run = 1; run <= configuration.samplesPerRoute; run++) {
      const context = await browser.newContext({
        viewport: configuration.viewport,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      })
      try {
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript(() => {
          window.__lab = { lcpMs: null, cls: 0, session: 0, first: 0, last: 0, shifts: [] }
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__lab.lcpMs = entry.startTime
          }).observe({ type: 'largest-contentful-paint', buffered: true })
          new PerformanceObserver((list) => {
            const state = window.__lab
            for (const entry of list.getEntries()) {
              if (entry.hadRecentInput) continue
              state.shifts.push({
                time: entry.startTime,
                value: entry.value,
                sources: entry.sources.map((source) => ({
                  element: source.node?.tagName,
                  className: source.node?.className,
                  previous: source.previousRect.toJSON(),
                  current: source.currentRect.toJSON(),
                })),
              })
              if (entry.startTime - state.last < 1000 && entry.startTime - state.first < 5000)
                state.session += entry.value
              else {
                state.first = entry.startTime
                state.session = entry.value
              }
              state.last = entry.startTime
              state.cls = Math.max(state.cls, state.session)
            }
          }).observe({ type: 'layout-shift', buffered: true })
        })
        const cdp = await context.newCDPSession(page)
        await cdp.send('Network.enable')
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: configuration.latencyMs,
          downloadThroughput: configuration.downloadBytesPerSecond,
          uploadThroughput: configuration.uploadBytesPerSecond,
        })
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: configuration.cpuSlowdown })
        const response = await page.goto(new URL(route, origin).href, {
          waitUntil: 'networkidle',
          timeout: 60000,
        })
        if (response?.status() !== 200) throw new Error(`Preview returned ${response?.status()}`)
        await page.locator('h1').waitFor()
        await page.locator('.loading-state').waitFor({ state: 'hidden' })
        await page.evaluate(() => document.fonts.ready)
        // Observe late layout changes for a bounded interval; this is not a user session.
        await page.waitForTimeout(1500)
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0]
          const resources = performance.getEntriesByType('resource')
          return {
            lcpMs: window.__lab.lcpMs,
            cls: window.__lab.cls,
            shifts: window.__lab.shifts,
            ttfbMs: nav.responseStart - nav.startTime,
            transferredBytes: nav.transferSize + resources.reduce((n, r) => n + r.transferSize, 0),
            resourceRequests: resources.length,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }
        })
        if (errors.length) throw new Error(errors.join('\n'))
        samples.push({ route, run, ...metrics })
        console.log(
          JSON.stringify({
            route,
            run,
            lcpMs: metrics.lcpMs,
            cls: metrics.cls,
            transferredBytes: metrics.transferredBytes,
            resourceRequests: metrics.resourceRequests,
            overflow: metrics.overflow,
          }),
        )
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
const folder = 'docs/visual-qa/journey-design'
await mkdir(folder, { recursive: true })
await writeFile(
  `${folder}/mobile-lab.json`,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      browser: 'Playwright Chromium, local Windows host',
      limits:
        'Synthetic cold navigations. No field percentile, Lighthouse score, INP or physical-phone claim. Local API/host load affect results.',
      configuration,
      samples,
    },
    null,
    2,
  ) + '\n',
)
