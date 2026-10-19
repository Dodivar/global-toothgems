"use client";

import { lazy, Suspense } from "react";
import { StudioAccessProvider } from "../lib/studioAccess";
import { RequireStudioAccess } from "../components/studio/access/StudioAccessGate";
import { StudioEditorLoading } from "../components/studio/editor/StudioEditorLoading";

/* The 3D Studio editor carries three.js, the heaviest code in the site: it is
   split into its own chunk and only downloaded when the editor is opened. */
const StudioEditor = lazy(() => import("../screens/StudioEditor").then((m) => ({ default: m.StudioEditor })));
/* A shared design is viewed in the same 3D engine: same on-demand chunk. */
const StudioShare = lazy(() => import("../screens/StudioShare").then((m) => ({ default: m.StudioShare })));

/**
 * The editor and its sections (`/studio-3d/atelier/*`, `app/studio-3d/atelier`).
 * Gated by `RequireStudioAccess`: the trial invitation, the editor or the
 * plans, from the account's access (decision 93; the database enforces it).
 */
export function StudioEditorScreen() {
  return (
    <StudioAccessProvider>
      <RequireStudioAccess>
        <Suspense fallback={<StudioEditorLoading />}>
          <StudioEditor />
        </Suspense>
      </RequireStudioAccess>
    </StudioAccessProvider>
  );
}

/**
 * A design shared read-only (`/studio-3d/partage`, `/studio-3d/partage/<token>`),
 * or a creation of an artist's Glowbook (`/studio-3d/glowbook/<handle>/<item>`).
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
