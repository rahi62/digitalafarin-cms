import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: ["session.spec.ts"],
  timeout: 45_000, expect: { timeout: 12_000 },
  workers: 1, fullyParallel: false,
  reporter: process.env.CI ? [["line"]] : [["list"]],
  use: { baseURL: "http://127.0.0.1:3104", ...devices["Desktop Chrome"] },
  webServer: [
    {
      cwd: process.cwd(),
      command: "node e2e/bff/mock-upstream.mjs",
      url: "http://127.0.0.1:9779/health",
      reuseExistingServer: !process.env.CI, timeout: 30000,
    },
    {
      cwd: process.cwd(),
      command: "npm --workspace apps/admin run dev -- --hostname 127.0.0.1 --port 3104",
      url: "http://127.0.0.1:3104/cms/login",
      reuseExistingServer: !process.env.CI, timeout: 120000,
      env: {
        ...process.env,
        NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH: "/cms",
        NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE: "bff",
        DIGITALAFARIN_CMS_API_URL: "http://127.0.0.1:9779/api/cms/v1",
        DIGITALAFARIN_CMS_BFF_SECRET: "a-long-random-test-secret-that-is-over-32-bytes",
      },
    },
  ],
});
