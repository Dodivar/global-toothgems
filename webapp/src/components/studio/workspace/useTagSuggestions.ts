import { useMemo } from "react";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";

/** Tags offered to every account, after its own. */
const STARTER_TAGS = ["Minimal", "Symmetrical", "Butterfly", "Crystal", "Gold", "Pink", "Stars", "Classic"];

/** Tags already used in the library, most frequent first, then the starters. */
export function useTagSuggestions(): string[] {
  const { creations, groups } = useWorkspace();
  return useMemo(() => {
    const counts = new Map<string, { tag: string; n: number }>();
    for (const r of [...creations, ...groups]) {
      for (const tag of r.tags) {
        const key = tag.toLocaleLowerCase();
        counts.set(key, { tag, n: (counts.get(key)?.n ?? 0) + 1 });
      }
    }
    const own = [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.tag);
    return [...own, ...STARTER_TAGS.filter((s) => !counts.has(s.toLocaleLowerCase()))];
  }, [creations, groups]);
}
