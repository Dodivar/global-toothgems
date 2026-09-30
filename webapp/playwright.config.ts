import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests: the reference the Next.js migration is checked against
 * (`docs/migration-nextjs.md`). They run the app in mock mode — the Supabase
 * variables are forced empty below, so a local `.env.local` never points them
 * at a real project.
 *
 * `E2E_BASE_URL` targets an already running server (a preview deployment, a
 * `next start`) instead of starting the dev server.
 */
const PORT = Number(process.env.E2E_PORT) || 5199;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/* Cloud sessions ship a Chromium outside Playwright's cache; locally,
   `npx playwright install chromium` provides one and this stays unset. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          PORT: String(PORT),
          VITE_SUPABASE_URL: "",
          VITE_SUPABASE_PUBLISHABLE_KEY: "",
        },
      },
});
