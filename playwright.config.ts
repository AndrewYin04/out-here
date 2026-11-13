import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel worktrees run their own server (builders use 31xx).
// E2E_BASE_URL points the suite at an already-running server or a preview URL
// instead of building locally (no webServer is started then).
const port = Number(process.env.E2E_PORT || 3100);
const externalBase = process.env.E2E_BASE_URL;
const baseURL = externalBase || `http://localhost:${port}`;

const STATEFUL = /(api|entry|findmy|groups|intros|map|memories|messenger|musefilter|outhere|people)\.spec\.ts$/;
const phone = { ...devices["Pixel 7"], browserName: "chromium" as const };
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  // 10 s: a full local run puts 10 workers on one server, and 5 s navigation waits failed under that load.
  // Real-Supabase runs (dev DB in us-west-2 from this laptop) may need longer still.
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT || 10_000) },
  retries: 0,
  // One Next server serves every worker. At the default (half the cores, 10 here) client-side
  // navigations stalled past 10 s; 6 keeps a full run near 5 minutes without those stalls.
  workers: process.env.CI ? 2 : 6,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // Specs that change shared demo state (invites, friend requests, locations, threads, group
  // membership, notifications) run in the "phone" and "desktop" projects, one file at a time per
  // project; inside those files phone and desktop already use different personas or skip one
  // project for each mutation, so the two can run side by side. In one full run under 10 workers
  // they collided (19 of 33 failures passed alone). The read-mostly specs run in parallel in
  // "phone-parallel" and "desktop-parallel". Pick both with --project='phone*'.
  projects: [
    { name: "phone", testMatch: STATEFUL, workers: 1, use: phone },
    { name: "desktop", testMatch: STATEFUL, workers: 1, use: desktop },
    { name: "phone-parallel", testIgnore: STATEFUL, use: phone },
    { name: "desktop-parallel", testIgnore: STATEFUL, use: desktop },
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
