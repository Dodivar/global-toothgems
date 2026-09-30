import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { MEDIA_LIBRARY } from "../data/adminTraining";
import {
  displayName,
  validateUpload,
  type MediaCategory,
  type TrainingMedia,
  type UploadRejection,
} from "./trainingMediaRules";

/**
 * The training image library, as a frontend store.
 *
 * Seeded with the studio photographs the courses already use, so the library
 * opens on real material. Uploads are real files chosen or dropped by the
 * administrator: they are validated, previewed from a local object URL and
 * "uploaded" with a simulated progress bar — there is no storage behind the
 * prototype yet. The body of `upload` is where the call to the private
 * `training-media` bucket goes; the dialog above it does not change.
 *
 * Kept apart from the product media on purpose (see `trainingMediaRules.ts`).
 * Mounted beside the course store rather than inside the admin layout, so an
 * upload survives leaving the back office to read the lesson as a learner.
 */

/** Per-file simulated transfer time, so the progress state is visible. */
const UPLOAD_MS = 1200;
const UPLOAD_TICK_MS = 80;

export interface PendingUpload {
  id: string;
  name: string;
  preview: string;
  progress: number;
}

export interface RejectedUpload {
  name: string;
  reason: UploadRejection;
}

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
      src: entry.src,
      name: meta?.name ?? entry.id,
      alt: { ...entry.label },
      category: meta?.category ?? "technique",
      tags: meta?.tags ?? [],
      width: meta?.width ?? 0,
      height: meta?.height ?? 0,
      bytes: meta?.bytes ?? 0,
      createdAt: `${meta?.date ?? "2026-01-01"}T09:00:00.000Z`,
      origin: "library",
    };
  });
}

let seq = 0;
const newId = () => `tm-${Date.now().toString(36)}-${(++seq).toString(36)}`;

function readDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = src;
  });
}

interface TrainingMediaValue {
  items: TrainingMedia[];
  pending: PendingUpload[];
  /** Validates and uploads; resolves with the new items and the files refused. */
  upload: (files: File[], category: MediaCategory) => Promise<{ added: TrainingMedia[]; rejected: RejectedUpload[] }>;
  updateMedia: (id: string, patch: Partial<Pick<TrainingMedia, "name" | "alt" | "category" | "tags">>) => void;
  deleteMedia: (id: string) => void;
  /** The library entry behind an image URL, when there is one. */
  findBySrc: (src: string) => TrainingMedia | undefined;
}

const TrainingMediaContext = createContext<TrainingMediaValue | null>(null);

export function TrainingMediaProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TrainingMedia[]>(seedLibrary);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  // Uploaded previews live as long as the page: an image inserted into a
  // lesson must keep showing wherever that lesson is read. Only deleting an
  // (unused) upload releases its URL.
  const objectUrls = useRef<string[]>([]);

  const upload = useCallback(async (files: File[], category: MediaCategory) => {
    const rejected: RejectedUpload[] = [];
    const accepted: { file: File; pending: PendingUpload }[] = [];
    for (const file of files) {
      const reason = validateUpload(file);
      if (reason) {
        rejected.push({ name: file.name, reason });
        continue;
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.push(preview);
      accepted.push({ file, pending: { id: newId(), name: file.name, preview, progress: 0 } });
    }
    setPending((prev) => [...prev, ...accepted.map((a) => a.pending)]);

    const added = await Promise.all(
      accepted.map(async ({ file, pending: entry }) => {
        const [dimensions] = await Promise.all([
          readDimensions(entry.preview),
          new Promise<void>((resolve) => {
            let elapsed = 0;
            const timer = setInterval(() => {
              elapsed += UPLOAD_TICK_MS;
              const progress = Math.min(100, Math.round((elapsed / UPLOAD_MS) * 100));
              setPending((prev) => prev.map((p) => (p.id === entry.id ? { ...p, progress } : p)));
              if (progress >= 100) {
                clearInterval(timer);
                resolve();
              }
            }, UPLOAD_TICK_MS);
          }),
        ]);
        const name = displayName(file.name);
        const media: TrainingMedia = {
          id: entry.id,
          src: entry.preview,
          name,
          alt: { fr: "", en: "" },
          category,
          tags: [],
          width: dimensions.width,
          height: dimensions.height,
          bytes: file.size,
          createdAt: new Date().toISOString(),
          origin: "upload",
        };
        setPending((prev) => prev.filter((p) => p.id !== entry.id));
        setItems((prev) => [media, ...prev]);
        return media;
      }),
    );
    return { added, rejected };
  }, []);

  const updateMedia = useCallback<TrainingMediaValue["updateMedia"]>((id, patch) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const deleteMedia = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.origin === "upload") {
        URL.revokeObjectURL(target.src);
        objectUrls.current = objectUrls.current.filter((url) => url !== target.src);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const findBySrc = useCallback((src: string) => items.find((item) => item.src === src), [items]);

  const value = useMemo(
    () => ({ items, pending, upload, updateMedia, deleteMedia, findBySrc }),
    [items, pending, upload, updateMedia, deleteMedia, findBySrc],
  );

  return <TrainingMediaContext.Provider value={value}>{children}</TrainingMediaContext.Provider>;
}

export function useTrainingMedia() {
  const ctx = useContext(TrainingMediaContext);
  if (!ctx) throw new Error("useTrainingMedia must be used within TrainingMediaProvider");
  return ctx;
}
