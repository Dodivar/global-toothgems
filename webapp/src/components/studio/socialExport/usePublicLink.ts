import { useCallback, useEffect, useState } from "react";
import { glowbookCreationPath } from "../../../lib/studioUrl";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";

export type PublicLink =
  | { kind: "loading" }
  /** No public page: link-based sharing waits for the member to create a share link. */
  | { kind: "none" }
  | { kind: "ready"; source: "glowbook" | "share"; url: string };

/**
 * The creation's existing public address, for the networks that share a link
 * (their preview card then shows the creation): its Glowbook page when the
 * creation is published there, else its read-only share link. Never creates a
 * link by itself — `create()` is the member's explicit button.
 */
export function usePublicLink(creation: Creation): { link: PublicLink; creating: boolean; failed: boolean; create: () => Promise<void> } {
  const ws = useWorkspace();
  const gb = useGlowbook();
  const { existingShareLink, shareLink } = ws;
  const [share, setShare] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  const item = gb.itemFor(creation.id);
  const glowbookUrl =
    gb.glowbook?.status === "approved" && item?.status === "approved" && typeof window !== "undefined"
      ? new URL(glowbookCreationPath(gb.glowbook.handle, item.id), window.location.origin).toString()
      : null;

  useEffect(() => {
    if (glowbookUrl) return;
    let active = true;
    existingShareLink(creation)
      .then((l) => active && setShare(l?.url ?? null))
      .catch(() => active && setShare(null));
    return () => {
      active = false;
    };
  }, [creation, existingShareLink, glowbookUrl]);

  const create = useCallback(async () => {
    setCreating(true);
    setFailed(false);
    try {
      setShare((await shareLink(creation)).url);
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }, [creation, shareLink]);

  const link: PublicLink = glowbookUrl
    ? { kind: "ready", source: "glowbook", url: glowbookUrl }
    : share === undefined
      ? { kind: "loading" }
      : share
        ? { kind: "ready", source: "share", url: share }
        : { kind: "none" };
  return { link, creating, failed, create };
}
