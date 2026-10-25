import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { imageModelConfig, readImage } from "./gemini.ts";
import { handleStudioTryOn, readSourceRef, type StudioTryOnDeps, type TryOnCreationRow } from "./handler.ts";
import { piecesFromScene } from "./prompt.ts";
import { TRY_ON_SYSTEM_PROMPT } from "./systemPrompt.ts";

const SITE = "https://global-toothgems.example";
const TOKEN = "member.jwt.sig";
const CREATION = "7d4e8f0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const SCENE = {
  version: 2,
  pieces: [
    { id: "p1", toothId: "21", size: { ss: 5 }, scale: 0.9, look: { shape: "round", material: "crystal", color: "#FFFFFF", effect: "none" } },
    { id: "p2", toothId: "12", size: { mm: [2, 4] }, scale: 2, look: { shape: "heart", material: "gold", color: "#e8c25a", effect: "none" } },
  ],
};

function fake(over: Partial<StudioTryOnDeps> = {}, row: TryOnCreationRow | null = { creationId: CREATION, source: "own", scene: SCENE, allowed: true }) {
  const calls = { started: 0, finished: [] as string[], images: [] as string[] };
  const deps: StudioTryOnDeps = {
    origins: readSiteOrigins(SITE, undefined),
    available: true,
    dailyLimit: 3,
    userFromToken: (token) => Promise.resolve(token === TOKEN ? "user-1" : null),
    loadCreation: () => Promise.resolve(row),
    countRecent: () => Promise.resolve(0),
    startRequest: () => {
      calls.started++;
      return Promise.resolve("req-1");
    },
    finishRequest: (_id, status, code) => {
      calls.finished.push(code ? `${status}:${code}` : status);
      return Promise.resolve();
    },
    references: () => Promise.resolve([{ mimeType: "image/jpeg", data: "cmVm" }]),
    generate: (images) => {
      calls.images = images.map((img) => `${img.mimeType}:${img.data}`);
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

function form(
  source: unknown = { creation_id: CREATION },
  photo: Blob | null = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  design: Blob | null = new Blob([new Uint8Array([4, 5])], { type: "image/png" }),
) {
  const data = new FormData();
  data.set("source", JSON.stringify(source));
  if (photo) data.set("photo", photo, "smile.jpg");
  if (design) data.set("design", design, "design.png");
  return data;
}

const post = (body: FormData | string, token: string | null = TOKEN) =>
  new Request("https://fn.example/studio-try-on", {
    method: "POST",
    headers: {
      origin: SITE,
      ...(typeof body === "string" ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

Deno.test("status: says whether the AI is connected, without an account", async () => {
  const { deps } = fake({ available: false });
  const res = await handleStudioTryOn(post('{"action":"status"}', null), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { available: false });
});

Deno.test("not connected: nothing is read or counted", async () => {
  const { deps, calls } = fake({ available: false });
  const res = await handleStudioTryOn(post(form()), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), { ok: false, code: "not_available" });
  assertEquals(calls.started, 0);
});

Deno.test("a generation: counted; design (IMAGE 1), photo (IMAGE 2), then references; image returned", async () => {
  const { deps, calls } = fake();
  const res = await handleStudioTryOn(post(form()), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, image: { mime_type: "image/png", data: "aW1n" } });
  assertEquals(calls.started, 1);
  assertEquals(calls.finished, ["generated"]);
  assertEquals(calls.images, ["image/png:BAU=", "image/jpeg:AQID", "image/jpeg:cmVm"]);
});

Deno.test("refusals: no token, expired, unknown creation, owner without the plan, daily limit", async () => {
  assertEquals((await handleStudioTryOn(post(form(), null), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(form(), "other.jwt.sig"), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(form()), fake({}, null).deps)).status, 404);
  const notAllowed = fake({}, { creationId: CREATION, source: "glowbook", scene: SCENE, allowed: false });
  const res = await handleStudioTryOn(post(form({ handle: "aurora", item_id: CREATION })), notAllowed.deps);
  assertEquals(res.status, 403);
  assertEquals(notAllowed.calls.started, 0);
  const limited = fake({ countRecent: () => Promise.resolve(3) });
  assertEquals((await handleStudioTryOn(post(form()), limited.deps)).status, 429);
  assertEquals(limited.calls.started, 0);
});

Deno.test("invalid input: no photo, no design, wrong type, malformed source", async () => {
  assertEquals((await handleStudioTryOn(post(form(undefined, null)), fake().deps)).status, 400);
  assertEquals((await handleStudioTryOn(post(form(undefined, undefined, null)), fake().deps)).status, 400);
  assertEquals((await handleStudioTryOn(post(form(undefined, new Blob(["x"], { type: "image/gif" }))), fake().deps)).status, 400);
  assertEquals((await handleStudioTryOn(post(form({ creation_id: CREATION, token: "x" })), fake().deps)).status, 400);
});

Deno.test("a provider failure is recorded and reported", async () => {
  const { deps, calls } = fake({ generate: () => Promise.resolve({ ok: false, code: "blocked", detail: "SAFETY" }) });
  const res = await handleStudioTryOn(post(form()), deps);
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { ok: false, code: "blocked" });
  assertEquals(calls.finished, ["failed:blocked"]);
});

Deno.test("readSourceRef: exactly one well-formed reference", () => {
  assertEquals(readSourceRef(JSON.stringify({ creation_id: CREATION.toUpperCase() })), { creationId: CREATION });
  assertEquals(readSourceRef(JSON.stringify({ token: "a".repeat(48) })), { token: "a".repeat(48) });
  assertEquals(readSourceRef(JSON.stringify({ handle: "Aurora.Gems", item_id: CREATION })), { handle: "aurora.gems", itemId: CREATION });
  assertEquals(readSourceRef(JSON.stringify({ token: "short" })), null);
  assertEquals(readSourceRef(JSON.stringify({ handle: "aurora" })), null);
  assertEquals(readSourceRef("not json"), null);
});

Deno.test("scene: valid pieces only; the owner's system prompt names the two images", () => {
  const pieces = piecesFromScene({ pieces: [...SCENE.pieces, { toothId: "11", look: { color: "red" } }, null] });
  assertEquals(pieces.length, 2);
  assertEquals(pieces[1].size, "2 × 4 mm");
  assertEquals(piecesFromScene({}), []);
  assertStringIncludes(TRY_ON_SYSTEM_PROMPT, "**IMAGE 1 — 3D DENTAL JEWELRY DESIGN REFERENCE:**");
  assertStringIncludes(TRY_ON_SYSTEM_PROMPT, "**IMAGE 2 — CUSTOMER PHOTO:**");
});

Deno.test("gemini: config needs both secrets; the answer's first image is read", () => {
  assertEquals(imageModelConfig(() => undefined), null);
  assertEquals(imageModelConfig((n) => (n === "GEMINI_API_KEY" ? "k" : undefined)), null);
  assertEquals(imageModelConfig((n) => ({ GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])?.model, "model-x");
  assertEquals(readImage({ candidates: [{ content: { parts: [{ text: "hi" }, { inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), {
    ok: true,
    image: { mimeType: "image/png", data: "QQ==" },
  });
  assertEquals(readImage({ promptFeedback: { blockReason: "SAFETY" } }).ok, false);
  assertEquals(readImage({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }), { ok: false, code: "blocked", detail: "IMAGE_SAFETY" });
  assertEquals(readImage(null), { ok: false, code: "failed", detail: "no image in the answer" });
});
