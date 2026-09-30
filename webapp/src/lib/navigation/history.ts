import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useSyncExternalStore } from "react";

/*
 * Whether "back" stays on the site (docs/migration-nextjs.md, phase 5): the
 * 404 screen offers it only then. React Router numbered its history entries;
 * the Next.js router does not, so the pages shown in this tab since it loaded
 * are counted here (`NavigationTracker`, once in the root providers), and a
 * page loaded from another page of the site counts as having one before it.
 */
let shown = 0;
let lastAddress: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function arrivedFromTheSite(): boolean {
  try {
    return document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Counts each page shown (a new path or query), once. */
export function NavigationTracker() {
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? "";
  useLayoutEffect(() => {
    const address = `${pathname}?${query}`;
    if (address === lastAddress) return;
    lastAddress = address;
    shown += 1;
    listeners.forEach((listener) => listener());
  }, [pathname, query]);
  return null;
}

/** True when an earlier page of the site is behind this one in the tab's history (false on the server). */
export function useCanGoBack(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => shown > 1 || arrivedFromTheSite(),
    () => false,
  );
}
