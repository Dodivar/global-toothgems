const displayNames = new Map<string, Intl.DisplayNames>();

/**
 * A country's name in a UI language (`fr`, `en-IE`…) from its ISO code — from
 * the platform, not a hand-kept list — else the code itself.
 */
export function countryName(code: string, lang: string): string {
  const key = lang.slice(0, 2);
  try {
    let names = displayNames.get(key);
    if (!names) {
      names = new Intl.DisplayNames([key], { type: "region" });
      displayNames.set(key, names);
    }
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
