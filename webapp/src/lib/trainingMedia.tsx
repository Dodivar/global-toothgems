import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MEDIA_LIBRARY } from "../data/adminTraining";
import { useAdminAuth } from "./adminAuth";
import { isUuid } from "./adminTrainingMapping";
import { isSupabaseConfigured, supabase, type TypedSupabaseClient } from "./supabase/client";
import { supabasePublishableKey, supabaseUrl } from "./supabase/env";
import { stableSignedUrls } from "./supabase/signedUrlCache";
import { useVisibleInterval } from "./useVisibleInterval";
import type { Database } from "./supabase/database.types";
import { drawThumbnail, thumbPath } from "./trainingMediaThumbnail";
import {
  cleanFolderName,
  displayName,
  mediaKindOf,
  storageFileName,
  validateUpload,
  type MediaCategory,
  type MediaFolder,
  type MediaKind,
  type TrainingMedia,
  type UploadRejection,
} from "./trainingMediaRules";

/**
 * The training media library (images and videos), as a store.
 *
 * With Supabase, files go to the private `training-media` bucket under
 * `media/<id>/`, through resumable (TUS) uploads so a long video survives a
 * dropped connection, and each one gets a `training_media` row the courses
 * point at. The back office shows them through signed URLs that keep the
 * same address while valid and are renewed only near their expiry. Nothing is read until a staff session is open: the provider
 * sits under the root layout.
 *
 * Without Supabase (prototype), the library is the seeded studio photographs
 * and uploads stay in the page (object URLs).
 *
 * Folders and thumbnails (decision 104): files are sorted into the editors'
 * own folders (`training_media_folders`, one per file, optional), and the
 * grids show a small WebP drawn by the browser at upload
 * (`trainingMediaThumbnail.ts`) instead of the original. Files uploaded before
 * get theirs once, when a training manager opens the library
 * (`backfillThumbnails`). The whole list of rows is read (a few hundred bytes
 * each): the courses resolve their media through `urlOf()`, which must know
 * every file — what the grids page is what they draw, not what they read.
 *
 * Screens never use a course's media reference as a URL: they ask `urlOf()`.
 */

export interface PendingUpload {
  id: string;
  name: string;
  kind: MediaKind;
  /** Local object URL, for an image preview while it uploads. */
  preview: string;
  progress: number;
}

export type UploadFailure = UploadRejection | "failed";

export interface RejectedUpload {
  name: string;
  reason: UploadFailure;
}

export type MediaPatch = Partial<Pick<TrainingMedia, "name" | "alt" | "category" | "tags" | "folderId">>;

export interface UploadOptions {
  category: MediaCategory;
  folderId: string | null;
}

export type FolderFailure = "taken" | "invalid" | "failed";

interface TrainingMediaValue {
  source: "mock" | "supabase";
  items: TrainingMedia[];
  loading: boolean;
  loadFailed: boolean;
  reload: () => void;
  pending: PendingUpload[];
  /** Whether the signed-in staff member may change the library (`manage_training`); navigation only. */
  canManage: boolean;
  /** Validates and uploads; resolves with the new items and the files refused. */
  upload: (files: File[], options: UploadOptions) => Promise<{ added: TrainingMedia[]; rejected: RejectedUpload[] }>;
  updateMedia: (id: string, patch: MediaPatch) => Promise<void>;
  /** Files them in one folder (null = not filed). */
  moveMedia: (ids: string[], folderId: string | null) => Promise<void>;
  /** The library's folders, in their order. */
  folders: MediaFolder[];
  createFolder: (name: string) => Promise<MediaFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  /** Removes the folder; its files stay, not filed. */
  deleteFolder: (id: string) => Promise<void>;
  /** Draws the missing thumbnails of older files, one at a time (managers only). */
  backfillThumbnails: () => void;
  /** "inUse" when a course still points at the file (the database refuses it). */
  deleteMedia: (id: string) => Promise<"deleted" | "inUse">;
  /** The library entry behind a course's media reference, when there is one. */
  findByRef: (ref: string) => TrainingMedia | undefined;
  /** A displayable URL for a media reference ("" when there is nothing to show yet). */
  urlOf: (ref: string | undefined) => string;
}

const TrainingMediaContext = createContext<TrainingMediaValue | null>(null);

const BUCKET = "training-media";
/**
 * Signed URLs last twelve hours and keep the same address until the last
 * hour (`lib/supabase/signedUrlCache.ts`): a new address re-downloads the
 * file. Expiry is checked every few minutes while the tab is visible.
 */
const SIGNED_URL_SECONDS = 12 * 60 * 60;
const RESIGN_MARGIN_SECONDS = 60 * 60;
const RESIGN_CHECK_MS = 5 * 60 * 1000;
/** Paths are `media/<id>/<file>` and never overwritten, so files may be cached for a year. */
const UPLOAD_CACHE_CONTROL = "31536000";
/** Prototype upload time, so the progress state is visible. */
const MOCK_UPLOAD_MS = 1200;
const MOCK_TICK_MS = 80;

type MediaRow = Database["public"]["Tables"]["training_media"]["Row"] & {
  training_media_translations: Database["public"]["Tables"]["training_media_translations"]["Row"][];
};
type FolderRow = Database["public"]["Tables"]["training_media_folders"]["Row"];

/** PostgREST returns at most this many rows per request; the library is read in pages of it. */
const PAGE_ROWS = 1000;

/** A folder error the screens can word: a duplicate name is the database's unique index. */
export class FolderError extends Error {
  readonly reason: FolderFailure;
  constructor(reason: FolderFailure) {
    super(reason);
    this.reason = reason;
  }
}

/* -------------------------------------------------------------------------- */
/* File metadata                                                               */
/* -------------------------------------------------------------------------- */

interface FileMeta {
  width: number;
  height: number;
  durationSeconds: number | null;
}

function readMeta(url: string, kind: MediaKind): Promise<FileMeta> {
  return new Promise((resolve) => {
    if (kind === "image") {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, durationSeconds: null });
      image.onerror = () => resolve({ width: 0, height: 0, durationSeconds: null });
      image.src = url;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
      });
    video.onerror = () => resolve({ width: 0, height: 0, durationSeconds: null });
    video.src = url;
  });
}

/* -------------------------------------------------------------------------- */
/* Prototype seed                                                              */
/* -------------------------------------------------------------------------- */

const SEED_META: Record<string, { category: MediaCategory; tags: string[]; name: string; width: number; height: number; bytes: number; date: string }> = {
  "med-01": { category: "results", tags: ["sourire", "gem centrale", "smile"], name: "sourire-gem-centrale", width: 1846, height: 1846, bytes: 280083, date: "2026-02-11" },
  "med-02": { category: "results", tags: ["composition", "multi-gems"], name: "composition-multi-gems", width: 1744, height: 1744, bytes: 351655, date: "2026-02-11" },
  "med-03": { category: "technique", tags: ["latérale", "lateral", "pose"], name: "gem-dent-laterale", width: 640, height: 640, bytes: 71236, date: "2026-03-02" },
  "med-04": { category: "technique", tags: ["contrôle", "polymérisation", "inspection"], name: "controle-apres-polymerisation", width: 640, height: 640, bytes: 57399, date: "2026-03-02" },
  "med-05": { category: "results", tags: ["suivi", "aftercare", "une semaine"], name: "resultat-une-semaine", width: 640, height: 640, bytes: 48671, date: "2026-03-18" },
  "med-06": { category: "hygiene", tags: ["instruments", "stérilisation", "plateau"], name: "plateau-instruments", width: 299, height: 299, bytes: 17557, date: "2026-04-07" },
  "med-07": { category: "hygiene", tags: ["poste", "préparation", "workstation"], name: "poste-de-travail", width: 299, height: 299, bytes: 18725, date: "2026-04-07" },
  "med-08": { category: "materials", tags: ["gems", "tailles", "sizes"], name: "gems-triees-par-taille", width: 299, height: 299, bytes: 14896, date: "2026-05-12" },
  "med-09": { category: "technique", tags: ["émail", "enamel", "gros plan"], name: "gros-plan-email", width: 480, height: 479, bytes: 49336, date: "2026-05-20" },
  "med-10": { category: "materials", tags: ["lampe", "polymérisation", "curing"], name: "lampe-polymerisation", width: 299, height: 299, bytes: 18506, date: "2026-06-03" },
  "med-11": { category: "studio", tags: ["consentement", "consent", "client"], name: "fiche-consentement", width: 480, height: 480, bytes: 46921, date: "2026-06-24" },
  "med-12": { category: "studio", tags: ["studio", "séance", "session"], name: "studio-en-seance", width: 299, height: 299, bytes: 17898, date: "2026-07-01" },
};

function seedLibrary(): TrainingMedia[] {
  return MEDIA_LIBRARY.map((entry) => {
    const meta = SEED_META[entry.id];
    return {
      id: entry.id,
      ref: entry.src,
      kind: "image",
      src: entry.src,
      thumbSrc: entry.src,
      folderId: null,
      mimeType: "image/jpeg",
      name: meta?.name ?? entry.id,
      alt: { ...entry.label },
      category: meta?.category ?? "technique",
      tags: meta?.tags ?? [],
      width: meta?.width ?? 0,
      height: meta?.height ?? 0,
      bytes: meta?.bytes ?? 0,
      durationSeconds: null,
      createdAt: `${meta?.date ?? "2026-01-01"}T09:00:00.000Z`,
      origin: "library",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Supabase                                                                    */
/* -------------------------------------------------------------------------- */

function rowToMedia(row: MediaRow, src: string, thumbSrc: string): TrainingMedia {
  const en = row.training_media_translations.find((t) => t.locale === "en");
  return {
    id: row.id,
    ref: row.id,
    kind: row.kind as MediaKind,
    src,
    thumbSrc,
    folderId: row.folder_id,
    mimeType: row.mime_type,
    name: row.name,
    alt: { fr: row.alt_text ?? "", en: en?.alt_text ?? "" },
    category: row.category as MediaCategory,
    tags: row.tags,
    width: row.width ?? 0,
    height: row.height ?? 0,
    bytes: row.bytes,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    origin: "library",
  };
}

function rowToFolder(row: FolderRow): MediaFolder {
  return { id: row.id, name: row.name, position: row.position };
}

/** The direct storage hostname, recommended for large uploads; the API URL otherwise. */
function resumableEndpoint(): string {
  const url = new URL(supabaseUrl);
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  return match
    ? `https://${match[1]}.storage.supabase.co/storage/v1/upload/resumable`
    : `${url.origin}/storage/v1/upload/resumable`;
}

async function uploadResumable(
  client: TypedSupabaseClient,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  const { Upload } = await import("tus-js-client");
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No session");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: supabasePublishableKey, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: file.type, cacheControl: UPLOAD_CACHE_CONTROL },
      // Supabase requires 6 MB chunks.
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export function TrainingMediaProvider({ children }: { children: ReactNode }) {
  const client = isSupabaseConfigured ? supabase : null;
  // Decided from the configuration, the same on the server and in the browser.
  const source: "mock" | "supabase" = isSupabaseConfigured ? "supabase" : "mock";
  const { admin, restoring } = useAdminAuth();
  const enabled = source === "mock" || (!restoring && admin !== null);

  const [items, setItems] = useState<TrainingMedia[]>(() => (source === "supabase" ? [] : seedLibrary()));
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [canManage, setCanManage] = useState(source === "mock");
  const [loading, setLoading] = useState(source === "supabase");
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadCount, setLoadCount] = useState(0);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  // Storage paths by media id (original and thumbnail), to sign and delete files.
  const paths = useRef(new Map<string, { original: string; thumb: string | null }>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Files whose thumbnail was already attempted in this tab (drawn or not).
  const thumbTried = useRef(new Set<string>());
  const backfilling = useRef(false);

  /** Signed URLs by media id: the original and, when there is one, the thumbnail. */
  const sign = useCallback(
    async (ids: string[]): Promise<Map<string, { src: string; thumb: string }>> => {
      const signed = new Map<string, { src: string; thumb: string }>();
      const list: string[] = [];
      for (const id of ids) {
        const entry = paths.current.get(id);
        if (!entry) continue;
        list.push(entry.original);
        if (entry.thumb) list.push(entry.thumb);
      }
      if (!client || list.length === 0) return signed;
      const byPath = await stableSignedUrls(client, list, {
        bucket: BUCKET,
        ttlSeconds: SIGNED_URL_SECONDS,
        minRemainingSeconds: RESIGN_MARGIN_SECONDS,
      }).catch((error: unknown) => {
        console.error("Training media signing:", error);
        return new Map<string, string>();
      });
      for (const id of ids) {
        const entry = paths.current.get(id);
        if (!entry) continue;
        signed.set(id, { src: byPath.get(entry.original) ?? "", thumb: entry.thumb ? (byPath.get(entry.thumb) ?? "") : "" });
      }
      return signed;
    },
    [client],
  );

  useEffect(() => {
    if (!client || !enabled) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rows: MediaRow[] = [];
      for (let from = 0; ; from += PAGE_ROWS) {
        const { data, error } = await client
          .from("training_media")
          .select("*, training_media_translations(*)")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE_ROWS - 1);
        if (cancelled) return;
        if (error) {
          console.error("Training media:", error);
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        rows.push(...(data as MediaRow[]));
        if (data.length < PAGE_ROWS) break;
      }
      const [folderResult, mine] = await Promise.all([
        client.from("training_media_folders").select("*").order("position").order("name"),
        client.rpc("my_permissions"),
      ]);
      if (cancelled) return;
      if (folderResult.error) console.error("Training media folders:", folderResult.error);
      for (const row of rows) paths.current.set(row.id, { original: row.storage_path, thumb: row.thumb_path });
      const signed = await sign(rows.map((row) => row.id));
      if (cancelled) return;
      setItems(rows.map((row) => rowToMedia(row, signed.get(row.id)?.src ?? "", signed.get(row.id)?.thumb ?? "")));
      setFolders((folderResult.data ?? []).map(rowToFolder));
      setCanManage(Boolean(mine.data?.includes("manage_training")));
      setLoadFailed(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enabled, loadCount, sign]);

  // Signed URLs expire: renew the ones close to it while the back office is
  // looked at. Unchanged addresses keep their `src`, so nothing re-downloads.
  const renew = useCallback(async () => {
    const signed = await sign(itemsRef.current.map((item) => item.id));
    setItems((prev) => {
      const changed = prev.some((item) => {
        const fresh = signed.get(item.id);
        return fresh !== undefined && ((fresh.src && fresh.src !== item.src) || (fresh.thumb && fresh.thumb !== item.thumbSrc));
      });
      if (!changed) return prev;
      return prev.map((item) => {
        const fresh = signed.get(item.id);
        return fresh ? { ...item, src: fresh.src || item.src, thumbSrc: fresh.thumb || item.thumbSrc } : item;
      });
    });
  }, [sign]);
  useVisibleInterval(renew, RESIGN_CHECK_MS, Boolean(client) && enabled);

  const reload = useCallback(() => setLoadCount((n) => n + 1), []);

  /** Stores a drawn thumbnail next to its file; its path, or null when it could not be stored. */
  const storeThumbnail = useCallback(
    async (mediaId: string, blob: Blob): Promise<string | null> => {
      if (!client) return null;
      const path = thumbPath(mediaId, blob.type);
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: UPLOAD_CACHE_CONTROL, upsert: true });
      if (error) {
        console.error("Training media thumbnail:", error);
        return null;
      }
      return path;
    },
    [client],
  );

  const upload = useCallback(
    async (files: File[], { category, folderId }: UploadOptions) => {
      const rejected: RejectedUpload[] = [];
      const accepted: { file: File; entry: PendingUpload }[] = [];
      for (const file of files) {
        const reason = validateUpload(file);
        const kind = mediaKindOf(file.type);
        if (reason || !kind) {
          rejected.push({ name: file.name, reason: reason ?? "type" });
          continue;
        }
        accepted.push({
          file,
          entry: { id: crypto.randomUUID(), name: file.name, kind, preview: URL.createObjectURL(file), progress: 0 },
        });
      }
      setPending((prev) => [...prev, ...accepted.map((a) => a.entry)]);
      const progress = (id: string, value: number) =>
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, progress: value } : p)));

      const results = await Promise.all(
        accepted.map(async ({ file, entry }): Promise<TrainingMedia | null> => {
          const meta = await readMeta(entry.preview, entry.kind);
          const base: TrainingMedia = {
            id: entry.id,
            ref: entry.preview,
            kind: entry.kind,
            src: entry.preview,
            thumbSrc: entry.kind === "image" ? entry.preview : "",
            folderId,
            mimeType: file.type,
            name: displayName(file.name),
            alt: { fr: "", en: "" },
            category,
            tags: [],
            width: meta.width,
            height: meta.height,
            bytes: file.size,
            durationSeconds: meta.durationSeconds,
            createdAt: new Date().toISOString(),
            origin: "upload",
          };
          try {
            if (!client) {
              // Prototype: a simulated transfer, the file stays in the page.
              await new Promise<void>((resolve) => {
                let elapsed = 0;
                const timer = setInterval(() => {
                  elapsed += MOCK_TICK_MS;
                  progress(entry.id, Math.min(100, Math.round((elapsed / MOCK_UPLOAD_MS) * 100)));
                  if (elapsed >= MOCK_UPLOAD_MS) {
                    clearInterval(timer);
                    resolve();
                  }
                }, MOCK_TICK_MS);
              });
              return base;
            }
            const path = `media/${entry.id}/${storageFileName(file.name)}`;
            await uploadResumable(client, path, file, (value) => progress(entry.id, value));
            // A missing thumbnail is not a failed upload: the grids fall back.
            const thumbBlob = await drawThumbnail(file, entry.kind);
            const thumb = thumbBlob ? await storeThumbnail(entry.id, thumbBlob) : null;
            thumbTried.current.add(entry.id);
            const { error } = await client.from("training_media").insert({
              id: entry.id,
              kind: entry.kind,
              storage_path: path,
              thumb_path: thumb,
              folder_id: folderId,
              mime_type: file.type,
              name: base.name.slice(0, 200),
              category,
              bytes: file.size,
              width: meta.width || null,
              height: meta.height || null,
              duration_seconds: meta.durationSeconds,
            });
            if (error) {
              // The file is useless without its row: remove it again.
              await client.storage.from(BUCKET).remove(thumb ? [path, thumb] : [path]);
              throw error;
            }
            paths.current.set(entry.id, { original: path, thumb });
            const signed = (await sign([entry.id])).get(entry.id);
            URL.revokeObjectURL(entry.preview);
            return { ...base, ref: entry.id, src: signed?.src ?? "", thumbSrc: signed?.thumb ?? "" };
          } catch (error) {
            console.error("Training media upload:", error);
            rejected.push({ name: file.name, reason: "failed" });
            URL.revokeObjectURL(entry.preview);
            return null;
          } finally {
            setPending((prev) => prev.filter((p) => p.id !== entry.id));
          }
        }),
      );
      const added = results.filter((item): item is TrainingMedia => item !== null);
      setItems((prev) => [...added, ...prev]);
      return { added, rejected };
    },
    [client, sign, storeThumbnail],
  );

  const updateMedia = useCallback(
    async (id: string, patch: MediaPatch) => {
      const current = itemsRef.current.find((item) => item.id === id);
      if (!current) return;
      const next = { ...current, ...patch };
      if (client) {
        const { error } = await client
          .from("training_media")
          .update({
            name: next.name.trim().slice(0, 200) || current.name,
            alt_text: next.alt.fr.trim() || null,
            category: next.category,
            tags: next.tags.slice(0, 30),
            folder_id: next.folderId,
          })
          .eq("id", id);
        if (error) throw error;
        const english = next.alt.en.trim();
        const translation = english
          ? await client.from("training_media_translations").upsert({ media_id: id, locale: "en", alt_text: english })
          : await client.from("training_media_translations").delete().eq("media_id", id).eq("locale", "en");
        if (translation.error) throw translation.error;
      }
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
    },
    [client],
  );

  const moveMedia = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (ids.length === 0) return;
      if (client) {
        const { error } = await client.from("training_media").update({ folder_id: folderId }).in("id", ids);
        if (error) throw error;
      }
      const moved = new Set(ids);
      setItems((prev) => prev.map((item) => (moved.has(item.id) ? { ...item, folderId } : item)));
    },
    [client],
  );

  const deleteMedia = useCallback(
    async (id: string): Promise<"deleted" | "inUse"> => {
      const current = itemsRef.current.find((item) => item.id === id);
      if (!current) return "deleted";
      if (client) {
        const { error } = await client.from("training_media").delete().eq("id", id);
        if (error) {
          if (error.code === "23503") return "inUse";
          throw error;
        }
        const entry = paths.current.get(id);
        if (entry) await client.storage.from(BUCKET).remove(entry.thumb ? [entry.original, entry.thumb] : [entry.original]);
        paths.current.delete(id);
      } else if (current.origin === "upload") {
        URL.revokeObjectURL(current.src);
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      return "deleted";
    },
    [client],
  );

  const createFolder = useCallback(
    async (raw: string): Promise<MediaFolder> => {
      const name = cleanFolderName(raw);
      if (!name) throw new FolderError("invalid");
      if (!client) {
        const folder = { id: crypto.randomUUID(), name, position: 0 };
        setFolders((prev) => [...prev, folder]);
        return folder;
      }
      const { data, error } = await client.from("training_media_folders").insert({ name }).select("*").single();
      if (error) throw new FolderError(error.code === "23505" ? "taken" : "failed");
      const folder = rowToFolder(data);
      setFolders((prev) => [...prev, folder]);
      return folder;
    },
    [client],
  );

  const renameFolder = useCallback(
    async (id: string, raw: string) => {
      const name = cleanFolderName(raw);
      if (!name) throw new FolderError("invalid");
      if (client) {
        const { error } = await client.from("training_media_folders").update({ name }).eq("id", id);
        if (error) throw new FolderError(error.code === "23505" ? "taken" : "failed");
      }
      setFolders((prev) => prev.map((folder) => (folder.id === id ? { ...folder, name } : folder)));
    },
    [client],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (client) {
        const { error } = await client.from("training_media_folders").delete().eq("id", id);
        if (error) throw new FolderError("failed");
      }
      // The database unfiles its files (on delete set null); the page follows.
      setFolders((prev) => prev.filter((folder) => folder.id !== id));
      setItems((prev) => prev.map((item) => (item.folderId === id ? { ...item, folderId: null } : item)));
    },
    [client],
  );

  // Older files have no thumbnail: draw them one at a time, once per tab, from
  // the signed original (one download each, then never again).
  const backfillThumbnails = useCallback(() => {
    if (!client || !canManage || backfilling.current) return;
    backfilling.current = true;
    void (async () => {
      try {
        for (;;) {
          const item = itemsRef.current.find(
            (candidate) =>
              !candidate.thumbSrc && candidate.src && !thumbTried.current.has(candidate.id) && paths.current.has(candidate.id),
          );
          if (!item) return;
          thumbTried.current.add(item.id);
          const blob = await drawThumbnail(item.src, item.kind);
          const path = blob ? await storeThumbnail(item.id, blob) : null;
          if (!path) continue;
          const { error } = await client.from("training_media").update({ thumb_path: path }).eq("id", item.id);
          if (error) {
            console.error("Training media thumbnail:", error);
            continue;
          }
          const entry = paths.current.get(item.id);
          if (entry) paths.current.set(item.id, { ...entry, thumb: path });
          const thumb = (await sign([item.id])).get(item.id)?.thumb ?? "";
          setItems((prev) => prev.map((candidate) => (candidate.id === item.id ? { ...candidate, thumbSrc: thumb } : candidate)));
        }
      } finally {
        backfilling.current = false;
      }
    })();
  }, [client, canManage, sign, storeThumbnail]);

  const byRef = useMemo(() => new Map(items.map((item) => [item.ref, item])), [items]);
  const findByRef = useCallback((ref: string) => byRef.get(ref), [byRef]);
  // A reference unknown to the library is shown as-is when it is a URL (prototype
  // courses read by the learner pages), never when it is a database id.
  const urlOf = useCallback(
    (ref: string | undefined) => (ref ? (byRef.get(ref)?.src ?? (isUuid(ref) ? "" : ref)) : ""),
    [byRef],
  );

  const value = useMemo<TrainingMediaValue>(
    () => ({
      source,
      items,
      loading,
      loadFailed,
      reload,
      pending,
      canManage,
      upload,
      updateMedia,
      moveMedia,
      deleteMedia,
      folders,
      createFolder,
      renameFolder,
      deleteFolder,
      backfillThumbnails,
      findByRef,
      urlOf,
    }),
    [
      source,
      items,
      loading,
      loadFailed,
      reload,
      pending,
      canManage,
      upload,
      updateMedia,
      moveMedia,
      deleteMedia,
      folders,
      createFolder,
      renameFolder,
      deleteFolder,
      backfillThumbnails,
      findByRef,
      urlOf,
    ],
  );

  return <TrainingMediaContext.Provider value={value}>{children}</TrainingMediaContext.Provider>;
}

export function useTrainingMedia() {
  const ctx = useContext(TrainingMediaContext);
  if (!ctx) throw new Error("useTrainingMedia must be used within TrainingMediaProvider");
  return ctx;
}
