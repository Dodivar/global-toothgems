export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializePostHogLogs } = await import("./src/lib/posthogLogs");
    initializePostHogLogs();
  }
}
