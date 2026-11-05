import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: ['headers.spec.ts'], workers: 1,
  timeout: 45000, expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:3105', ...devices['Desktop Chrome'],
    launchOptions: process.env.CMS_E2E_BROWSER_PATH ? { executablePath: process.env.CMS_E2E_BROWSER_PATH } : {},
  },
  webServer: {
    cwd: process.env.CMS_E2E_STANDALONE_DIR || process.cwd(),
    command: process.env.CMS_E2E_STANDALONE_DIR
      ? 'npm run start -- --hostname 127.0.0.1 --port 3105'
      : 'npm --workspace apps/admin run start -- --hostname 127.0.0.1 --port 3105',
    url: 'http://127.0.0.1:3105/cms/login', reuseExistingServer: false, timeout: 60000,
  },
});
