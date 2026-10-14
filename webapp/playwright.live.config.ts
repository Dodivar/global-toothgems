import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { liveEnv } from "./e2e-live/env";

/**
 * The live suite (`npm run test:e2e:live`): the app against a LOCAL Supabase
 * stack — real Auth, Postgres, RLS and seed data — instead of the mock mode
 * (playwright.config.ts) or the fake Auth endpoints. `e2e-live/env.ts`
 * refuses to start without the stack's values or with a non-local address.
 *
 * The server is `next dev` by default; `E2E_LIVE_SERVER=start` builds and
 * serves the production bundle instead (what CI does). `E2E_LIVE_BASE_URL`
 * targets a server that is already running.
 */
// Fails here, before any server starts, without a local stack's values: a dev
// server started with empty Supabase values would silently fall back to mock mode.
liveEnv();

const PORT = Number(process.env.E2E_LIVE_PORT) || 5197;
const baseURL = process.env.E2E_LIVE_BASE_URL ?? `http://localhost:${PORT}`;

const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

const env = {
  PORT: String(PORT),
  NEXT_DIST_DIR: ".next-e2e-live",
  NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "",
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "",
};
const command = process.env.E2E_LIVE_SERVER === "start" ? `npx next build && npx next start -p ${PORT}` : "npm run dev";

export default defineConfig({
  testDir: "./e2e-live",
  globalSetup: "./e2e-live/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-live" }]] : "list",
  outputDir: "test-results-live",
  timeout: 60_000,
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
  webServer: process.env.E2E_LIVE_BASE_URL
    ? undefined
    : { command, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 600_000, env },
});
