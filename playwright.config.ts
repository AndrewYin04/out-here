import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel worktrees run their own server (builders use 31xx).
// E2E_BASE_URL points the suite at an already-running server or a preview URL
// instead of building locally (no webServer is started then).
const port = Number(process.env.E2E_PORT || 3100);
const externalBase = process.env.E2E_BASE_URL;
const baseURL = externalBase || `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  // Real-Supabase runs (dev DB in us-west-2 from this laptop) need longer waits than MemoryStore.
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT || 5000) },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: externalBase
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
