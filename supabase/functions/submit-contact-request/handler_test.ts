import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";
import { handleContact, MAX_TOTAL_BYTES, sniffFile, toBase64, type ContactDeps } from "./handler.ts";
import type { SendRequest } from "../_shared/email/send.ts";

const SITE = "https://globaltoothgems.com";
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d];

function makeDeps(overrides: Partial<ContactDeps> = {}) {
  const sent: SendRequest[] = [];
  const uploaded: string[] = [];
  const removed: string[][] = [];
  const submitted: { caller: { userId: string | null; token: string | null }; paths: string[] }[] = [];
  const logs: unknown[] = [];
  const deps: ContactDeps = {
    origins: { site: SITE, allowed: new Set([SITE]) },
    userFromToken: (token) => Promise.resolve(token === "member-token" ? "user-1" : null),
    ipAllowed: () => Promise.resolve(true),
    upload: (path) => {
      uploaded.push(path);
      return Promise.resolve();
    },
    remove: (paths) => {
      removed.push(paths);
      return Promise.resolve();
    },
    submit: (caller, _s, paths) => {
      submitted.push({ caller, paths });
      return Promise.resolve({ ticket: "SUP-100001" });
    },
    supportEmail: () => Promise.resolve("support@globaltoothgems.com"),
    sendEmail: (request) => {
      sent.push(request);
      return Promise.resolve({ status: "sent", id: "re_1" });
    },
    log: (m, d) => logs.push([m, d]),
    ...overrides,
  };
  return { deps, sent, uploaded, removed, submitted, logs };
}

function form(extra: Record<string, string> = {}, files: File[] = []): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    name: "Léa Martin",
    email: "Lea@Example.com",
    category: "order",
    subject: "Mon colis",
    message: "Mon colis n'est pas arrivé, pouvez-vous vérifier ?",
    order_reference: "GT-1001",
    locale: "fr",
    ...extra,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  for (const file of files) data.append("files", file);
  return data;
}

const file = (head: number[], name: string, size = 100) => {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return new File([bytes], name);
};

const post = (body: FormData, headers: Record<string, string> = {}) =>
  new Request("https://x.supabase.co/functions/v1/submit-contact-request", { method: "POST", body, headers });

Deno.test("sniffFile reads the content, not the name", () => {
  assertEquals(sniffFile(new Uint8Array(JPEG_HEAD))?.ext, "jpg");
  assertEquals(sniffFile(new Uint8Array(PDF_HEAD))?.ext, "pdf");
  assertEquals(sniffFile(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null);
});

Deno.test("toBase64 matches btoa on a large buffer", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  assertEquals(toBase64(bytes), btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")));
});

Deno.test("a visitor's message is stored under guest/, ticketed and e-mailed twice", async () => {
  const { deps, sent, uploaded, submitted } = makeDeps();
  const res = await handleContact(post(form({}, [file(JPEG_HEAD, "photo.JPG"), file(PDF_HEAD, "../../facture.pdf")])), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "sent", ticket_number: "SUP-100001" });
  assertEquals(uploaded.length, 2);
  assertEquals(uploaded.every((p) => /^guest\/[0-9a-f-]{36}\.(jpg|pdf)$/.test(p)), true);
  assertEquals(submitted[0].caller, { userId: null, token: null });
  assertEquals(sent.map((s) => s.templateKey), ["contact_acknowledgement", "contact_request_received"]);
  assertEquals(sent[0].to, "lea@example.com");
  assertObjectMatch(sent[1], { to: "support@globaltoothgems.com", replyTo: "lea@example.com", locale: "fr" });
  assertEquals(sent[1].attachments?.map((a) => a.filename), ["photo.JPG", "facture.pdf"]);
});

Deno.test("a member goes through their own folder and token", async () => {
  const { deps, uploaded, submitted } = makeDeps();
  await handleContact(post(form({}, [file(PDF_HEAD, "a.pdf")]), { Authorization: "Bearer member-token" }), deps);
  assertEquals(uploaded[0].startsWith("user-1/"), true);
  assertEquals(submitted[0].caller, { userId: "user-1", token: "member-token" });
});

Deno.test("a publishable key is not a member token: the visitor path", async () => {
  const { deps, submitted } = makeDeps();
  await handleContact(post(form(), { Authorization: "Bearer sb_publishable_abc" }), deps);
  assertEquals(submitted[0].caller, { userId: null, token: null });
});

Deno.test("more than 5 files, more than 20 MB in all, or a disguised file are refused before any upload", async () => {
  const six = Array.from({ length: 6 }, (_, i) => file(PDF_HEAD, `${i}.pdf`));
  const a = makeDeps();
  assertEquals((await handleContact(post(form({}, six)), a.deps)).status, 400);

  const big = [file(PDF_HEAD, "a.pdf", MAX_TOTAL_BYTES / 2 + 1), file(PDF_HEAD, "b.pdf", MAX_TOTAL_BYTES / 2 + 1)];
  const b = makeDeps();
  assertEquals((await handleContact(post(form({}, big)), b.deps)).status, 413);

  const exe = makeDeps();
  const res = await handleContact(post(form({}, [file([0x4d, 0x5a], "innocent.pdf")])), exe.deps);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "file_type" });
  assertEquals(a.uploaded.length + b.uploaded.length + exe.uploaded.length, 0);
});

Deno.test("invalid fields are refused; the honeypot is answered as a success without doing anything", async () => {
  const cases: Record<string, string>[] = [{ email: "nope" }, { category: "x" }, { message: "court" }, { name: "" }];
  for (const bad of cases) {
    assertEquals((await handleContact(post(form(bad)), makeDeps().deps)).status, 400);
  }
  const { deps, sent, submitted } = makeDeps();
  const res = await handleContact(post(form({ website: "http://spam" })), deps);
  assertEquals(res.status, 200);
  assertEquals(sent.length + submitted.length, 0);
});

Deno.test("the address throttle and the database throttle both answer 429", async () => {
  const limited = makeDeps({ ipAllowed: () => Promise.resolve(false) });
  const res = await handleContact(post(form(), { "sb-forwarded-for": "203.0.113.9" }), limited.deps);
  assertEquals(res.status, 429);
  assertEquals(limited.submitted.length, 0);

  const db = makeDeps({ submit: () => Promise.resolve({ error: { code: "PT429" } }) });
  const res2 = await handleContact(post(form({}, [file(PDF_HEAD, "a.pdf")])), db.deps);
  assertEquals(res2.status, 429);
  assertEquals(db.removed.length, 1); // the stored file does not stay orphaned
});

Deno.test("a failing e-mail never fails the form", async () => {
  const { deps, logs } = makeDeps({ sendEmail: () => Promise.reject(new Error("provider down")) });
  const res = await handleContact(post(form()), deps);
  assertEquals(res.status, 200);
  assertEquals(logs.length, 2);
});

Deno.test("without a support address the ticket is still created", async () => {
  const { deps, sent } = makeDeps({ supportEmail: () => Promise.resolve(null) });
  assertEquals((await handleContact(post(form()), deps)).status, 200);
  assertEquals(sent.map((s) => s.templateKey), ["contact_acknowledgement"]);
});
