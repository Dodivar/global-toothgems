import type { Page } from "@playwright/test";

/**
 * Waiting for React, not for the clock. A server-rendered page is visible
 * before React has hydrated it; under load (CI) a test can click a button
 * whose page is still hydrating, and the re-render that follows hydration
 * (useHydrated, the cookie banner, the address read in the browser) then
 * undoes what the click opened. Waiting for "networkidle" does not cover it.
 *
 * React reports every commit to the DevTools global hook when one exists, in
 * development and production builds alike. A minimal hook, installed before
 * any page script, counts them; `waitForReactSettled` returns once React has
 * committed at least once and nothing more for `QUIET_MS`.
 */
const QUIET_MS = 100;

export async function installReactCommitCounter(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
    w.__e2eReactCommits = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => {},
      onScheduleFiberRoot: () => {},
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      onCommitFiberRoot: () => {
        w.__e2eReactCommits = (w.__e2eReactCommits as number) + 1;
        w.__e2eReactLastCommit = performance.now();
      },
    };
  });
}

export async function waitForReactSettled(page: Page) {
  await page.waitForFunction(
    (quietMs) => {
      const w = window as unknown as Record<string, number | undefined>;
      if (w.__e2eReactCommits === undefined) throw new Error("installReactCommitCounter() was not called for this page");
      return w.__e2eReactCommits > 0 && performance.now() - (w.__e2eReactLastCommit ?? 0) >= quietMs;
    },
    QUIET_MS,
    { polling: 25 },
  );
}
