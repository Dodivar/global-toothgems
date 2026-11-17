import { describe, expect, it } from "vitest";
import { homeBandSettled, homeShortcuts, type HomeShortcutInput } from "./memberHome";

const none: HomeShortcutInput = { onTheirWay: [], resume: null, rewardReady: false, favorites: 0 };

describe("home shortcuts for a signed-in member", () => {
  it("offers the member space when there is nothing under way", () => {
    expect(homeShortcuts(none)).toEqual([{ kind: "space", to: "/compte" }]);
  });

  it("puts a parcel first, then the course, then the reward", () => {
    const list = homeShortcuts({
      onTheirWay: [{ reference: "GT-1042", status: "shipped" }],
      resume: { courseId: "fondation", title: "Pose", pct: 40, nextKey: "m2" },
      rewardReady: true,
      favorites: 5,
    });
    expect(list.map((s) => s.kind)).toEqual(["order", "course", "reward"]);
    expect(list[0]).toMatchObject({ to: "/compte/commandes/GT-1042", shipped: true });
    expect(list[1]).toMatchObject({ to: "/academy/mes-formations/fondation/lecon/m2", pct: 40 });
  });

  it("resumes the course overview when no lesson is next, and lists favourites", () => {
    const list = homeShortcuts({ ...none, resume: { courseId: "fondation", title: "Pose", pct: 0, nextKey: null }, favorites: 2 });
    expect(list).toEqual([
      { kind: "course", to: "/academy/mes-formations/fondation", title: "Pose", pct: 0 },
      { kind: "favorites", to: "/boutique?favoris=1", count: 2 },
    ]);
  });

  it("says when a parcel is still being prepared", () => {
    expect(homeShortcuts({ ...none, onTheirWay: [{ reference: "GT-7", status: "processing" }] })[0]).toMatchObject({ kind: "order", shipped: false });
  });
});

describe("the home band waits for every store", () => {
  const all = { orders: "ready", learning: "ready", loyalty: "ready", favorites: "ready" };
  it("appears once each has answered, an error included", () => {
    expect(homeBandSettled(all)).toBe(true);
    expect(homeBandSettled({ ...all, learning: "error", favorites: "error", orders: "error", loyalty: "error" })).toBe(true);
  });

  it("waits for a store still loading, and for courses not yet asked", () => {
    expect(homeBandSettled({ ...all, orders: "loading" })).toBe(false);
    expect(homeBandSettled({ ...all, loyalty: "loading" })).toBe(false);
    expect(homeBandSettled({ ...all, learning: "idle" })).toBe(false);
    expect(homeBandSettled({ ...all, favorites: "loading" })).toBe(false);
  });

  it("does not wait for loyalty without Supabase (idle)", () => {
    expect(homeBandSettled({ ...all, loyalty: "idle" })).toBe(true);
  });
});
