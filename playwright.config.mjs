import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  outputDir: "/tmp/fitcore-playwright-artifacts",
  use: {
    baseURL: process.env.FITCORE_BROWSER_BASE_URL || "http://127.0.0.1:19080",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
  },
});
