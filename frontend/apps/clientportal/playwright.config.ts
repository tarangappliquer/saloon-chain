import { defineConfig, devices } from '@playwright/test';

// E2E config for the client portal booking flow. The dev server (vite, port 58569) and the
// backend API (http://localhost:5127) are expected to already be running — this config only
// launches the browser, not the app, so a failed `dev` doesn't look like a test failure.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // booking creates server-side holds; parallel runs would race on slots
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:58569',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});