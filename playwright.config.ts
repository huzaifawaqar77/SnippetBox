import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests drive the packaged/built Electron app (section 86.7 of the
 * product spec). They need a production build first:
 *
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure'
  }
})
