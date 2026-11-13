// Source maps for PostHog error tracking (2026-11-12): readable stack traces
// for the browser's exceptions without publishing the source.
//
// Only on a Vercel production build that holds the PostHog personal API key
// `POSTHOG_PERSONAL_API_KEY` (scopes "Error tracking: Write" + "Organization:
// Read", set by the owner as a build variable). Then:
//   1. `next.config.ts` turns on `productionBrowserSourceMaps` (this module's
//      `sourcemapUploadConfig`), so the build writes `.map` files;
//   2. `npm run build` runs this file after `next build`: the PostHog CLI
//      (pinned, fetched with npx — not a dependency, so installs elsewhere never
//      download its binary) stamps each chunk with its id, uploads the maps and
//      deletes them (`--delete-after`);
//   3. whatever happens, no `.map` file is left in the output: a failed upload
//      deletes them itself and warns, without failing the deployment.
// Everywhere else (local, CI, previews) it does nothing.
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The PostHog CLI version used for uploads (pinned; at least two weeks old when chosen). */
export const POSTHOG_CLI_VERSION = "0.19.0";
/** PostHog project "Global Toothgems" (EU). Overridable with POSTHOG_PROJECT_ID. */
export const DEFAULT_POSTHOG_PROJECT_ID = "292490";

/**
 * What the upload needs, or null when this build must not produce or upload
 * source maps.
 * @param {Record<string, string | undefined>} env
 * @returns {{ apiKey: string; host: string; projectId: string; release: string | null } | null}
 */
export function sourcemapUploadConfig(env) {
  if (env.VERCEL_ENV !== "production") return null;
  const apiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!apiKey) return null;
  // PostHog Cloud only: the ingestion host `https://eu.i.posthog.com` → the app host `https://eu.posthog.com`.
  const match = /^https:\/\/(eu|us)\.i\.posthog\.com\/?$/.exec(env.NEXT_PUBLIC_POSTHOG_HOST ?? "");
  if (!match) return null;
  const projectId = env.POSTHOG_PROJECT_ID?.trim() || DEFAULT_POSTHOG_PROJECT_ID;
  if (!/^\d+$/.test(projectId)) return null;
  return { apiKey, host: `https://${match[1]}.posthog.com`, projectId, release: env.VERCEL_GIT_COMMIT_SHA || null };
}

/** Every `.map` file under `dir`. */
function mapFiles(dir) {
  let found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found = found.concat(mapFiles(path));
    else if (name.endsWith(".map")) found.push(path);
  }
  return found;
}

function main() {
  const config = sourcemapUploadConfig(process.env);
  if (!config) {
    console.log("[sourcemaps] not a production build with POSTHOG_PERSONAL_API_KEY: nothing to upload.");
    return;
  }
  const webapp = join(dirname(fileURLToPath(import.meta.url)), "..");
  const staticDir = join(webapp, process.env.NEXT_DIST_DIR || ".next", "static");
  const args = ["-y", `@posthog/cli@${POSTHOG_CLI_VERSION}`, "sourcemap", "process", "--directory", staticDir, "--delete-after"];
  if (config.release) args.push("--release-name", "global-toothgems-webapp", "--release-version", config.release);
  const run = spawnSync("npx", args, {
    cwd: webapp,
    stdio: "inherit",
    env: {
      ...process.env,
      POSTHOG_CLI_API_KEY: config.apiKey,
      POSTHOG_CLI_PROJECT_ID: config.projectId,
      POSTHOG_CLI_HOST: config.host,
    },
  });
  const left = mapFiles(staticDir);
  for (const file of left) rmSync(file, { force: true });
  if (run.status !== 0) {
    console.warn(`[sourcemaps] upload failed (exit ${run.status ?? run.error?.message}); ${left.length} map file(s) deleted, deployment continues.`);
  } else {
    console.log(`[sourcemaps] uploaded to PostHog${left.length ? `; ${left.length} leftover map file(s) deleted` : ""}.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
