/**
 * Splits items into `columns` columns for a masonry layout: each item goes,
 * in order, to the column that is currently the shortest by the estimated
 * heights (ties to the leftmost), so the newest items stay at the top and
 * the columns end at about the same height.
 *
 * Used instead of CSS multi-column layout, which iOS Safari paints badly when
 * the items are animated (pins of the later columns missing or jumping as
 * their images load).
 */
export function distributeMasonry<T>(items: readonly T[], columns: number, estimate: (item: T) => number): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const result: T[][] = Array.from({ length: count }, () => []);
  const heights: number[] = new Array(count).fill(0);
  for (const item of items) {
    let target = 0;
    for (let c = 1; c < count; c += 1) if (heights[c] < heights[target]) target = c;
    result[target].push(item);
    heights[target] += Math.max(0, estimate(item));
  }
  return result;
}
