import { describe, expect, it } from "vitest";
import { activityEvents } from "./studioActivityAnalytics";

const base = {
  jewels: [] as unknown[],
  groups: [] as unknown[],
  active: null,
  modelMode: "dentition",
  lightPreset: "studio",
  lasso: false,
  multiSelect: false,
  clientName: "",
  canRedo: false,
} as unknown as Parameters<typeof activityEvents>[0];

describe("activityEvents", () => {
  it("counts a new design when gems land on an empty, unsaved scene", () => {
    const after = { ...base, jewels: [{}] } as typeof base;
    expect(activityEvents(base, after)).toEqual([{ kind: "feature", feature: "place_gem" }, { kind: "design_created" }]);
  });

  it("does not count opening a saved design as creating one", () => {
    const after = { ...base, jewels: [{}, {}], active: { creationId: "c1" } } as unknown as typeof base;
    expect(activityEvents(base, after)).toEqual([{ kind: "feature", feature: "place_gem" }]);
  });

  it("names the features used", () => {
    const after = { ...base, modelMode: "teeth", lightPreset: "lamp", lasso: true, clientName: "Léa", canRedo: true } as unknown as typeof base;
    expect(activityEvents(base, after).map((e) => e.feature)).toEqual(["model", "lighting", "lasso", "client_name", "undo"]);
  });

  it("says nothing when nothing changed", () => {
    expect(activityEvents(base, { ...base })).toEqual([]);
  });
});
