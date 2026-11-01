/**
 * `value` when it is one of `allowed`, else `fallback`: narrows an untrusted
 * string (URL parameter, database row, JSON) to a known union.
 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
