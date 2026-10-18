import type { StudioSnapshot } from "./studio3d/store";
import { trackStudio, trackStudioOnce } from "./studioAnalytics";

/**
 * Engagement events read from the editor's store, without touching the
 * editor: a design is "created" when gems are placed on an empty, unsaved
 * scene, and a feature counts as "used" the first time in a session.
 *
 * The rules are pure (`activityEvents`) so they are tested without a stage.
 */

export type StudioFeature = "place_gem" | "gem_group" | "model" | "lighting" | "lasso" | "multi_select" | "client_name" | "undo";

export interface ActivityEvent {
  kind: "design_created" | "feature";
  feature?: StudioFeature;
}

type Watched = Pick<StudioSnapshot, "jewels" | "groups" | "active" | "modelMode" | "lightPreset" | "lasso" | "multiSelect" | "clientName" | "canRedo">;

/** What changed between two store snapshots, as analytics events. */
export function activityEvents(before: Watched, after: Watched): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const feature = (f: StudioFeature) => events.push({ kind: "feature", feature: f });
  if (after.jewels.length > before.jewels.length) {
    feature("place_gem");
    // Loading a saved design fills the scene too: only a fresh, unsaved scene counts as a new design.
    if (before.jewels.length === 0 && !after.active) events.push({ kind: "design_created" });
  }
  if (after.groups.length > before.groups.length) feature("gem_group");
  if (after.modelMode !== before.modelMode) feature("model");
  if (after.lightPreset !== before.lightPreset) feature("lighting");
  if (after.lasso && !before.lasso) feature("lasso");
  if (after.multiSelect && !before.multiSelect) feature("multi_select");
  if (after.clientName && after.clientName !== before.clientName) feature("client_name");
  if (after.canRedo && !before.canRedo) feature("undo");
  return events;
}

interface Store {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => StudioSnapshot;
}

/** Sends the events of one editor session; returns the unsubscribe. */
export function watchStudioActivity(store: Store, ids: { userId: string | null; sessionId: string }): () => void {
  let previous = store.getSnapshot();
  return store.subscribe(() => {
    const next = store.getSnapshot();
    if (next === previous) return;
    for (const event of activityEvents(previous, next)) {
      if (event.kind === "design_created") {
        trackStudio("studio_design_created", { session_id: ids.sessionId });
        if (ids.userId) trackStudioOnce(`first-created:${ids.userId}`, "studio_first_design_created", {}, "browser");
      } else if (event.feature) {
        trackStudioOnce(`feature:${ids.sessionId}:${event.feature}`, "studio_feature_used", { feature: event.feature, session_id: ids.sessionId });
      }
    }
    previous = next;
  });
}
