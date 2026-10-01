import { describe, expect, it } from "vitest";
import {
  FAVORITES_HREF,
  PENDING_FAVORITE_TTL_MS,
  clearPendingFavorite,
  favoriteKey,
  isFavoritesView,
  rememberPendingFavorite,
  takePendingFavorite,
  withFavoritesView,
  type KeyValueStore,
} from "./favoritesState";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("favourites view in the shop URL", () => {
  it("is read from the `favoris` parameter", () => {
    expect(isFavoritesView(new URLSearchParams("favoris=1"))).toBe(true);
    expect(isFavoritesView(new URLSearchParams("favoris=0"))).toBe(false);
    expect(isFavoritesView(new URLSearchParams(""))).toBe(false);
    expect(isFavoritesView(new URLSearchParams(FAVORITES_HREF.split("?")[1]))).toBe(true);
  });

  it("keeps the other filters and drops the page when toggled", () => {
    const on = withFavoritesView(new URLSearchParams("categorie=gems&tri=priceAsc&page=3"), true);
    expect(on.get("favoris")).toBe("1");
    expect(on.get("categorie")).toBe("gems");
    expect(on.get("tri")).toBe("priceAsc");
    expect(on.has("page")).toBe(false);
    const off = withFavoritesView(on, false);
    expect(off.has("favoris")).toBe(false);
    expect(off.get("categorie")).toBe("gems");
  });
});

describe("favoriteKey", () => {
  it("uses the database id for database products and the slug for mock ones", () => {
    expect(favoriteKey({ id: "etoile", dbId: "uuid-1" }, "supabase")).toBe("uuid-1");
    expect(favoriteKey({ id: "etoile" }, "supabase")).toBeNull();
    expect(favoriteKey({ id: "etoile", dbId: "uuid-1" }, "mock")).toBe("etoile");
  });
});

describe("pending favourite", () => {
  it("is returned once, then forgotten", () => {
    const store = memoryStore();
    rememberPendingFavorite(store, "aurora-heart", 1000);
    expect(takePendingFavorite(store, 2000)).toBe("aurora-heart");
    expect(takePendingFavorite(store, 2000)).toBeNull();
  });

  it("is forgotten when the visitor dismisses the dialog", () => {
    const store = memoryStore();
    rememberPendingFavorite(store, "aurora-heart", 1000);
    clearPendingFavorite(store);
    expect(takePendingFavorite(store, 1000)).toBeNull();
  });

  it("expires, and an expired intent is cleared too", () => {
    const store = memoryStore();
    rememberPendingFavorite(store, "aurora-heart", 0);
    expect(takePendingFavorite(store, PENDING_FAVORITE_TTL_MS + 1)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("ignores malformed or future-dated values", () => {
    const store = memoryStore();
    store.setItem("gt.pendingFavorite", "not json");
    expect(takePendingFavorite(store, 0)).toBeNull();
    store.setItem("gt.pendingFavorite", JSON.stringify({ productId: 42, at: 0 }));
    expect(takePendingFavorite(store, 0)).toBeNull();
    store.setItem("gt.pendingFavorite", JSON.stringify({ productId: "x", at: 5000 }));
    expect(takePendingFavorite(store, 0)).toBeNull();
  });

  it("survives storage that throws or is missing", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(() => rememberPendingFavorite(broken, "x", 0)).not.toThrow();
    expect(takePendingFavorite(broken, 0)).toBeNull();
    expect(takePendingFavorite(null, 0)).toBeNull();
  });
});
