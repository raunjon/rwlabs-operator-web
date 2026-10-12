import { defineConfig, devices } from '@playwright/test'

// The tests mock /health in the browser, so no gateway or Rails services need to be running.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3020' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3020',
    reuseExistingServer: !process.env.CI,
  },
})
