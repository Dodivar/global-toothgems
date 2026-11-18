import { describe, expect, it } from "vitest";
import { archNeighbour, GROUP_COPY_GAP, groupBox, groupDuplicateMoves } from "./groupDuplicate";

// Two blue gems either side of a crystal, as on a central incisor.
const ROW = [
  { along: -2.6, up: 0, reach: 1 },
  { along: 0, up: 0, reach: 1.3 },
  { along: 2.6, up: 0, reach: 1 },
];
const COLUMN = ROW.map((p) => ({ along: p.up, up: p.along, reach: p.reach }));
const ROOM = { alongRoom: 1, upRoom: 1 } as const;

describe("groupBox", () => {
  it("bounds the pieces' outlines, not only their centres", () => {
    expect(groupBox(ROW)).toEqual({ minAlong: -3.6, maxAlong: 3.6, minUp: -1.3, maxUp: 1.3 });
  });
  it("is empty for no piece", () => {
    expect(groupBox([])).toEqual({ minAlong: 0, maxAlong: 0, minUp: 0, maxUp: 0 });
  });
});

describe("archNeighbour", () => {
  it("walks along the arch, across the midline", () => {
    expect(archNeighbour("11", 1)).toBe("21");
    expect(archNeighbour("21", -1)).toBe("11");
    expect(archNeighbour("41", 1)).toBe("31");
    expect(archNeighbour("21", 2)).toBe("23");
  });
  it("stops at the arch's end and off the arches", () => {
    expect(archNeighbour("17", -1)).toBeNull();
    expect(archNeighbour("37", 1)).toBeNull();
    expect(archNeighbour("tooth-3", 1)).toBeNull();
  });
});

describe("groupDuplicateMoves", () => {
  it("repeats a row on the next crown first, toward the midline", () => {
    const moves = groupDuplicateMoves("11", groupBox(ROW), ROOM);
    expect(moves.slice(0, 2)).toEqual([
      { kind: "tooth", toothId: "21" },
      { kind: "tooth", toothId: "12" },
    ]);
    const left = groupDuplicateMoves("22", groupBox(ROW), ROOM);
    expect(left[0]).toEqual({ kind: "tooth", toothId: "21" });
  });

  it("then carries a row on beside itself, then sets it above or below", () => {
    const moves = groupDuplicateMoves("11", groupBox(ROW), { alongRoom: -1, upRoom: 1 });
    const width = 7.2 + GROUP_COPY_GAP;
    const height = 2.6 + GROUP_COPY_GAP;
    const shifts = moves.filter((m) => m.kind === "shift");
    expect(shifts).toHaveLength(4);
    expect(shifts[0]).toEqual({ kind: "shift", along: -width, up: 0 });
    expect(shifts[1]).toEqual({ kind: "shift", along: width, up: 0 });
    expect(shifts[2]).toEqual({ kind: "shift", along: 0, up: height });
    expect(shifts[3]).toEqual({ kind: "shift", along: 0, up: -height });
  });

  it("carries a column on above or below itself before setting it beside", () => {
    const shifts = groupDuplicateMoves("11", groupBox(COLUMN), { alongRoom: 1, upRoom: -1 }).filter((m) => m.kind === "shift");
    expect(shifts[0]).toEqual({ kind: "shift", along: 0, up: -(7.2 + GROUP_COPY_GAP) });
    expect(shifts[2]).toEqual({ kind: "shift", along: 2.6 + GROUP_COPY_GAP, up: 0 });
  });

  it("tries crowns farther away last, and only those that exist", () => {
    const moves = groupDuplicateMoves("16", groupBox(ROW), ROOM);
    const crowns = moves.filter((m) => m.kind === "tooth").map((m) => (m.kind === "tooth" ? m.toothId : ""));
    // 16 is one from the arch's end: no crown two or three places behind it.
    expect(crowns).toEqual(["15", "17", "14", "13"]);
    expect(moves[moves.length - 1]).toEqual({ kind: "tooth", toothId: "13" });
  });

  it("keeps to the same crown on a tooth off the arches", () => {
    const moves = groupDuplicateMoves("tooth-3", groupBox(ROW), ROOM);
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.kind === "shift")).toBe(true);
  });
});
