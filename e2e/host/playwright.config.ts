import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'integration.spec.ts', workers: 1, timeout: 120000,
  expect: { timeout: 20000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3197', ...devices['Desktop Chrome'], channel: process.env.CMS_E2E_BROWSER_CHANNEL, trace: 'retain-on-failure' },
  webServer: [
    { cwd: process.cwd(), command: 'python e2e/host/backend.py', url: 'http://127.0.0.1:8197/api/cms/v1/site-context/?site=127.0.0.1:3197', timeout: 120000, reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
    { cwd: process.cwd(), command: 'node e2e/host/setup.mjs && node e2e/host/start-next.mjs', url: 'http://127.0.0.1:3197', timeout: 120000, reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
  ],
});
