import { describe, expect, it } from "vitest";
import { sourcemapUploadConfig } from "../../scripts/posthog-sourcemaps.mjs";

const production = {
  VERCEL_ENV: "production",
  POSTHOG_PERSONAL_API_KEY: "phx_test",
  NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
  VERCEL_GIT_COMMIT_SHA: "abc123",
};

describe("sourcemapUploadConfig", () => {
  it("uploads from a Vercel production build holding the key, to PostHog EU and the project", () => {
    expect(sourcemapUploadConfig(production)).toEqual({
      apiKey: "phx_test",
      host: "https://eu.posthog.com",
      projectId: "292490",
      release: "abc123",
    });
  });

  it("does nothing on previews, locally, in CI, without the key or with another host", () => {
    expect(sourcemapUploadConfig({ ...production, VERCEL_ENV: "preview" })).toBeNull();
    expect(sourcemapUploadConfig({ ...production, VERCEL_ENV: undefined })).toBeNull();
    expect(sourcemapUploadConfig({ ...production, POSTHOG_PERSONAL_API_KEY: "" })).toBeNull();
    expect(sourcemapUploadConfig({ ...production, NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.com" })).toBeNull();
    expect(sourcemapUploadConfig({ ...production, POSTHOG_PROJECT_ID: "abc" })).toBeNull();
  });
});
