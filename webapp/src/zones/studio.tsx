"use client";

import { lazy, Suspense } from "react";
import { RequireStudioAccess } from "../lib/studioAccess";
import { StudioEditorLoading } from "../components/studio/editor/StudioEditorLoading";

/* The 3D Studio editor carries three.js, the heaviest code in the site: it is
   split into its own chunk and only downloaded when the editor is opened. */
const StudioEditor = lazy(() => import("../screens/StudioEditor").then((m) => ({ default: m.StudioEditor })));
/* A shared design is viewed in the same 3D engine: same on-demand chunk. */
const StudioShare = lazy(() => import("../screens/StudioShare").then((m) => ({ default: m.StudioShare })));

/**
 * The editor and its sections (`/studio-3d/atelier/*`, `app/studio-3d/atelier`).
 * Gated by `RequireStudioAccess`, which during the preview lets every visitor
 * in for free — the one place to change when the paid subscription goes live.
 */
export function StudioEditorScreen() {
  return (
    <RequireStudioAccess>
      <Suspense fallback={<StudioEditorLoading />}>
        <StudioEditor />
      </Suspense>
    </RequireStudioAccess>
  );
}

/**
 * A design shared read-only (`/studio-3d/partage`, `/studio-3d/partage/<token>`).
 * Open to everyone, outside `RequireStudioAccess`: looking at a design someone
 * sent is not using the Studio. Full-screen like the editor.
 */
export function StudioShareScreen() {
  return (
    <Suspense fallback={<StudioEditorLoading />}>
      <StudioShare />
    </Suspense>
  );
}
