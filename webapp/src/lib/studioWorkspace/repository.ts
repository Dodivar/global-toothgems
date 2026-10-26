import type { GemGroupData } from "./gemGroup";
import type { StudioScene } from "./scene";
import type { ShareLink } from "./share";
import type {
  CollectionDetails,
  CollectionMembership,
  Creation,
  FeedbackInput,
  GemGroup,
  RecordDetails,
  StudioCollection,
  StudioPreferences,
} from "./types";

/**
 * The Studio workspace's persistence boundary.
 *
 * The interface talks to these three repositories only — never to storage or
 * to Supabase directly — so replacing the local prototype implementation
 * (`localRepository.ts`) with Supabase queries is a change in one place:
 *
 *   creations        → `public.creations`        (select / insert / update / delete, own rows)
 *   gem groups       → `public.gem_groups`       (same)
 *   feedback         → `public.studio_feedback`  (insert only)
 *   collections      → `public.studio_collections` + `public.studio_collection_creations` (own rows)
 *   preferences      → `public.studio_preferences` (the member's one row, created on first change)
 *
 * Ownership is not a parameter: an implementation is created for the signed-in
 * account and every row it touches belongs to it. On Supabase, `user_id`
 * defaults to `auth.uid()` and row-level security refuses any other row, so a
 * client cannot read or write someone else's designs whatever it sends.
 *
 * Failures surface as `StudioStoreError` so the interface can say "Unable to
 * save" instead of pretending the design was stored.
 */

/**
 * `accessDenied`: the database refused a write because the member has no Studio access (trial over).
 * `duplicate`: a collection of that name already exists (names are unique per member, ignoring case).
 * `limitReached`: the member already holds as many creations or Gem Groups as their plan allows
 *   (decision 113); the message is the kind, `creations` or `gemGroups` (`limitKind()`).
 */
export type StudioStoreErrorCode = "storage" | "notFound" | "invalid" | "unavailable" | "accessDenied" | "duplicate" | "limitReached";

export class StudioStoreError extends Error {
  readonly code: StudioStoreErrorCode;
  constructor(code: StudioStoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StudioStoreError";
    this.code = code;
  }
}

/** The kind of a `limitReached` refusal, or null for any other error. */
export function limitKind(err: unknown): "creations" | "gemGroups" | null {
  if (!(err instanceof StudioStoreError) || err.code !== "limitReached") return null;
  return err.message === "gemGroups" ? "gemGroups" : "creations";
}

export interface CreationInput extends RecordDetails {
  scene: StudioScene;
  /** A JPEG data URL captured from the stage, or null to keep the drawn preview. */
  thumbnail: string | null;
}

export interface CreationPatch extends Partial<RecordDetails> {
  scene?: StudioScene;
  thumbnail?: string | null;
  isFavorite?: boolean;
  lastOpenedAt?: string;
}

export interface CreationsRepository {
  list(): Promise<Creation[]>;
  create(input: CreationInput): Promise<Creation>;
  update(id: string, patch: CreationPatch): Promise<Creation>;
  /** A copy under a new name; the original is not touched. */
  duplicate(id: string, name: string): Promise<Creation>;
  remove(id: string): Promise<void>;
  /** The creation's read-only link, created on first use: sharing is an explicit act. */
  shareLink(creation: Creation): Promise<ShareLink>;
  /** Its link if one is already active — never creates one. */
  existingShareLink(creation: Creation): Promise<ShareLink | null>;
  /** Disable the active link: it stops opening the creation at once. */
  revokeShare(id: string): Promise<void>;
}

export interface GemGroupInput extends RecordDetails {
  data: GemGroupData;
  /** A JPEG data URL of the selected pieces alone on the stage, or null to keep the drawn preview. */
  thumbnail: string | null;
}

export interface GemGroupPatch extends Partial<RecordDetails> {
  isFavorite?: boolean;
  lastUsedAt?: string;
}

export interface GemGroupsRepository {
  list(): Promise<GemGroup[]>;
  create(input: GemGroupInput): Promise<GemGroup>;
  update(id: string, patch: GemGroupPatch): Promise<GemGroup>;
  duplicate(id: string, name: string): Promise<GemGroup>;
  remove(id: string): Promise<void>;
}

export interface FeedbackRepository {
  submit(input: FeedbackInput): Promise<void>;
}

export interface CollectionsList {
  collections: StudioCollection[];
  memberships: CollectionMembership[];
}

/**
 * Collections of saved creations. Membership is many-to-many and lives apart
 * from the creations: removing a collection removes its memberships only.
 */
export interface CollectionsRepository {
  list(): Promise<CollectionsList>;
  create(details: CollectionDetails): Promise<StudioCollection>;
  update(id: string, details: CollectionDetails): Promise<StudioCollection>;
  remove(id: string): Promise<void>;
  /** Put creations in the collection; one already there is not an error. */
  addCreations(collectionId: string, creationIds: string[]): Promise<void>;
  /** Take creations out of the collection; the creations themselves are kept. */
  removeCreations(collectionId: string, creationIds: string[]): Promise<void>;
}

/** The member's workspace preferences; no stored row reads as the defaults. */
export interface PreferencesRepository {
  get(): Promise<StudioPreferences>;
  update(patch: Partial<StudioPreferences>): Promise<StudioPreferences>;
}

export interface StudioRepositories {
  creations: CreationsRepository;
  groups: GemGroupsRepository;
  feedback: FeedbackRepository;
  collections: CollectionsRepository;
  preferences: PreferencesRepository;
}
