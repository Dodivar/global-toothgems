import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MEDIA_LIBRARY } from "../data/adminTraining";
import { useAdminAuth } from "./adminAuth";
import { isUuid } from "./adminTrainingMapping";
import { isSupabaseConfigured, supabase, type TypedSupabaseClient } from "./supabase/client";
import { supabasePublishableKey, supabaseUrl } from "./supabase/env";
import type { Database } from "./supabase/database.types";
import {
  displayName,
  mediaKindOf,
  storageFileName,
  validateUpload,
  type MediaCategory,
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
 * point at. The back office shows them through signed URLs, renewed before
 * they expire. Nothing is read until a staff session is open: the provider
 * sits under the root layout.
 *
 * Without Supabase (prototype), the library is the seeded studio photographs
 * and uploads stay in the page (object URLs).
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

export type MediaPatch = Partial<Pick<TrainingMedia, "name" | "alt" | "category" | "tags">>;

interface TrainingMediaValue {
  source: "mock" | "supabase";
  items: TrainingMedia[];
  loading: boolean;
  loadFailed: boolean;
  reload: () => void;
  pending: PendingUpload[];
  /** Validates and uploads; resolves with the new items and the files refused. */
  upload: (files: File[], category: MediaCategory) => Promise<{ added: TrainingMedia[]; rejected: RejectedUpload[] }>;
  updateMedia: (id: string, patch: MediaPatch) => Promise<void>;
  /** "inUse" when a course still points at the file (the database refuses it). */
  deleteMedia: (id: string) => Promise<"deleted" | "inUse">;
  /** The library entry behind a course's media reference, when there is one. */
  findByRef: (ref: string) => TrainingMedia | undefined;
  /** A displayable URL for a media reference ("" when there is nothing to show yet). */
  urlOf: (ref: string | undefined) => string;
}

const TrainingMediaContext = createContext<TrainingMediaValue | null>(null);

const BUCKET = "training-media";
/** Signed URLs last an hour and are renewed every 45 minutes. */
const SIGNED_URL_SECONDS = 3600;
const RESIGN_MS = 45 * 60 * 1000;
/** Prototype upload time, so the progress state is visible. */
const MOCK_UPLOAD_MS = 1200;
const MOCK_TICK_MS = 80;

type MediaRow = Database["public"]["Tables"]["training_media"]["Row"] & {
  training_media_translations: Database["public"]["Tables"]["training_media_translations"]["Row"][];
};

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

function rowToMedia(row: MediaRow, src: string): TrainingMedia {
  const en = row.training_media_translations.find((t) => t.locale === "en");
  return {
    id: row.id,
    ref: row.id,
    kind: row.kind as MediaKind,
    src,
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
      metadata: { bucketName: BUCKET, objectName: path, contentType: file.type, cacheControl: "3600" },
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
  const [loading, setLoading] = useState(source === "supabase");
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadCount, setLoadCount] = useState(0);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  // Storage paths by media id, to sign and delete files.
  const paths = useRef(new Map<string, string>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const sign = useCallback(
    async (ids: string[]): Promise<Map<string, string>> => {
      const signed = new Map<string, string>();
      const list = ids.map((id) => paths.current.get(id)).filter((p): p is string => Boolean(p));
      if (!client || list.length === 0) return signed;
      const { data } = await client.storage.from(BUCKET).createSignedUrls(list, SIGNED_URL_SECONDS);
      const byPath = new Map((data ?? []).map((entry) => [entry.path, entry.signedUrl]));
      for (const id of ids) {
        const url = byPath.get(paths.current.get(id) ?? "");
        if (url) signed.set(id, url);
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
      const { data, error } = await client
        .from("training_media")
        .select("*, training_media_translations(*)")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("Training media:", error);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      const rows = data as MediaRow[];
      for (const row of rows) paths.current.set(row.id, row.storage_path);
      const signed = await sign(rows.map((row) => row.id));
      if (cancelled) return;
      setItems(rows.map((row) => rowToMedia(row, signed.get(row.id) ?? "")));
      setLoadFailed(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enabled, loadCount, sign]);

  // Signed URLs expire: renew them while the back office stays open.
  useEffect(() => {
    if (!client || !enabled) return;
    const timer = setInterval(async () => {
      const signed = await sign(itemsRef.current.map((item) => item.id));
      setItems((prev) => prev.map((item) => ({ ...item, src: signed.get(item.id) ?? item.src })));
    }, RESIGN_MS);
    return () => clearInterval(timer);
  }, [client, enabled, sign]);

  const reload = useCallback(() => setLoadCount((n) => n + 1), []);

  const upload = useCallback(
    async (files: File[], category: MediaCategory) => {
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
            const { error } = await client.from("training_media").insert({
              id: entry.id,
              kind: entry.kind,
              storage_path: path,
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
              await client.storage.from(BUCKET).remove([path]);
              throw error;
            }
            paths.current.set(entry.id, path);
            const signed = await sign([entry.id]);
            URL.revokeObjectURL(entry.preview);
            return { ...base, ref: entry.id, src: signed.get(entry.id) ?? "" };
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
    [client, sign],
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
        const path = paths.current.get(id);
        if (path) await client.storage.from(BUCKET).remove([path]);
        paths.current.delete(id);
      } else if (current.origin === "upload") {
        URL.revokeObjectURL(current.src);
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      return "deleted";
    },
    [client],
  );

  const byRef = useMemo(() => new Map(items.map((item) => [item.ref, item])), [items]);
  const findByRef = useCallback((ref: string) => byRef.get(ref), [byRef]);
  // A reference unknown to the library is shown as-is when it is a URL (prototype
  // courses read by the learner pages), never when it is a database id.
  const urlOf = useCallback(
    (ref: string | undefined) => (ref ? byRef.get(ref)?.src ?? (isUuid(ref) ? "" : ref) : ""),
    [byRef],
  );

  const value = useMemo<TrainingMediaValue>(
    () => ({ source, items, loading, loadFailed, reload, pending, upload, updateMedia, deleteMedia, findByRef, urlOf }),
    [source, items, loading, loadFailed, reload, pending, upload, updateMedia, deleteMedia, findByRef, urlOf],
  );

  return <TrainingMediaContext.Provider value={value}>{children}</TrainingMediaContext.Provider>;
}

export function useTrainingMedia() {
  const ctx = useContext(TrainingMediaContext);
  if (!ctx) throw new Error("useTrainingMedia must be used within TrainingMediaProvider");
  return ctx;
}
