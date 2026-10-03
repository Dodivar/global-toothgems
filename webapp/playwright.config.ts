import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Two groups of tests, each against its own dev server:
 *
 * - `chromium` — smoke tests, the reference of the Next.js migration
 *   (`docs/migration-nextjs.md`). The app runs in mock mode: the Supabase
 *   variables are forced empty, so a local `.env.local` never points them at
 *   a real project.
 * - `auth-server` — the server-side auth plumbing (proxy, `/auth/confirm`,
 *   cookie session) against `e2e/support/fake-supabase.mjs`, a local stand-in
 *   for the few Supabase Auth endpoints involved. Never a real project.
 *
 * `E2E_BASE_URL` / `E2E_AUTH_BASE_URL` target already running servers (a
 * `next start`, a preview) instead of starting dev servers.
 */
const PORT = Number(process.env.E2E_PORT) || 5199;
const AUTH_PORT = Number(process.env.E2E_AUTH_PORT) || 5198;
const FAKE_SUPABASE_PORT = 54399;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const authBaseURL = process.env.E2E_AUTH_BASE_URL ?? `http://localhost:${AUTH_PORT}`;

/* Cloud sessions ship a Chromium outside Playwright's cache; locally,
   `npx playwright install chromium` provides one and this stays unset. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);
const chrome = { ...devices["Desktop Chrome"], launchOptions: { executablePath } };

type WebServer = NonNullable<Parameters<typeof defineConfig>[0]["webServer"]>;
const servers: Extract<WebServer, unknown[]> = [
  {
    command: "node e2e/support/fake-supabase.mjs",
    url: `http://localhost:${FAKE_SUPABASE_PORT}/health`,
    reuseExistingServer: !process.env.CI,
    env: { FAKE_SUPABASE_PORT: String(FAKE_SUPABASE_PORT) },
  },
];
if (!process.env.E2E_BASE_URL) {
  servers.push({
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "" },
  });
}
if (!process.env.E2E_AUTH_BASE_URL) {
  servers.push({
    command: "npm run dev",
    url: authBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(AUTH_PORT),
      // A separate build folder: two dev servers cannot share `.next`.
      NEXT_DIST_DIR: ".next-e2e-auth",
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${FAKE_SUPABASE_PORT}`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
    },
  });
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /auth-(server|cache)\.spec\.ts/, use: { ...chrome, baseURL } },
    { name: "auth-server", testMatch: /auth-server\.spec\.ts/, use: { ...chrome, baseURL: authBaseURL } },
    // Counts the server's reads on the fake Supabase, which every test of the
    // project above can cause: runs once they have all finished.
    { name: "auth-cache", testMatch: /auth-cache\.spec\.ts/, dependencies: ["auth-server"], use: { ...chrome, baseURL: authBaseURL } },
  ],
  webServer: servers,
});
