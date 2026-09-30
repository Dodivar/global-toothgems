import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False while a server-rendered page is rendered on the server and hydrated
 * (phase 3.2 of docs/migration-nextjs.md), true afterwards — and from the
 * first render for a page rendered in the browser only. State read from the
 * browser (localStorage, media queries) must wait for it: the first browser
 * render has to produce the server's markup.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
