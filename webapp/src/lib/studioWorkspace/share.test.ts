import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import { DesignStore } from "../studio3d/store";
import { createScene } from "./scene";
import { decodeSharedDesign, encodeSharedDesign, SHARE_JSON_MAX_BYTES, SHARE_TOKEN_MAX_CHARS } from "./share";

const piece = (over: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id: "a",
  jewelryTypeId: "crystal-round",
  toothId: "11",
  position: { x: -4.123456789, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 12.5,
  scale: 0.95,
  color: "clear",
  ...over,
});

const scene = createScene({
  pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 }, customColor: "#ff00aa" })],
  groups: [{ id: "g1", gemGroupId: "grp", name: "Pair", pieceIds: ["a", "b"] }],
  lightPreset: "lamp",
  camera: { position: [0, 9, 66], target: [0, 0.5, -6] },
});

const bytesToB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64url = (text: string) => bytesToB64url(new TextEncoder().encode(text));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share links", () => {
  it("round-trips a design through the compressed fragment", async () => {
    const token = await encodeSharedDesign({ name: "  Crystal Smile ", description: "Two crystals", scene });
    expect(token.startsWith("z1.")).toBe(true);
    expect(token).toMatch(/^z1\.[A-Za-z0-9_-]+$/);
    const back = await decodeSharedDesign(`#${token}`);
    expect(back?.name).toBe("Crystal Smile");
    expect(back?.description).toBe("Two crystals");
    expect(back?.scene.lightPreset).toBe("lamp");
    expect(back?.scene.camera).toEqual(scene.camera);
    expect(back?.scene.groups).toEqual([{ id: "g1", gemGroupId: null, name: "Pair", pieceIds: ["a", "b"] }]);
    expect(back?.scene.pieces.map((p) => p.id)).toEqual(["a", "b"]);
    expect(back?.scene.pieces[1].customColor).toBe("#ff00aa");
    // Rounded to a ten-thousandth of a millimetre to keep the link short.
    expect(back?.scene.pieces[0].position.x).toBe(-4.1235);
  });

  it("falls back to plain JSON where CompressionStream is missing", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeSharedDesign({ name: "Plain", description: "", scene });
    expect(token.startsWith("j1.")).toBe(true);
    vi.unstubAllGlobals();
    expect((await decodeSharedDesign(token))?.name).toBe("Plain");
  });

  it("carries only what the viewer needs", async () => {
    const withExtras = { ...scene, ownerId: "user-123", clientName: "Jane Doe" } as unknown as typeof scene;
    // The plain form, so the link's own bytes can be read back.
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeSharedDesign({ name: "N", description: "", scene: withExtras });
    const raw = new TextDecoder().decode(Uint8Array.from(atob(token.slice(3).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    expect(raw).toContain('"pieces"');
    for (const secret of ["user-123", "Jane Doe", "ownerId", "clientName", "grp"]) expect(raw).not.toContain(secret);
  });

  it("refuses empty, unknown, truncated or tampered links", async () => {
    const token = await encodeSharedDesign({ name: "N", description: "", scene });
    expect(await decodeSharedDesign("")).toBeNull();
    expect(await decodeSharedDesign("#")).toBeNull();
    expect(await decodeSharedDesign("x1.abc")).toBeNull();
    expect(await decodeSharedDesign(token.slice(0, token.length - 12))).toBeNull();
    expect(await decodeSharedDesign("z1.not*base64")).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url("{not json")}`)).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url(JSON.stringify({ v: 2, name: "N", scene }))}`)).toBeNull();
    expect(await decodeSharedDesign(`j1.${b64url(JSON.stringify({ v: 1, name: "N", scene: { ...scene, version: 9 } }))}`)).toBeNull();
  });

  it("sanitizes what a hand-made link carries", async () => {
    const forged = {
      v: 1,
      name: "x".repeat(500),
      description: 42,
      scene: {
        version: 1,
        model: "evil",
        lightPreset: "lamp",
        camera: { position: [0, "a", 1], target: [0, 0, 0] },
        pieces: [piece(), { id: "bad", jewelryTypeId: "no-such-piece", toothId: "11", position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } }],
        groups: [],
      },
    };
    const back = await decodeSharedDesign(`j1.${b64url(JSON.stringify(forged))}`);
    expect(back?.name.length).toBe(60);
    expect(back?.description).toBe("");
    expect(back?.scene.model).toBe("studio");
    expect(back?.scene.camera).toBeNull();
    expect(back?.scene.pieces.map((p) => p.id)).toEqual(["a"]);
  });

  it("refuses oversized links, before and after decompression", async () => {
    expect(await decodeSharedDesign(`j1.${"A".repeat(SHARE_TOKEN_MAX_CHARS)}`)).toBeNull();
    // A small link that inflates past the cap (a "zip bomb") is stopped while inflating.
    const huge = new TextEncoder().encode(JSON.stringify({ v: 1, name: "N", description: " ".repeat(SHARE_JSON_MAX_BYTES), scene }));
    const stream = new Blob([huge]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    const token = `z1.${bytesToB64url(packed)}`;
    expect(token.length).toBeLessThan(SHARE_TOKEN_MAX_CHARS);
    expect(await decodeSharedDesign(token)).toBeNull();
  });
});

describe("a store for viewing only", () => {
  it("never reads nor writes the browser's draft", () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem, removeItem: vi.fn() });
    vi.useFakeTimers();
    try {
      const store = new DesignStore({ persist: false });
      store.loadScene(scene, null);
      store.saveNow();
      vi.runAllTimers();
      expect(store.jewels).toHaveLength(2);
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
