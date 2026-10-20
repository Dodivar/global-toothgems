import { supabase } from "../supabase/client";
import { BUCKETS } from "../supabase/storage";
import { parseShareBranding, type ShareBranding } from "../studio3d/socialExport/branding";

/**
 * The persistence boundary of social export branding (decision 101):
 *
 *   load()          → `studio_share_branding()`: the plan tier and the member's logo
 *   downloadLogo()  → the logo file, from the private `studio-share-logos` bucket
 *                     (readable only while the plan allows it — storage policy)
 *   saveLogo(png)   → a new file `<user id>/logo-<uuid>.png`, recorded by
 *                     `studio_set_share_logo()`; the previous file is then removed
 *   removeLogo()    → `studio_set_share_logo('')` and the file removed (always allowed)
 *
 * The database refuses the upload and the record to essential members
 * (42501); the page maps that to the plan message.
 */

export class ShareBrandingError extends Error {
  readonly kind: "unavailable" | "forbidden";
  constructor(kind: "unavailable" | "forbidden") {
    super(kind);
    this.kind = kind;
    this.name = "ShareBrandingError";
  }
}

function client() {
  if (!supabase) throw new ShareBrandingError("unavailable");
  return supabase;
}

const forbidden = (error: { code?: string; statusCode?: string | number; message?: string } | null) =>
  !!error && (error.code === "42501" || String(error.statusCode) === "403" || /row-level security/i.test(error.message ?? ""));

export async function loadShareBranding(): Promise<ShareBranding> {
  const { data, error } = await client().rpc("studio_share_branding");
  if (error) throw new ShareBrandingError("unavailable");
  const parsed = parseShareBranding(data);
  if (!parsed) throw new ShareBrandingError("unavailable");
  return parsed;
}

export async function downloadShareLogo(path: string): Promise<Blob> {
  const { data, error } = await client().storage.from(BUCKETS.studioShareLogos).download(path);
  if (error || !data) throw new ShareBrandingError(forbidden(error as never) ? "forbidden" : "unavailable");
  return data;
}

async function removeFile(path: string | null) {
  if (!path) return;
  // Best effort: a leftover file is only the member's own, and never shown.
  await client().storage.from(BUCKETS.studioShareLogos).remove([path]).catch(() => undefined);
}

/** Stores a prepared PNG as the member's logo; returns its path. */
export async function saveShareLogo(userId: string, png: Blob): Promise<string> {
  const db = client();
  const path = `${userId}/logo-${crypto.randomUUID()}.png`;
  const upload = await db.storage.from(BUCKETS.studioShareLogos).upload(path, png, { contentType: "image/png", upsert: false });
  if (upload.error) throw new ShareBrandingError(forbidden(upload.error as never) ? "forbidden" : "unavailable");
  const { data: previous, error } = await db.rpc("studio_set_share_logo", { p_path: path });
  if (error) {
    await removeFile(path);
    throw new ShareBrandingError(forbidden(error) ? "forbidden" : "unavailable");
  }
  await removeFile(typeof previous === "string" ? previous : null);
  return path;
}

export async function removeShareLogo(): Promise<void> {
  const { data: previous, error } = await client().rpc("studio_set_share_logo", { p_path: "" });
  if (error) throw new ShareBrandingError("unavailable");
  await removeFile(typeof previous === "string" ? previous : null);
}
