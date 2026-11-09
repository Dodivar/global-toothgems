import { assertEquals } from "jsr:@std/assert@1";
import {
  handlePurgeStorageObjects,
  purgeQueuedFiles,
  type PurgeStore,
  type QueuedFile,
} from "./handler.ts";

function memoryStore(files: QueuedFile[]) {
  const queue = new Map(
    files.map((
      f,
    ) => [f.id, { ...f, attempts: 0, error: null as string | null }]),
  );
  const store: PurgeStore = {
    pending: (limit) =>
      Promise.resolve(
        [...queue.values()].sort((a, b) =>
          a.attempts - b.attempts || a.id - b.id
        ).slice(0, limit),
      ),
    record: (done, failed, error) => {
      done.forEach((id) => queue.delete(id));
      failed.forEach((id) => {
        const row = queue.get(id)!;
        row.attempts += 1;
        row.error = error;
      });
      return Promise.resolve();
    },
  };
  return { store, queue };
}

const quiet = () => {};

Deno.test("queued files are removed per bucket in batches and dequeued", async () => {
  const files = Array.from(
    { length: 150 },
    (_, i) => ({
      id: i + 1,
      bucket: "contact-attachments",
      name: `guest/${i}.jpg`,
    }),
  );
  const { store, queue } = memoryStore(files);
  const calls: number[] = [];
  const report = await purgeQueuedFiles(
    store,
    (_bucket, names) => (calls.push(names.length), Promise.resolve()),
    quiet,
  );
  assertEquals(report, { removed: 150, failed: 0 });
  assertEquals(calls, [100, 50]);
  assertEquals(queue.size, 0);
});

Deno.test("a failed removal keeps the files queued, counts the attempt and does not loop", async () => {
  const { store, queue } = memoryStore([
    { id: 1, bucket: "contact-attachments", name: "guest/a.jpg" },
    { id: 2, bucket: "contact-attachments", name: "guest/b.jpg" },
  ]);
  let calls = 0;
  const report = await purgeQueuedFiles(
    store,
    () => (calls++, Promise.reject(new Error("storage down"))),
    quiet,
  );
  assertEquals(report, { removed: 0, failed: 2 });
  assertEquals(calls, 1);
  assertEquals(queue.get(1)?.attempts, 1);
  assertEquals(queue.get(1)?.error, "storage down");
});

Deno.test("a bucket outside the allow-list is never emptied", async () => {
  const { store, queue } = memoryStore([{
    id: 1,
    bucket: "avatars",
    name: "u/a.png",
  }]);
  let called = false;
  const report = await purgeQueuedFiles(
    store,
    () => (called = true, Promise.resolve()),
    quiet,
  );
  assertEquals(called, false);
  assertEquals(report.failed, 1);
  assertEquals(queue.get(1)?.error, "bucket not purgeable: avatars");
});

Deno.test("the endpoint needs POST and the shared secret", async () => {
  const deps = {
    secret: "s3cret",
    run: () => Promise.resolve({ removed: 0, failed: 0 }),
    log: quiet,
  };
  assertEquals(
    (await handlePurgeStorageObjects(
      new Request("http://x", { method: "GET" }),
      deps,
    )).status,
    405,
  );
  assertEquals(
    (await handlePurgeStorageObjects(
      new Request("http://x", { method: "POST" }),
      deps,
    )).status,
    401,
  );
  const wrong = new Request("http://x", {
    method: "POST",
    headers: { "x-internal-secret": "nope" },
  });
  assertEquals((await handlePurgeStorageObjects(wrong, deps)).status, 401);
  const ok = new Request("http://x", {
    method: "POST",
    headers: { "x-internal-secret": "s3cret" },
  });
  const res = await handlePurgeStorageObjects(ok, deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    ok: true,
    report: { removed: 0, failed: 0 },
  });
});

Deno.test("a sweep failure answers 500 without details", async () => {
  const deps = {
    secret: "s3cret",
    run: () => Promise.reject(new Error("db down")),
    log: quiet,
  };
  const req = new Request("http://x", {
    method: "POST",
    headers: { "x-internal-secret": "s3cret" },
  });
  const res = await handlePurgeStorageObjects(req, deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
});
