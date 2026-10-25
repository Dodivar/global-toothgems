import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { imageModelConfig, readImage } from "./gemini.ts";
import { handleStudioTryOn, readSourceRef, type StudioTryOnDeps, type TryOnCreationRow } from "./handler.ts";
import { buildTryOnPrompt, piecesFromScene, toothLabel } from "./prompt.ts";

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
  const calls = { started: 0, finished: [] as string[], prompts: [] as string[], images: 0 };
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
    generate: (prompt, images) => {
      calls.prompts.push(prompt);
      calls.images = images.length;
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

function form(source: unknown = { creation_id: CREATION }, photo: Blob | null = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })) {
  const data = new FormData();
  data.set("source", JSON.stringify(source));
  if (photo) data.set("photo", photo, "smile.jpg");
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

Deno.test("a generation: counted, prompt from the stored scene, image returned", async () => {
  const { deps, calls } = fake();
  const res = await handleStudioTryOn(post(form()), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, image: { mime_type: "image/png", data: "aW1n" } });
  assertEquals(calls.started, 1);
  assertEquals(calls.finished, ["generated"]);
  assertEquals(calls.images, 2); // photo + one reference
  assertStringIncludes(calls.prompts[0], "Exactly 2 gems");
  assertStringIncludes(calls.prompts[0], "upper left central incisor (FDI 21)");
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

Deno.test("invalid input: no photo, wrong type, malformed source", async () => {
  assertEquals((await handleStudioTryOn(post(form(undefined, null)), fake().deps)).status, 400);
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

Deno.test("prompt: one line per valid piece, sizes and teeth spelled out", () => {
  const pieces = piecesFromScene({ pieces: [...SCENE.pieces, { toothId: "11", look: { color: "red" } }, null] });
  assertEquals(pieces.length, 2);
  assertEquals(pieces[0], { toothId: "21", shape: "round", material: "crystal", color: "#ffffff", effect: "none", size: "SS5", longestMm: 1.8 });
  assertEquals(pieces[1].size, "2 × 4 mm");
  const prompt = buildTryOnPrompt({ pieces, referenceCount: 0, withDesign: true });
  assertStringIncludes(prompt, "Image 2 is a front view");
  assert(!prompt.includes("reference photo"));
  assertEquals(toothLabel("X0"), "front tooth surface (unlabelled)");
  assertEquals(toothLabel("36"), "lower left first molar (FDI 36)");
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
