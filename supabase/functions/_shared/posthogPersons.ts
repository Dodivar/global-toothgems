/**
 * Deletes a member's PostHog person, events and session recordings when the
 * account is erased (decision 125 (f), closed 2026-11-12): the browser
 * identifies a signed-in member by the account id only (`lib/auth.tsx`), so
 * that id is the PostHog distinct id.
 *
 * Endpoint: POST {host}/api/projects/{project}/persons/bulk_delete/ with a
 * personal API key scoped to "Person: Write" on the Global Toothgems project
 * (function secret `POSTHOG_PERSON_DELETE_API_KEY`). PostHog deletes events
 * and recordings asynchronously. A plain `fetch`, injectable for tests.
 */

/** PostHog Cloud EU, project "Global Toothgems". Overridable with POSTHOG_API_HOST / POSTHOG_PROJECT_ID. */
export const DEFAULT_POSTHOG_API_HOST = "https://eu.posthog.com";
export const DEFAULT_POSTHOG_PROJECT_ID = "292490";

export interface PostHogPersonsConfig {
  apiKey: string;
  host: string;
  projectId: string;
}

/** The configuration from the function's secrets, or null when the key is not set (deletion skipped). */
export function postHogPersonsConfig(env: (name: string) => string | undefined): PostHogPersonsConfig | null {
  const apiKey = env("POSTHOG_PERSON_DELETE_API_KEY")?.trim();
  if (!apiKey) return null;
  const host = (env("POSTHOG_API_HOST")?.trim() || DEFAULT_POSTHOG_API_HOST).replace(/\/+$/, "");
  const projectId = env("POSTHOG_PROJECT_ID")?.trim() || DEFAULT_POSTHOG_PROJECT_ID;
  if (!/^https:\/\//.test(host) || !/^\d+$/.test(projectId)) throw new Error("posthog: invalid host or project id");
  return { apiKey, host, projectId };
}

/** Asks PostHog to delete every person behind this distinct id, with their events and recordings. */
export async function deletePostHogPerson(
  config: PostHogPersonsConfig,
  distinctId: string,
  doFetch: typeof fetch = fetch,
): Promise<void> {
  const params = new URLSearchParams({ delete_events: "true", delete_recordings: "true" });
  const url = `${config.host}/api/projects/${config.projectId}/persons/bulk_delete/?${params}`;
  const response = await doFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }),
    signal: AbortSignal.timeout(10_000),
  });
  // The body is not logged: it could echo identifiers.
  if (!response.ok) throw new Error(`posthog bulk_delete answered ${response.status}`);
  await response.body?.cancel();
}
