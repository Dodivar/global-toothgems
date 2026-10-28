import type { TryOnStage } from "./tryOn";

/**
 * The waiting screen of the AI try-on: an indicative progress bar and a line
 * saying what the service is busy with. The function only reports which
 * stage it is at (the photo check, then the render), not how far along it
 * is, so the bar is paced on the usual durations: it moves fast at first,
 * slows down and never reaches the end before the result is there (the
 * dialog then leaves this screen). Nothing here claims an exact figure: the
 * bar has no percentage, and the lines follow the stage's real order.
 */

interface StagePace {
  /** Where the bar stands when the stage starts, in % of the whole wait. */
  from: number;
  /** What it creeps towards without ever reaching it. */
  to: number;
  /** Time constant of the approach (ms): about two thirds of the way after `tau`. */
  tau: number;
  /** How long each line stays on screen (ms). */
  every: number;
  /** How many lines the stage has in the locale files. */
  lines: number;
}

export const TRY_ON_PACE: Record<TryOnStage, StagePace> = {
  checking: { from: 3, to: 30, tau: 4_000, every: 2_200, lines: 4 },
  rendering: { from: 32, to: 95, tau: 20_000, every: 4_000, lines: 6 },
};

/** The bar's position (0–100) `elapsed` ms into `stage`. */
export function tryOnProgress(stage: TryOnStage, elapsed: number): number {
  const { from, to, tau } = TRY_ON_PACE[stage];
  const t = Math.max(0, elapsed);
  return from + (to - from) * (1 - Math.exp(-t / tau));
}

/** Which line of `stage` to show `elapsed` ms in: one after the other, then the last one stays. */
export function tryOnLine(stage: TryOnStage, elapsed: number): number {
  const { every, lines } = TRY_ON_PACE[stage];
  return Math.min(lines - 1, Math.floor(Math.max(0, elapsed) / every));
}
