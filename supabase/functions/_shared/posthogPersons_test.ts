import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { deletePostHogPerson, postHogPersonsConfig } from "./posthogPersons.ts";

const env = (values: Record<string, string>) => (name: string) => values[name];

Deno.test("no key: PostHog deletion is skipped", () => {
  assertEquals(postHogPersonsConfig(env({})), null);
  assertEquals(postHogPersonsConfig(env({ POSTHOG_PERSON_DELETE_API_KEY: "  " })), null);
});

Deno.test("the key alone uses PostHog Cloud EU and the Global Toothgems project", () => {
  assertEquals(postHogPersonsConfig(env({ POSTHOG_PERSON_DELETE_API_KEY: "phx_test" })), {
    apiKey: "phx_test",
    host: "https://eu.posthog.com",
    projectId: "292490",
  });
});

Deno.test("an invalid host or project id is refused", () => {
  assertThrows(() => postHogPersonsConfig(env({ POSTHOG_PERSON_DELETE_API_KEY: "k", POSTHOG_API_HOST: "http://x" })));
  assertThrows(() => postHogPersonsConfig(env({ POSTHOG_PERSON_DELETE_API_KEY: "k", POSTHOG_PROJECT_ID: "abc" })));
});

Deno.test("deletes the person behind the account id, with events and recordings", async () => {
  let seen: { url: string; init?: RequestInit } | null = null;
  const fakeFetch = ((url: string, init?: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response("{}", { status: 202 }));
  }) as typeof fetch;
  await deletePostHogPerson({ apiKey: "phx_test", host: "https://eu.posthog.com", projectId: "292490" }, "user-1", fakeFetch);
  const call = seen as unknown as { url: string; init: RequestInit };
  assertEquals(
    call.url,
    "https://eu.posthog.com/api/projects/292490/persons/bulk_delete/?delete_events=true&delete_recordings=true",
  );
  assertEquals((call.init.headers as Record<string, string>).Authorization, "Bearer phx_test");
  assertEquals(JSON.parse(String(call.init.body)), { distinct_ids: ["user-1"], delete_events: true, delete_recordings: true });
});

Deno.test("a refusal from PostHog is an error (the caller logs it)", async () => {
  const fakeFetch = (() => Promise.resolve(new Response("denied", { status: 403 }))) as typeof fetch;
  await assertRejects(
    () => deletePostHogPerson({ apiKey: "k", host: "https://eu.posthog.com", projectId: "1" }, "user-1", fakeFetch),
    Error,
    "403",
  );
});
