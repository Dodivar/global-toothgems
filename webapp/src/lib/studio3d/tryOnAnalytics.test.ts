import { describe, expect, it } from "vitest";
import { midlineProps, placementProps, resultProps } from "./tryOnAnalytics";
import type { MidlineArbitration } from "./tryOnMidline";
import type { Registration } from "./tryOnRegistration";

const registration: Registration = {
  transform: { scale: 20, angle: 1, tx: 0, ty: 0 },
  lowerOffset: 6.5,
  renumbered: { upper: 1, lower: 0 },
  midlineError: 0.12,
  teeth: [
    { fdi: "11", lower: false, x: 0, y: 0, width: 1, height: 1, source: "found", residual: 0.1 },
    { fdi: "21", lower: false, x: 0, y: 0, width: 1, height: 1, source: "found", residual: 0.1 },
    { fdi: "12", lower: false, x: 0, y: 0, width: 1, height: 1, source: "outlier", residual: 0.9 },
    { fdi: "13", lower: false, x: 0, y: 0, width: 1, height: 1, source: "fitted", residual: null },
  ],
  gems: [
    { id: "a", number: 1, toothId: "11", shape: "round", x: 0, y: 0, r: 5, stretch: [1, 1], rotation: 0, tooth: "found" },
    { id: "b", number: 2, toothId: "13", shape: "round", x: 0, y: 0, r: 5, stretch: [1, 1], rotation: 0, tooth: "fitted" },
    { id: "c", number: 3, toothId: "21", shape: "round", x: 0, y: 0, r: 5, stretch: [1, 1], rotation: 0, tooth: "hidden" },
  ],
  skipped: 1,
  rms: 0.1,
  confidence: 0.8,
  reliable: true,
  issues: ["outliers", "renumbered"],
};

describe("try-on analytics", () => {
  it("describes the placement with counts and codes only", () => {
    expect(placementProps(registration, { marks: 1, leftOut: 2 }, true)).toEqual({
      teeth_found: 3,
      teeth_kept: 2,
      teeth_set_aside: 1,
      centrals_box: true,
      confidence: 0.8,
      reliable: true,
      issues: ["outliers", "renumbered"],
      rms: 0.1,
      lower_offset_mm: 6.5,
      renumbered_upper: 1,
      renumbered_lower: 0,
      midline_error: 0.12,
      gems_placed: 3,
      gems_hidden: 1,
      gems_on_fitted_teeth: 1,
      gems_skipped: 1,
      marks: 1,
      left_out: 2,
    });
  });

  it("sums up how the AI kept the marks", () => {
    const props = resultProps(
      [
        { id: "a", found: true, drift: 0.1, size: 1.1 },
        { id: "b", found: true, drift: 0.9, size: 1.5, reseated: true },
        { id: "c", found: false, drift: null, size: null },
      ],
      true,
    );
    expect(props).toEqual({
      masked: true,
      gems_checked: 3,
      gems_drawn: 2,
      gems_missing: 1,
      gems_drifted: 1,
      gems_resized: 1,
      gems_reseated: 1,
      drift_mean: 0.5,
      drift_max: 0.9,
      size_mean: 1.3,
      size_max: 1.5,
    });
    expect(resultProps(null, false)).toMatchObject({ masked: false, gems_checked: 0, gems_missing: 0, drift_max: null });
  });

  it("describes the pixel midline with offsets and codes only", () => {
    const arbitration: MidlineArbitration = {
      triggered: true,
      midline: 412,
      teethOffset: 0.99,
      centralsOffset: 0.09,
      corrections: ["shifted"],
      snapped: 9,
      segmented: { upper: 6, lower: 5 },
      lowerMidline: 420,
      found: [],
      centrals: null,
    };
    const props = midlineProps(arbitration, false, registration);
    expect(props).toEqual({
      arbiter: "measured",
      arbiter_triggered: true,
      arbiter_gap_found: true,
      arbiter_teeth_offset: 0.99,
      arbiter_centrals_offset: 0.09,
      arbiter_corrections: ["shifted"],
      arbiter_snapped: 9,
      arbiter_segmented_upper: 6,
      arbiter_segmented_lower: 5,
      arbiter_would_be_reliable: true, // renamed, its midline 0.12 from the gap
      arbiter_would_midline_error: 0.12,
    });
    expect(Object.values(props)).not.toContain(412); // never a position on the photo
    expect(Object.values(props)).not.toContain(420);
    expect(midlineProps(null, false, null)).toMatchObject({ arbiter: "unreadable", arbiter_triggered: false, arbiter_would_be_reliable: null });
    expect(midlineProps(arbitration, true, null)).toMatchObject({ arbiter: "applied", arbiter_would_be_reliable: null });
  });
});
