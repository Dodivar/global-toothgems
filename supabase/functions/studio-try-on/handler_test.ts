import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import jpegCodec from "npm:jpeg-js@0.4.4";
import { readSiteOrigins } from "../_shared/http.ts";
import { mouthCrop, nearestRatio } from "./crop.ts";
import { accessToken, generateImage, generateUrl, imageModelConfig, nearestAspectRatio, readAdcJson, readImage, resetTokenCache } from "./gemini.ts";
import { handleStudioTryOn, readSourceRef, type StudioTryOnDeps, type TryOnCreationRow } from "./handler.ts";
import { imageSize, judgePhoto, MIN_TEETH_SPAN, photoScale } from "./photoCheck.ts";
import { buildDesignData, piecesFromScene, readSeats, toothLabel } from "./prompt.ts";
import { promptVersion, TRY_ON_SYSTEM_PROMPT_V1, TRY_ON_SYSTEM_PROMPT_V3 } from "./systemPrompt.ts";

const SITE = "https://global-toothgems.example";
const TOKEN = "member.jwt.sig";
const CREATION = "7d4e8f0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const SCENE = {
  version: 2,
  pieces: [
    { id: "p1", toothId: "21", size: { ss: 5 }, scale: 0.9, look: { shape: "round", material: "crystal", color: "#FFFFFF", effect: "none" } },
    { id: "p2", toothId: "12", size: { mm: [2, 4] }, scale: 2, look: { shape: "heart", material: "metal", color: "#e8c25a", effect: "none" } },
  ],
};

function fake(over: Partial<StudioTryOnDeps> = {}, row: TryOnCreationRow | null = { creationId: CREATION, source: "own", scene: SCENE, allowed: true }) {
  const calls = { started: 0, finished: [] as string[], images: [] as string[], data: "" };
  const deps: StudioTryOnDeps = {
    origins: readSiteOrigins(SITE, undefined),
    available: true,
    dailyLimit: 3,
    dailyChecks: 5,
    userFromToken: (token) => Promise.resolve(token === TOKEN ? "user-1" : null),
    loadCreation: () => Promise.resolve(row),
    unlimited: () => Promise.resolve(false),
    countRecent: () => Promise.resolve({ requests: 0, renders: 0 }),
    startRequest: () => {
      calls.started++;
      return Promise.resolve("req-1");
    },
    finishRequest: (_id, status, code) => {
      calls.finished.push(code ? `${status}:${code}` : status);
      return Promise.resolve();
    },
    references: () => Promise.resolve([{ mimeType: "image/jpeg", data: "cmVm" }]),
    readsMap: true,
    cropMouth: true,
    generate: (images, data) => {
      calls.images = images.map((img) => `${img.mimeType}:${img.data}`);
      calls.data = data;
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
  assertStringIncludes(calls.data, "DESIGN DATA — exactly 2 gems, no more.");
});

Deno.test("a generation reads the seats the browser measured, by piece id", async () => {
  const { deps, calls } = fake();
  const data = form();
  data.set("seats", JSON.stringify([{ id: "p1", gum: 0.24, mid: 0.17, width: 0.51, front: true }]));
  assertEquals((await handleStudioTryOn(post(data), deps)).status, 200);
  assertStringIncludes(calls.data, "longest side about 51% of this tooth's width");
});

Deno.test("refusals: no token, expired, unknown creation, owner without the plan, daily limit", async () => {
  assertEquals((await handleStudioTryOn(post(form(), null), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(form(), "other.jwt.sig"), fake().deps)).status, 401);
  assertEquals((await handleStudioTryOn(post(form()), fake({}, null).deps)).status, 404);
  const notAllowed = fake({}, { creationId: CREATION, source: "glowbook", scene: SCENE, allowed: false });
  const res = await handleStudioTryOn(post(form({ handle: "aurora", item_id: CREATION })), notAllowed.deps);
  assertEquals(res.status, 403);
  assertEquals(notAllowed.calls.started, 0);
  const limited = fake({ countRecent: () => Promise.resolve({ requests: 3, renders: 3 }) });
  assertEquals((await handleStudioTryOn(post(form()), limited.deps)).status, 429);
  assertEquals(limited.calls.started, 0);
  // Refused photos do not use up the renders, but every request counts toward the checks' cap.
  assertEquals((await handleStudioTryOn(post(form()), fake({ countRecent: () => Promise.resolve({ requests: 4, renders: 0 }) }).deps)).status, 200);
  assertEquals((await handleStudioTryOn(post(form()), fake({ countRecent: () => Promise.resolve({ requests: 5, renders: 0 }) }).deps)).status, 429);
  // An active administrator has no limit; the request is still recorded.
  const admin = fake({ unlimited: () => Promise.resolve(true), countRecent: () => Promise.resolve({ requests: 99, renders: 99 }) });
  assertEquals((await handleStudioTryOn(post(form()), admin.deps)).status, 200);
  assertEquals(admin.calls.started, 1);
});

const GOOD_PHOTO = {
  teeth_visible: true,
  teeth_covered: false,
  teeth_box: [400, 300, 520, 700],
  sharpness: "sharp",
  lighting: "good",
  head_pose: "frontal",
  central_incisors_visible: true,
};

Deno.test("photo check: an unsuitable photo is refused with its reasons, recorded, never rendered", async () => {
  const { deps, calls } = fake({
    checkPhoto: () => Promise.resolve({ ok: true, value: { ...GOOD_PHOTO, teeth_box: [600, 450, 640, 550], lighting: "too_dark" } }),
  });
  const res = await handleStudioTryOn(post(form()), deps);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { ok: false, code: "photo_unsuitable", reasons: ["too_dark", "too_far"] });
  assertEquals(calls.finished, ["failed:photo_unsuitable"]);
  assertEquals(calls.images, []);
});

Deno.test("photo check: a good photo is rendered; a check that fails never blocks the render", async () => {
  const good = fake({ checkPhoto: () => Promise.resolve({ ok: true, value: GOOD_PHOTO }) });
  assertEquals((await handleStudioTryOn(post(form()), good.deps)).status, 200);
  assertEquals(good.calls.finished, ["generated"]);
  const down = fake({ checkPhoto: () => Promise.resolve({ ok: false, detail: "http 404" }) });
  assertEquals((await handleStudioTryOn(post(form()), down.deps)).status, 200);
  const throws = fake({ checkPhoto: () => Promise.reject(new Error("boom")) });
  assertEquals((await handleStudioTryOn(post(form()), throws.deps)).status, 200);
});

Deno.test("judgePhoto: clear reasons only, the teeth's span against the longer side", () => {
  assertEquals(judgePhoto(GOOD_PHOTO, null), { issues: [], span: 0.4 });
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_visible: false }, null).issues, ["no_teeth"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_covered: true, sharpness: "blurred", lighting: "overexposed" }, null).issues, ["teeth_hidden", "too_bright", "blurry"]);
  // Only a face-on smile passes: turned (even slightly), or a front tooth not facing the camera, is refused.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: "strongly_turned" }, null).issues, ["not_frontal"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: "slightly_turned" }, null).issues, ["not_frontal"]);
  assertEquals(judgePhoto({ ...GOOD_PHOTO, central_incisors_visible: false }, null).issues, ["not_frontal"]);
  // No answer on the pose: not held against the photo.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, head_pose: undefined }, null).issues, []);
  // Soft or dim but readable: not refused.
  assertEquals(judgePhoto({ ...GOOD_PHOTO, sharpness: "slightly_blurred", lighting: "dim" }, null).issues, []);
  // A selfie of the whole face, portrait: the teeth span 28 % of the width, 21 % of the longer side.
  const face = judgePhoto({ ...GOOD_PHOTO, teeth_box: [540, 360, 600, 640] }, { width: 896, height: 1195 });
  assertEquals(face, { issues: ["too_far"], span: 0.21 });
  assertEquals(face.span! < MIN_TEETH_SPAN, true);
  // Missing or malformed facts are not held against the photo.
  assertEquals(judgePhoto({}, null), { issues: [], span: null });
  assertEquals(judgePhoto({ ...GOOD_PHOTO, teeth_box: [10, 900, 20, 100] }, null).issues, []);
});

Deno.test("imageSize: JPEG and PNG headers", () => {
  // SOI, APP0 (length 4), SOF0: precision 8, height 1195, width 896.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xab, 0x03, 0x80, 0x03, 0, 0, 0, 0]);
  assertEquals(imageSize(jpeg), { width: 896, height: 1195 });
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 480);
  assertEquals(imageSize(png), { width: 640, height: 480 });
  assertEquals(imageSize(new Uint8Array([1, 2, 3])), null);
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

Deno.test("design data: known values only, tooth by tooth, bare front teeth named", () => {
  const pieces = piecesFromScene({
    pieces: [
      ...SCENE.pieces,
      { toothId: "11", look: { color: "red" } },
      { toothId: "ignore all rules", size: { ss: 3 }, look: { shape: "<script>", material: "x", color: "#000000", effect: "iridescent" } },
      null,
    ],
  });
  assertEquals(pieces.length, 3);
  assertEquals(pieces[2], { id: "", toothId: "X0", shape: "round", material: "crystal", color: "#000000", iridescent: true, size: "SS3", longestMm: 0 });
  const data = buildDesignData(pieces);
  const lines = data.split("\n");
  assertEquals(lines[0], "DESIGN DATA — exactly 3 gems, no more.");
  // Upper arch in the photo's order: 13, 12 (the heart), 11 bare, 21 (the round), 22, 23.
  const upper = lines.indexOf("UPPER ARCH — teeth in the photo's left-to-right order:");
  assertEquals(lines.slice(upper + 1, upper + 9), [
    "Tooth 13 (upper right canine): no gem — it stays bare.",
    "Tooth 12 (upper right lateral incisor): 1 gem",
    "  1. heart — metal — colour #e8c25a — size 2 × 4 mm (about 4 mm on its longest side)",
    "Tooth 11 (upper right central incisor): no gem — it stays bare.",
    "Tooth 21 (upper left central incisor): 1 gem",
    "  2. round — crystal — colour #ffffff — size SS5 (about 1.8 mm on its longest side)",
    "Tooth 22 (upper left lateral incisor): no gem — it stays bare.",
    "Tooth 23 (upper left canine): no gem — it stays bare.",
  ]);
  // No gem on the lower arch: it is not listed at all.
  assertEquals(data.includes("LOWER ARCH"), false);
  assertStringIncludes(data, "  3. round — crystal — colour #000000 — iridescent coating — size SS3");
  assertEquals(toothLabel("36"), "36 (lower left first molar)");
  assertEquals(piecesFromScene({}), []);
});

Deno.test("design data with seats: place and share of the tooth, tongue-side gems left out", () => {
  const pieces = piecesFromScene(SCENE);
  const seats = readSeats(JSON.stringify([
    { id: "p1", gum: 0.24, mid: 0.17, width: 0.51, front: true },
    { id: "p2", gum: 0.5, mid: 0, width: 0.4, front: false },
    { id: "p3", gum: "x" },
  ]));
  assertEquals(seats.size, 2);
  const data = buildDesignData(pieces, seats);
  assertEquals(data.split("\n")[0], "DESIGN DATA — exactly 1 gem, no more.");
  assertStringIncludes(
    data,
    "  1. round — crystal — colour #ffffff — size SS5 (about 1.8 mm on its longest side) — longest side about 51% of this tooth's width — centre at about 24% of the crown height from the gum line (gum-side third), 17% of the tooth's width off-centre toward the midline",
  );
  assertStringIncludes(data, "Tooth 12 (upper right lateral incisor): no gem — it stays bare.");
  // Out-of-range numbers are clamped, malformed input ignored.
  assertEquals(readSeats(JSON.stringify([{ id: "a", gum: 9, mid: -3, width: 0, front: true }])).get("a"), { gum: 1, mid: -0.5, width: 0.02, front: true });
  assertEquals(readSeats("not json").size, 0);
  assertEquals(readSeats(null).size, 0);
});

Deno.test("prompt versions: v3 by default, both name the two images", () => {
  assertEquals(promptVersion(undefined), "v3");
  assertEquals(promptVersion(" V1 "), "v1");
  assertEquals(promptVersion("v2"), "v3");
  for (const prompt of [TRY_ON_SYSTEM_PROMPT_V1, TRY_ON_SYSTEM_PROMPT_V3]) {
    assertStringIncludes(prompt, "IMAGE 1");
    assertStringIncludes(prompt, "IMAGE 2");
  }
  assertStringIncludes(TRY_ON_SYSTEM_PROMPT_V3, "THE DESIGN DATA");
  assertStringIncludes(TRY_ON_SYSTEM_PROMPT_V3, "IMAGE 3 — THE FLAT DESIGN MAP");
});

const ADC = JSON.stringify({
  type: "authorized_user",
  client_id: "cid.apps.googleusercontent.com",
  client_secret: "csecret",
  refresh_token: "rtoken",
  quota_project_id: "global-toothgems",
});

Deno.test("ADC: an authorized_user file opens Vertex AI, its quota project by default", () => {
  assertEquals(readAdcJson(JSON.stringify({ type: "service_account" })), null);
  assertEquals(readAdcJson("not json"), null);
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const config = imageModelConfig(env({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x", GEMINI_API_KEY: "k" }));
  assertEquals(config?.kind, "vertex");
  assertEquals(
    generateUrl(config!),
    "https://aiplatform.googleapis.com/v1/projects/global-toothgems/locations/global/publishers/google/models/model-x:generateContent",
  );
  const regional = imageModelConfig(env({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x", GOOGLE_CLOUD_LOCATION: "europe-west1", GOOGLE_CLOUD_PROJECT: "other-proj" }));
  assertEquals(
    generateUrl(regional!),
    "https://europe-west1-aiplatform.googleapis.com/v1/projects/other-proj/locations/europe-west1/publishers/google/models/model-x:generateContent",
  );
  assertEquals(imageModelConfig(env({ GOOGLE_ADC_JSON: ADC })), null); // no model
});

Deno.test("ADC: the refresh token buys an access token, cached, sent with the quota project", async () => {
  resetTokenCache();
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fakeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3599 }), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), { status: 200 }),
    );
  }) as typeof fetch;
  const config = imageModelConfig((n) => ({ GOOGLE_ADC_JSON: ADC, GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])!;
  const out = await generateImage(config, "system", [{ mimeType: "image/png", data: "AA==" }], "DESIGN DATA", fakeFetch);
  assertEquals(out, { ok: true, image: { mimeType: "image/png", data: "QQ==" } });
  assertStringIncludes(seen[0].body, "grant_type=refresh_token");
  assertStringIncludes(seen[0].body, "refresh_token=rtoken");
  assertEquals(seen[1].headers.authorization, "Bearer ya29.token");
  assertEquals(seen[1].headers["x-goog-user-project"], "global-toothgems");
  const body = JSON.parse(seen[1].body);
  assertEquals(body.systemInstruction.parts[0].text, "system");
  assertEquals(body.contents[0].parts, [{ inlineData: { mimeType: "image/png", data: "AA==" } }, { text: "DESIGN DATA" }]);
  // Cached: a second render does not refresh again.
  await accessToken({ clientId: "cid.apps.googleusercontent.com", clientSecret: "csecret", refreshToken: "rtoken" }, fakeFetch);
  assertEquals(seen.filter((s) => s.url.includes("oauth2")).length, 1);
  resetTokenCache();
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

Deno.test("aspect ratio: the photo's proportions are asked for; a model refusing the option is asked again without it", async () => {
  assertEquals(nearestAspectRatio({ width: 896, height: 1195 }), "3:4");
  assertEquals(nearestAspectRatio({ width: 2048, height: 1152 }), "16:9");
  assertEquals(nearestAspectRatio({ width: 1000, height: 1000 }), "1:1");
  assertEquals(nearestAspectRatio(null), null);

  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = ((_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    bodies.push(body);
    if (body.generationConfig?.imageConfig) return Promise.resolve(new Response("unknown field imageConfig", { status: 400 }));
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ==" } }] } }] }), { status: 200 }));
  }) as typeof fetch;
  const config = imageModelConfig((n) => ({ GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "model-x" } as Record<string, string>)[n])!;
  const out = await generateImage(config, "system", [{ mimeType: "image/png", data: "AA==" }], null, fakeFetch, 1000, "3:4");
  assertEquals(out.ok, true);
  assertEquals(bodies.length, 2);
  assertEquals((bodies[0].generationConfig as Record<string, unknown>).imageConfig, { aspectRatio: "3:4" });
  assertEquals((bodies[1].generationConfig as Record<string, unknown>).imageConfig, undefined);
});

Deno.test("the render asks for the photo's proportions, read from its header", async () => {
  let asked: string | null = "none";
  const { deps } = fake({
    generate: (_images, _data, aspectRatio) => {
      asked = aspectRatio;
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
  });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xab, 0x03, 0x80, 0x03, 0, 0, 0, 0, 0, 0]);
  assertEquals((await handleStudioTryOn(post(form(undefined, new Blob([jpeg], { type: "image/jpeg" }))), deps)).status, 200);
  assertEquals(asked, "3:4");
});

/** The events of a `progress=1` answer, in order. */
async function events(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

const progressForm = () => {
  const data = form();
  data.set("progress", "1");
  return data;
};

Deno.test("progress: checking, rendering, then the result, as an event stream", async () => {
  const { deps, calls } = fake({ checkPhoto: () => Promise.resolve({ ok: true, value: GOOD_PHOTO }) });
  const res = await handleStudioTryOn(post(progressForm()), deps);
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "text/event-stream");
  assertEquals(await events(res), [
    { stage: "checking" },
    { stage: "rendering" },
    { result: { ok: true, image: { mime_type: "image/png", data: "aW1n" } } },
  ]);
  assertEquals(calls.finished, ["generated"]);
});

Deno.test("progress: a refused photo ends after the check; a failed render after rendering", async () => {
  const refused = fake({ checkPhoto: () => Promise.resolve({ ok: true, value: { ...GOOD_PHOTO, lighting: "too_dark" } }) });
  assertEquals(await events(await handleStudioTryOn(post(progressForm()), refused.deps)), [
    { stage: "checking" },
    { result: { ok: false, code: "photo_unsuitable", reasons: ["too_dark"] } },
  ]);
  assertEquals(refused.calls.images, []);
  const failed = fake({ generate: () => Promise.resolve({ ok: false, code: "blocked", detail: "SAFETY" }) });
  assertEquals(await events(await handleStudioTryOn(post(progressForm()), failed.deps)), [
    { stage: "checking" },
    { stage: "rendering" },
    { result: { ok: false, code: "blocked" } },
  ]);
  assertEquals(failed.calls.finished, ["failed:blocked"]);
});

Deno.test("progress: refusals before the check stay plain JSON with their status", async () => {
  const { deps } = fake({ countRecent: () => Promise.resolve({ requests: 9, renders: 9 }) });
  const res = await handleStudioTryOn(post(progressForm()), deps);
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { ok: false, code: "daily_limit" });
});

Deno.test("photo scale: the two central incisors give each gem's length in this photo", async () => {
  // Centrals 85/1000 of the width, 60/1000 high, on a 896 × 1195 portrait: plausible front teeth.
  const scale = photoScale({ central_incisors_box: [500, 460, 560, 545] }, { width: 896, height: 1195 })!;
  assertEquals(Math.round(scale * 100000) / 100000, 0.005);
  // Missing, too thin, too tall or not a box: no scale.
  assertEquals(photoScale({ central_incisors_box: [] }, null), null);
  assertEquals(photoScale({ central_incisors_box: [500, 460, 560, 470] }, null), null);
  assertEquals(photoScale({ central_incisors_box: [100, 460, 900, 545] }, { width: 896, height: 1195 }), null);
  assertEquals(photoScale({}, null), null);

  const data = buildDesignData(piecesFromScene(SCENE), new Map(), scale);
  assertStringIncludes(data, "SCALE MEASURED ON THIS PHOTO: the two upper central incisors together span about 8.5% of the photo's width");
  // The 4 mm heart: 4 × 0.5 % = 2 % of the width.
  assertStringIncludes(data, "heart — metal — colour #e8c25a — size 2 × 4 mm (about 4 mm on its longest side) — IN THIS PHOTO: about 2% of the photo's width");
  assertEquals(buildDesignData(piecesFromScene(SCENE)).includes("IN THIS PHOTO"), false);

  // The render receives it when the check measured it.
  let sent = "";
  const { deps } = fake({
    checkPhoto: () => Promise.resolve({ ok: true, value: { ...GOOD_PHOTO, central_incisors_box: [450, 450, 520, 550] } }),
    generate: (_images, designData) => {
      sent = designData;
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
  });
  assertEquals((await handleStudioTryOn(post(form()), deps)).status, 200);
  assertStringIncludes(sent, "SCALE MEASURED ON THIS PHOTO");
});

const withMap = () => {
  const data = form();
  data.set("map", new Blob([new Uint8Array([7, 8])], { type: "image/png" }), "map.png");
  data.set(
    "seats",
    JSON.stringify([
      { id: "p1", gum: 0.3, mid: 0.1, width: 0.5, front: true, tag: "21a" },
      { id: "p2", gum: 0.5, mid: 0, width: 0.6, front: true, tag: "11a" }, // names another tooth: not used
    ]),
  );
  return data;
};

Deno.test("flat map: IMAGE 3 after the photo, the gems named by their tags on it", async () => {
  const { deps, calls } = fake();
  assertEquals((await handleStudioTryOn(post(withMap()), deps)).status, 200);
  assertEquals(calls.images, ["image/png:BAU=", "image/jpeg:AQID", "image/png:Bwg=", "image/jpeg:cmVm"]);
  assertStringIncludes(calls.data, "IMAGE 3 (the flat design map) is included");
  assertStringIncludes(calls.data, "  21a. round — crystal");
  // A tag naming another tooth than the stored gem's is ignored: the gem keeps its number.
  assertStringIncludes(calls.data, "  1. heart — metal");
});

Deno.test("flat map: none sent, or prompt v1 — the request goes as before", async () => {
  const none = fake();
  assertEquals((await handleStudioTryOn(post(form()), none.deps)).status, 200);
  assertEquals(none.calls.images.length, 3);
  assertStringIncludes(none.calls.data, "No flat design map (IMAGE 3) with this request.");
  const v1 = fake({ readsMap: false });
  assertEquals((await handleStudioTryOn(post(withMap()), v1.deps)).status, 200);
  assertEquals(v1.calls.images, ["image/png:BAU=", "image/jpeg:AQID", "image/jpeg:cmVm"]);
  const bad = withMap();
  bad.set("map", new Blob([new Uint8Array([1])], { type: "image/gif" }), "map.gif");
  const dropped = fake();
  assertEquals((await handleStudioTryOn(post(bad), dropped.deps)).status, 200);
  assertEquals(dropped.calls.images.length, 3);
});

/* ------------------------------------------------------------ mouth crop */


Deno.test("mouthCrop: teeth and lips at a model proportion, inside the photo; none when useless", () => {
  const size = { width: 1536, height: 2048 };
  // The smile of the reported render: teeth across the middle of a tall face photo.
  const crop = mouthCrop([430, 240, 560, 810], size)!;
  const ratio = crop.width / crop.height;
  assertEquals(Math.abs(ratio - nearestRatio(ratio)) < 0.01, true);
  // The teeth are inside, with room around them.
  assertEquals(crop.x < 240 * 1.536 && crop.x + crop.width > 810 * 1.536, true);
  assertEquals(crop.y < 430 * 2.048 && crop.y + crop.height > 560 * 2.048, true);
  assertEquals(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= size.width && crop.y + crop.height <= size.height, true);
  // A close-up of the mouth already, a missing box or tiny teeth: the whole photo.
  assertEquals(mouthCrop([100, 50, 900, 950], size), null);
  assertEquals(mouthCrop([], size), null);
  assertEquals(mouthCrop([500, 500, 505, 520], size), null);
  assertEquals(mouthCrop([430, 240, 560, 810], null), null);
});

/** A real JPEG of this size (flat grey). */
function jpegOf(width: number, height: number): Blob {
  const data = new Uint8Array(width * height * 4).fill(128);
  return new Blob([new Uint8Array(jpegCodec.encode({ data, width, height }, 80).data)], { type: "image/jpeg" });
}

Deno.test("mouth crop: the model edits the close-up; the answer says where to paste it back", async () => {
  let aspect: string | null = null;
  const { deps, calls } = fake({
    checkPhoto: () => Promise.resolve({ ok: true, value: { ...GOOD_PHOTO, teeth_box: [430, 240, 560, 810], central_incisors_box: [430, 420, 560, 600] } }),
    generate: (images, data, ratio) => {
      calls.images = images.map((img) => `${img.mimeType}:${img.data}`);
      calls.data = data;
      aspect = ratio;
      return Promise.resolve({ ok: true, image: { mimeType: "image/png", data: "aW1n" } });
    },
  });
  const res = await handleStudioTryOn(post(form({ creation_id: CREATION }, jpegOf(768, 1024))), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  const crop = mouthCrop([430, 240, 560, 810], { width: 768, height: 1024 })!;
  assertEquals(body.crop, { ...crop, photo_width: 768, photo_height: 1024 });
  // IMAGE 2 is the crop, at its own size and proportions.
  const sent = Uint8Array.from(atob(calls.images[1].split(":")[1]), (c) => c.charCodeAt(0));
  assertEquals(imageSize(sent), { width: crop.width, height: crop.height });
  assertEquals(aspect, nearestAspectRatio({ width: crop.width, height: crop.height }));
  assertStringIncludes(calls.data, "IMAGE 2 is a CLOSE-UP of the customer's mouth");
});

Deno.test("mouth crop: off by secret, or not a JPEG — the whole photo, no crop in the answer", async () => {
  const check = () => Promise.resolve({ ok: true as const, value: { ...GOOD_PHOTO, teeth_box: [430, 240, 560, 810] } });
  const off = fake({ cropMouth: false, checkPhoto: check });
  const res = await handleStudioTryOn(post(form({ creation_id: CREATION }, jpegOf(768, 1024))), off.deps);
  assertEquals((await res.json()).crop, undefined);
  const png = fake({ checkPhoto: check });
  const res2 = await handleStudioTryOn(post(form({ creation_id: CREATION }, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }))), png.deps);
  assertEquals((await res2.json()).crop, undefined);
});
