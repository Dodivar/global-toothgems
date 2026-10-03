import "server-only";

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

type PostHogLogger = {
  emit(record: { severityText: "INFO" | "WARN" | "ERROR"; body: string; attributes?: Record<string, string | number | boolean> }): void;
};

let posthogLogger: PostHogLogger | undefined;
let initialized = false;

export function initializePostHogLogs() {
  if (initialized) return;
  initialized = true;

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!projectToken) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
      );
    }
    return;
  }

  if (!host) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
      );
    }
    return;
  }

  const exporter = new OTLPLogExporter({
    url: new URL("/i/v1/logs", host).toString(),
    headers: { Authorization: `Bearer ${projectToken}` },
  });
  const provider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor(exporter)],
  });

  posthogLogger = provider.getLogger("global-toothgems-posthog");
}

export function getPostHogLogger() {
  return posthogLogger;
}
