import { describe, expect, it } from "vitest";
import { v3 } from "./math";
import { DesignStore } from "./store";

/** A new piece starts with the finish picked last (the store runs without browser storage here). */

const place = (store: DesignStore, typeId: string) => store.addJewel(typeId, "11", v3(0, 0, 0), v3(0, 0, 1));
const added = (store: DesignStore, id: string) => store.jewels.find((j) => j.id === id)!;

describe("last finish", () => {
  it("starts from the type's own finish until a colour is picked", () => {
    const store = new DesignStore();
    expect(added(store, place(store, "shape-heart")).color).toBe("ruby");
  });

  it("gives the next pieces the last finish picked", () => {
    const store = new DesignStore();
    place(store, "crystal-round");
    store.paintSelected({ color: "emerald", customColor: undefined });
    const next = added(store, place(store, "shape-heart"));
    expect(next.color).toBe("emerald");
    expect(next.customColor).toBeUndefined();
  });

  it("remembers a custom colour, and drops it when cleared", () => {
    const store = new DesignStore();
    place(store, "crystal-round");
    store.paintSelected({ customColor: "#12ab34" });
    expect(added(store, place(store, "crystal-grand")).customColor).toBe("#12ab34");
    store.paintSelected({ customColor: undefined });
    expect(added(store, place(store, "crystal-grand")).customColor).toBeUndefined();
  });

  it("keeps metal pieces in their metal", () => {
    const store = new DesignStore();
    place(store, "crystal-round");
    store.paintSelected({ color: "sapphire", customColor: undefined });
    expect(added(store, place(store, "metal-gold-dot")).color).toBe("gold");
  });
});
