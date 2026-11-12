import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializePostHogLogs } = await import("./src/lib/posthogLogs");
    initializePostHogLogs();
  }
}

/**
 * Server errors (Server Components, Route Handlers, proxy) go to PostHog's
 * error tracking, without anything about the visitor (`src/lib/posthogServer.ts`).
 * The browser's errors are captured by `instrumentation-client.ts` and the
 * error pages (`app/error.tsx`, `app/(public)/error.tsx`, `app/global-error.tsx`).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerError } = await import("./src/lib/posthogServer");
  await captureServerError(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: "renderSource" in context ? context.renderSource : undefined,
  });
};
