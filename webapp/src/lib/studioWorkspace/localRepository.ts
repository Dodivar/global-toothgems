import { ESTIMATE_PRICING } from "../../data/studioEditor";
import { uid } from "../studio3d/math";
import { STUDIO_SHARE_PATH } from "../studioUrl";
import { groupEstimateCents, sanitizeGroupData } from "./gemGroup";
import {
  StudioStoreError,
  type CreationInput,
  type CreationPatch,
  type GemGroupInput,
  type GemGroupPatch,
  type StudioRepositories,
} from "./repository";
import { sanitizeScene, sceneStats } from "./scene";
import { seedCreations, seedGroups } from "./seed";
import { snapshotShareLink } from "./share";
import type { Creation, FeedbackInput, GemGroup } from "./types";
import { normalizeDetails, normalizeTags, validateDetails, validateFeedback } from "./validation";

/**
 * PROTOTYPE persistence: the Studio workspace kept in this browser's storage,
 * one namespace per account, behind the same interface the Supabase version
 * will implement (see `repository.ts`).
 *
 * It behaves like the real thing where it matters to the interface: calls are
 * asynchronous with a little latency, every write is validated, rows carry
 * their owner and are filtered by it, and a failed write throws — a full or
 * blocked storage says "Unable to save", never a false "Saved". It is not a
 * security boundary: anything in the browser can be read by whoever uses it.
 *
 * Thumbnails live under their own key, so a quota error on an image never
 * loses the design itself: the card falls back to its drawn preview.
 */

/** The subset of `Storage` used here, so tests can pass an in-memory one. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalRepositoryOptions {
  storage: KeyValueStorage;
  /** Simulated network latency in ms; 0 in tests. */
  latency?: number;
  now?: () => number;
  /** Fill a new account's library with the prototype designs. */
  seed?: boolean;
}

interface LibraryFile {
  v: 1;
  seeded: boolean;
  creations: Omit<Creation, "thumbnailUrl">[];
  groups: GemGroup[];
  feedback: (FeedbackInput & { id: string; createdAt: string })[];
}

const LIBRARY_KEY = "gt-studio-library-v1";
const THUMB_KEY = "gt-studio-thumb-v1";
/** A captured JPEG is ~30–60 kB; anything far larger is not one of ours. */
const THUMB_MAX_CHARS = 400_000;

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export function createLocalRepositories(userId: string, opts: LocalRepositoryOptions): StudioRepositories {
  const { storage, latency = 0, seed = false } = opts;
  const now = opts.now ?? Date.now;
  const libKey = `${LIBRARY_KEY}:${userId}`;
  const thumbKey = (id: string) => `${THUMB_KEY}:${userId}:${id}`;
  const iso = () => new Date(now()).toISOString();

  function read(): LibraryFile {
    let data: Partial<LibraryFile> | null = null;
    try {
      const raw = storage.getItem(libKey);
      data = raw ? (JSON.parse(raw) as Partial<LibraryFile>) : null;
    } catch {
      data = null; // corrupt or blocked: start from an empty library
    }
    const file: LibraryFile = {
      v: 1,
      seeded: !!data?.seeded,
      creations: Array.isArray(data?.creations) ? data.creations : [],
      groups: Array.isArray(data?.groups) ? data.groups : [],
      feedback: Array.isArray(data?.feedback) ? data.feedback : [],
    };
    if (seed && !file.seeded) {
      file.seeded = true;
      file.creations = seedCreations(userId, now());
      file.groups = seedGroups(userId, now());
      try {
        write(file);
      } catch {
        /* the seed shows for this visit even if it cannot be kept */
      }
    }
    // Rows are re-validated on the way in: storage is untrusted, like a network response.
    file.creations = file.creations
      .filter((c) => c && c.userId === userId && typeof c.id === "string")
      .map((c) => {
        const scene = sanitizeScene(c.scene);
        const stats = sceneStats(scene.pieces);
        return { ...c, scene, ...stats, tags: normalizeTags(Array.isArray(c.tags) ? c.tags : []) };
      });
    file.groups = file.groups
      .filter((g) => g && g.userId === userId && typeof g.id === "string")
      .flatMap((g) => {
        const data = sanitizeGroupData(g.data);
        if (!data) return [];
        return [{ ...g, data, elementCount: data.pieces.length, estimatedPriceMinor: groupEstimateCents(data.pieces) }];
      });
    return file;
  }

  function write(file: LibraryFile) {
    try {
      storage.setItem(libKey, JSON.stringify(file));
    } catch {
      throw new StudioStoreError("storage", "Browser storage is full or unavailable.");
    }
  }

  function readThumb(id: string): string | null {
    try {
      return storage.getItem(thumbKey(id));
    } catch {
      return null;
    }
  }

  /** Best effort: an image that does not fit is dropped, the design is still saved. */
  function writeThumb(id: string, dataUrl: string | null) {
    try {
      if (dataUrl && dataUrl.startsWith("data:image/") && dataUrl.length <= THUMB_MAX_CHARS) storage.setItem(thumbKey(id), dataUrl);
      else storage.removeItem(thumbKey(id));
    } catch {
      try {
        storage.removeItem(thumbKey(id));
      } catch {
        /* nothing more to do */
      }
    }
  }

  const withThumb = (c: Omit<Creation, "thumbnailUrl">): Creation => ({ ...c, thumbnailUrl: readThumb(c.id) });

  function checkDetails(details: { name: string; description: string; tags: string[] }) {
    const problem = validateDetails(details);
    if (problem) throw new StudioStoreError("invalid", problem);
    return normalizeDetails(details);
  }

  function findCreation(file: LibraryFile, id: string) {
    const index = file.creations.findIndex((c) => c.id === id);
    if (index < 0) throw new StudioStoreError("notFound");
    return index;
  }
  function findGroup(file: LibraryFile, id: string) {
    const index = file.groups.findIndex((g) => g.id === id);
    if (index < 0) throw new StudioStoreError("notFound");
    return index;
  }

  return {
    creations: {
      async list() {
        await wait(latency);
        return read().creations.map(withThumb);
      },
      async create(input: CreationInput) {
        await wait(latency);
        const details = checkDetails(input);
        const scene = sanitizeScene(input.scene);
        const file = read();
        const at = iso();
        const row: Omit<Creation, "thumbnailUrl"> = {
          id: uid() + uid(),
          userId,
          ...details,
          scene,
          ...sceneStats(scene.pieces),
          isFavorite: false,
          createdAt: at,
          updatedAt: at,
          lastOpenedAt: at,
        };
        file.creations.unshift(row);
        write(file);
        writeThumb(row.id, input.thumbnail);
        return withThumb(row);
      },
      async update(id: string, patch: CreationPatch) {
        await wait(latency);
        const file = read();
        const index = findCreation(file, id);
        const current = file.creations[index];
        const details =
          patch.name !== undefined || patch.description !== undefined || patch.tags !== undefined
            ? checkDetails({
                name: patch.name ?? current.name,
                description: patch.description ?? current.description,
                tags: patch.tags ?? current.tags,
              })
            : null;
        const scene = patch.scene ? sanitizeScene(patch.scene) : null;
        // Favouriting or opening a design is not an edit: "last edited" stays put.
        const edited = !!details || !!scene;
        const next: Omit<Creation, "thumbnailUrl"> = {
          ...current,
          ...(details ?? {}),
          ...(scene ? { scene, ...sceneStats(scene.pieces) } : {}),
          ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
          ...(patch.lastOpenedAt ? { lastOpenedAt: patch.lastOpenedAt } : {}),
          updatedAt: edited ? iso() : current.updatedAt,
        };
        file.creations[index] = next;
        write(file);
        if (patch.thumbnail !== undefined) writeThumb(id, patch.thumbnail);
        return withThumb(next);
      },
      async duplicate(id: string, name: string) {
        await wait(latency);
        const file = read();
        const source = file.creations[findCreation(file, id)];
        const details = checkDetails({ ...source, name });
        const at = iso();
        const row: Omit<Creation, "thumbnailUrl"> = {
          ...structuredClone(source),
          ...details,
          id: uid() + uid(),
          isFavorite: false,
          createdAt: at,
          updatedAt: at,
          lastOpenedAt: null,
        };
        file.creations.unshift(row);
        write(file);
        writeThumb(row.id, readThumb(id));
        return withThumb(row);
      },
      async remove(id: string) {
        await wait(latency);
        const file = read();
        file.creations.splice(findCreation(file, id), 1);
        write(file);
        writeThumb(id, null);
      },
      // Nothing here is on a server a token could point at: the link carries a snapshot of the design.
      async shareLink(creation: Creation) {
        return snapshotShareLink(creation, STUDIO_SHARE_PATH);
      },
      async existingShareLink(creation: Creation) {
        return snapshotShareLink(creation, STUDIO_SHARE_PATH);
      },
      async revokeShare() {
        // A snapshot link cannot be revoked; the dialog does not offer it.
      },
    },

    groups: {
      async list() {
        await wait(latency);
        return read().groups;
      },
      async create(input: GemGroupInput) {
        await wait(latency);
        const details = checkDetails(input);
        const data = sanitizeGroupData(input.data);
        if (!data) throw new StudioStoreError("invalid", "groupTooSmall");
        const file = read();
        const at = iso();
        const row: GemGroup = {
          id: uid() + uid(),
          userId,
          ...details,
          data,
          elementCount: data.pieces.length,
          estimatedPriceMinor: groupEstimateCents(data.pieces),
          currency: ESTIMATE_PRICING.currency,
          isFavorite: false,
          createdAt: at,
          updatedAt: at,
          lastUsedAt: null,
        };
        file.groups.unshift(row);
        write(file);
        return row;
      },
      async update(id: string, patch: GemGroupPatch) {
        await wait(latency);
        const file = read();
        const index = findGroup(file, id);
        const current = file.groups[index];
        const details =
          patch.name !== undefined || patch.description !== undefined || patch.tags !== undefined
            ? checkDetails({
                name: patch.name ?? current.name,
                description: patch.description ?? current.description,
                tags: patch.tags ?? current.tags,
              })
            : null;
        const next: GemGroup = {
          ...current,
          ...(details ?? {}),
          ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
          ...(patch.lastUsedAt ? { lastUsedAt: patch.lastUsedAt } : {}),
          updatedAt: details ? iso() : current.updatedAt,
        };
        file.groups[index] = next;
        write(file);
        return next;
      },
      async duplicate(id: string, name: string) {
        await wait(latency);
        const file = read();
        const source = file.groups[findGroup(file, id)];
        const details = checkDetails({ ...source, name });
        const at = iso();
        const row: GemGroup = {
          ...structuredClone(source),
          ...details,
          id: uid() + uid(),
          isFavorite: false,
          createdAt: at,
          updatedAt: at,
          lastUsedAt: null,
        };
        file.groups.unshift(row);
        write(file);
        return row;
      },
      async remove(id: string) {
        await wait(latency);
        const file = read();
        file.groups.splice(findGroup(file, id), 1);
        write(file);
      },
    },

    feedback: {
      async submit(input: FeedbackInput) {
        await wait(latency);
        const problem = validateFeedback(input);
        if (problem) throw new StudioStoreError("invalid", problem);
        const file = read();
        file.feedback.push({ ...input, message: input.message.trim(), id: uid() + uid(), createdAt: iso() });
        // Kept short: a local stand-in for the table, not an archive.
        file.feedback = file.feedback.slice(-20);
        write(file);
      },
    },
  };
}
