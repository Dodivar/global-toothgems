import { useEffect, useRef, useState } from "react";

/**
 * Geometry shared by the charts on the Statistics screen.
 *
 * The charts are hand-drawn SVG rather than a charting dependency. Three
 * reasons, in order: the design system's marks (2px lines, 10% area washes,
 * hairline grids, 2px surface rings) are the whole visual argument and would
 * have to be fought back into a library; the prototype ships nine small charts,
 * none of them exotic; and a chart library is a permanent dependency decision
 * that `AGENTS.md` asks be made deliberately, not smuggled in with a mockup.
 */

/** Measures a container so the SVG can be drawn at real pixel geometry. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/**
 * Tick spacings a human would have chosen, densest first.
 *
 * Every entry also survives being written in compact notation at one decimal:
 * 1.25 is excluded because "1,3 k €" on a gridline at 1 250 is a rounded lie.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * Picks the axis maximum from the tick spacing rather than the other way round.
 *
 * Ticks that read 0 / 600 / 1 200 / 1 800 are read; ticks that read 833,3 /
 * 1 666,7 are decoded. Rounding the *maximum* first is what produces the second
 * kind, so the step is chosen from a small set and the maximum follows from it —
 * which also keeps the headroom above the curve small.
 */
export function axisScale(rawMax: number, segments = 4): { max: number; ticks: number[] } {
  if (rawMax <= 0) return { max: 1, ticks: [0, 1] };
  const rough = rawMax / segments;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (NICE_STEPS.find((candidate) => candidate >= normalised - 1e-9) ?? 10) * magnitude;
  return {
    max: step * segments,
    ticks: Array.from({ length: segments + 1 }, (_, i) => step * i),
  };
}

export interface Plot {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  max: number;
  /** Baseline, in user units. */
  zeroY: number;
  x: (index: number) => number;
  y: (value: number) => number;
}

export function createPlot(
  width: number,
  height: number,
  count: number,
  max: number,
  padding: Plot["padding"],
): Plot {
  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);
  const span = Math.max(1, count - 1);
  return {
    width,
    height,
    padding,
    max,
    zeroY: padding.top + innerHeight,
    x: (index) => padding.left + (index / span) * innerWidth,
    y: (value) => padding.top + innerHeight - (Math.max(0, value) / max) * innerHeight,
  };
}

/** Polyline through the values. Straight segments: a spline invents readings. */
export function linePath(values: number[], plot: Plot): string {
  return values.map((value, i) => `${i === 0 ? "M" : "L"}${plot.x(i).toFixed(2)},${plot.y(value).toFixed(2)}`).join(" ");
}

/** The same line, closed onto the baseline, for the area wash. */
export function areaPath(values: number[], plot: Plot): string {
  if (values.length === 0) return "";
  const last = values.length - 1;
  return `${linePath(values, plot)} L${plot.x(last).toFixed(2)},${plot.zeroY.toFixed(2)} L${plot.x(0).toFixed(2)},${plot.zeroY.toFixed(2)} Z`;
}

/**
 * Which x labels survive at this width.
 *
 * Thirty daily ticks do not fit on a laptop and certainly not on a phone, and
 * rotating them to make them fit trades one unreadable axis for another. The
 * first and last are always kept: they are what say which window you are
 * looking at.
 */
export function labelIndices(count: number, width: number): number[] {
  const perLabel = 78;
  const room = Math.max(2, Math.floor(width / perLabel));
  if (count <= room) return Array.from({ length: count }, (_, i) => i);
  const stride = Math.ceil((count - 1) / (room - 1));
  const kept: number[] = [];
  for (let i = 0; i < count; i += stride) kept.push(i);
  if (kept[kept.length - 1] !== count - 1) {
    // Drop the penultimate rather than let the last two labels collide.
    if (count - 1 - kept[kept.length - 1] < stride / 2) kept.pop();
    kept.push(count - 1);
  }
  return kept;
}
