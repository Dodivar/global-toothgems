import type { GemGroupData } from "./gemGroup";
import type { StudioScene } from "./scene";

/**
 * Records of the Studio workspace, as the interface reads them.
 *
 * Shaped after the Supabase tables in
 * `supabase/migrations/…_studio_workspace.sql` (`creations`, `gem_groups`,
 * `studio_feedback`), in camelCase. Every record belongs to one account
 * (`userId`); row-level security is what enforces that on the server — the
 * local prototype store only mirrors it.
 *
 * Dates are ISO strings. Prices are indicative estimates in minor units with
 * their currency, never floats and never a price to charge.
 */

export interface Creation {
  id: string;
  userId: string;
  name: string;
  description: string;
  scene: StudioScene;
  /** Captured render of the stage; null falls back to the drawn preview. */
  thumbnailUrl: string | null;
  elementCount: number;
  estimatedPriceMinor: number;
  currency: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  /** Last time it was opened in the editor. */
  lastOpenedAt: string | null;
}

export interface GemGroup {
  id: string;
  userId: string;
  name: string;
  description: string;
  data: GemGroupData;
  /** Captured render of the group alone on the smile; null falls back to the drawn preview. */
  thumbnailUrl: string | null;
  elementCount: number;
  estimatedPriceMinor: number;
  currency: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/** Name and description: what the save and "edit details" dialogs collect. */
export interface RecordDetails {
  name: string;
  description: string;
}

export const FEEDBACK_CATEGORIES = ["general", "bug", "feature", "usability", "performance"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export interface FeedbackInput {
  /** 1–5. */
  rating: number;
  category: FeedbackCategory;
  message: string;
  /** Where it was sent from, to reproduce what was reported. No personal data. */
  context: { path: string; pieces: number; language: string; viewport: string };
}

/**
 * Colour of a collection's marker: a design-token name, never a free colour
 * (the database refuses anything else). The name always reads next to it.
 */
export const COLLECTION_COLORS = ["blue", "fuchsia", "emerald", "amber", "ink"] as const;
export type CollectionColor = (typeof COLLECTION_COLORS)[number];

/**
 * A named collection of saved creations (`public.studio_collections`).
 * Which creations it holds is a separate list of memberships, so a creation
 * can sit in several collections and deleting a collection never touches one.
 */
export interface StudioCollection {
  id: string;
  userId: string;
  name: string;
  color: CollectionColor | null;
  createdAt: string;
  updatedAt: string;
}

/** One creation in one collection (`public.studio_collection_creations`). */
export interface CollectionMembership {
  collectionId: string;
  creationId: string;
}

export interface CollectionDetails {
  name: string;
  color: CollectionColor | null;
}
