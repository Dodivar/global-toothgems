import { describe, expect, it } from "vitest";
import { mirroredRotation, opposingTooth } from "./mirror";

describe("mirroredRotation", () => {
  it("turns r into −r across the midline, as before", () => {
    expect(mirroredRotation(0, "h")).toBe(0);
    expect(mirroredRotation(90, "h")).toBe(270);
    expect(mirroredRotation(270, "h")).toBe(90);
  });

  it("points an upright piece down across the bite", () => {
    expect(mirroredRotation(0, "v")).toBe(180);
    expect(mirroredRotation(180, "v")).toBe(0);
    expect(mirroredRotation(90, "v")).toBe(90);
    expect(mirroredRotation(30, "v")).toBe(150);
  });

  it("gives back the start when applied twice, on either axis", () => {
    for (const r of [0, 17, 90, 181, 359]) {
      expect(mirroredRotation(mirroredRotation(r, "h"), "h")).toBe(r);
      expect(mirroredRotation(mirroredRotation(r, "v"), "v")).toBe(r);
    }
  });

  it("stays within 0–359 for turns outside that range", () => {
    expect(mirroredRotation(720, "h")).toBe(0);
    expect(mirroredRotation(-90, "v")).toBe(270);
  });
});

describe("opposingTooth", () => {
  it("pairs each tooth with its counterpart on the other arch", () => {
    expect(opposingTooth("11")).toBe("41");
    expect(opposingTooth("41")).toBe("11");
    expect(opposingTooth("23")).toBe("33");
    expect(opposingTooth("36")).toBe("26");
  });

  it("leaves an id outside the four quadrants unchanged", () => {
    expect(opposingTooth("free")).toBe("free");
  });
});
