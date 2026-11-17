"use client";

import { lazy, Suspense } from "react";

/* "My Glowbook" runs on the Studio workspace's store, which carries the 3D
   engine (three.js): its own chunk, downloaded only when the page opens, so
   the rest of the member space stays light. */
const GlowbookSpace = lazy(() => import("../screens/account/GlowbookSpace").then((m) => ({ default: m.GlowbookSpace })));

/** While the chunk loads: the page's header and a card, shaped like what comes (no import from the chunk). */
function Loading() {
  return (
    <div aria-hidden="true" className="grid gap-6">
      <div className="grid gap-2">
        <div className="h-3 w-24 rounded bg-[var(--gt-ink-100)]" />
        <div className="h-8 w-56 rounded bg-[var(--gt-ink-100)]" />
      </div>
      <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-[var(--gt-blue-100)] motion-reduce:animate-none" />
    </div>
  );
}

export function GlowbookSpaceScreen() {
  return (
    <Suspense fallback={<Loading />}>
      <GlowbookSpace />
    </Suspense>
  );
}
