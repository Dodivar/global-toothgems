import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { STUDIO_EDITOR_PATH, STUDIO_SHARE_PATH } from "../lib/studioUrl";
import { RequireStudioAccess } from "../lib/studioAccess";
import { StudioEditorLoading } from "../components/studio/editor/StudioEditorLoading";
import { AppShell } from "../AppShell";
import { BrowserRoot } from "../AppRoot";
import { ZoneExit } from "./ZoneExit";

/* The 3D Studio editor carries three.js, the heaviest code in the site: it is
   split into its own chunk and only downloaded when the editor is opened. */
const StudioEditor = lazy(() => import("../screens/StudioEditor").then((m) => ({ default: m.StudioEditor })));
/* A shared design is viewed in the same 3D engine: same on-demand chunk. */
const StudioShare = lazy(() => import("../screens/StudioShare").then((m) => ({ default: m.StudioShare })));

/**
 * The Studio zone (`lib/appZones.ts`): the 3D editor (`/studio-3d/atelier/*`)
 * and a shared design's viewer (`/studio-3d/partage/*`), mounted by
 * `app/studio-3d/…` in the browser only — WebGL exists nowhere else. The
 * sales and subscription pages are public: they stay in the public zone.
 */
export default function StudioApp() {
  return (
    <BrowserRoot>
      <AppShell zone="studio">
        <Routes>
          {/* The editor itself. Gated by `RequireStudioAccess`,
              which during the preview lets every visitor in for
              free — the one place to change when the paid
              subscription goes live. Lazy: see `StudioEditor`. */}
          <Route
            path={`${STUDIO_EDITOR_PATH}/*`}
            element={
              <RequireStudioAccess>
                <Suspense fallback={<StudioEditorLoading />}>
                  <StudioEditor />
                </Suspense>
              </RequireStudioAccess>
            }
          />
          {/* A design shared read-only. Open to everyone, outside
              `RequireStudioAccess`: looking at a design someone sent
              is not using the Studio. Full-screen like the editor. */}
          {[STUDIO_SHARE_PATH, `${STUDIO_SHARE_PATH}/:token`].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={<StudioEditorLoading />}>
                  <StudioShare />
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<ZoneExit zone="studio" />} />
        </Routes>
      </AppShell>
    </BrowserRoot>
  );
}
