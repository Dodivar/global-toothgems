import type { GemCheck } from "./tryOnGemBlend";
import type { Registration } from "./tryOnRegistration";

/**
 * The try-on's analytics properties (2026-11-04): what the placement and the
 * render did, as facts — counts, scores, issue codes — so the thresholds of
 * `tryOnRegistration.ts` and `tryOnGemBlend.ts` can be tuned on real use.
 * Never the photo, the image, the design or anything personal. Sent by
 * `trackStudio()` (with the visitor's analytics consent only); the events are
 * listed in `docs/studio-trial-analytics.md`.
 */

type Props = Record<string, string | number | boolean | null | string[]>;

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/** `studio_try_on_placement`: the teeth found, the fit, and the gems placed, drawn and left out. */
export function placementProps(registration: Registration, drawn: { marks: number; leftOut: number }, centrals: boolean): Props {
  const count = (source: string) => registration.teeth.filter((t) => t.source === source).length;
  const gems = (tooth: string) => registration.gems.filter((g) => g.tooth === tooth).length;
  return {
    teeth_found: count("found") + count("outlier"),
    teeth_kept: count("found"),
    teeth_set_aside: count("outlier"),
    centrals_box: centrals,
    confidence: registration.confidence,
    reliable: registration.reliable,
    issues: [...registration.issues],
    rms: registration.rms,
    lower_offset_mm: registration.lowerOffset,
    renumbered_upper: registration.renumbered.upper,
    renumbered_lower: registration.renumbered.lower,
    midline_error: registration.midlineError,
    gems_placed: registration.gems.length,
    gems_hidden: gems("hidden"),
    gems_on_fitted_teeth: gems("fitted"),
    gems_skipped: registration.skipped,
    marks: drawn.marks,
    left_out: drawn.leftOut,
  };
}

/** A gem drawn this far from its mark (half-sizes), or this much larger or smaller, counts as moved or resized. */
const DRIFTED = 0.5;
const RESIZED = 0.3;

/** `studio_try_on_result`: how the AI kept the marks — gems drawn, how far and how large — and how it was pasted back. */
export function resultProps(checks: readonly GemCheck[] | null, masked: boolean): Props {
  const found = (checks ?? []).filter((c) => c.found);
  const drifts = found.map((c) => c.drift ?? 0);
  const sizes = found.map((c) => c.size ?? 1);
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    masked,
    gems_checked: checks?.length ?? 0,
    gems_drawn: found.length,
    gems_missing: checks ? checks.length - found.length : 0,
    gems_drifted: drifts.filter((d) => d > DRIFTED).length,
    gems_resized: sizes.filter((s) => Math.abs(s - 1) > RESIZED).length,
    drift_mean: mean(drifts),
    drift_max: drifts.length ? round(Math.max(...drifts)) : null,
    size_mean: mean(sizes),
    size_max: sizes.length ? round(Math.max(...sizes)) : null,
  };
}
