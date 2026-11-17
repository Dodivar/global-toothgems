"use client";

import { StudioAccessProvider } from "../../lib/studioAccess";
import { StudioWorkspaceProvider } from "../../lib/studioWorkspace/workspace";
import { GlowbookProvider } from "../../lib/studioWorkspace/glowbookStore";
import { GlowbookManager } from "../../components/studio/workspace/GlowbookManager";

/**
 * `/compte/glowbook`: "My Glowbook" in the member space, beside the calendar
 * and the 3D Studio subscription — the artist's tools in one place (the
 * owner's "artist space", 2026-11-17). It was a section of the Studio
 * workspace before.
 *
 * The Glowbook reads the member's creations (which ones are on the page, the
 * spotlight video recorded from one), so it runs on the Studio workspace's
 * store; that store carries the 3D engine, which is why `zones/glowbookSpace`
 * loads this screen on demand. A creation's own tools (detail, front view,
 * posts, try-on) stay in the Studio: the page links there.
 */
export function GlowbookSpace() {
  return (
    <StudioAccessProvider>
      <StudioWorkspaceProvider>
        <GlowbookProvider>
          <GlowbookManager />
        </GlowbookProvider>
      </StudioWorkspaceProvider>
    </StudioAccessProvider>
  );
}
