/** The query string of a page's `searchParams` (`?a=1&b=2`, or "" without one), in their order. */
export function searchOf(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(name, item);
  }
  return query.size > 0 ? `?${query}` : "";
}
