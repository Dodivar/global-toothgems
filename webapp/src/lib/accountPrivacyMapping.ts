/**
 * Pure readers for the member's privacy rights (decision 125): what
 * `my_personal_data()`, `my_account_erasure_blockers()` and the Edge Function
 * `delete-account` answer, turned into shapes the Security page shows. Nothing
 * here decides anything: the database and the function do.
 */

/** Why an erasure cannot happen now; each one tells the member how to lift it. */
export const ERASURE_BLOCKERS = ["staff", "studio_subscription", "studio_withdrawal", "order_payment_pending"] as const;
export type ErasureBlocker = (typeof ERASURE_BLOCKERS)[number];

export type ExportAnswer =
  | { kind: "ok"; archive: Record<string, unknown> }
  | { kind: "tooSoon"; retryAt: string }
  | { kind: "error" };

export type DeleteAnswer =
  | { kind: "deleted" }
  | { kind: "blocked"; blockers: ErasureBlocker[] }
  | { kind: "reauthenticate" }
  | { kind: "signedOut" }
  | { kind: "error" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function readExportAnswer(data: unknown): ExportAnswer {
  if (!isRecord(data)) return { kind: "error" };
  if (data.status === "ok" && isRecord(data.archive)) return { kind: "ok", archive: data.archive };
  if (data.status === "too_soon" && typeof data.retry_at === "string" && !Number.isNaN(Date.parse(data.retry_at))) {
    return { kind: "tooSoon", retryAt: data.retry_at };
  }
  return { kind: "error" };
}

/** Known blockers only, once each, in a stable order; `sign_in_required` is not one the member can lift here. */
export function readBlockers(data: unknown): ErasureBlocker[] {
  if (!Array.isArray(data)) return [];
  const found = new Set(data.filter((v): v is string => typeof v === "string"));
  return ERASURE_BLOCKERS.filter((b) => found.has(b));
}

export function readDeleteAnswer(status: number, body: unknown): DeleteAnswer {
  const record = isRecord(body) ? body : {};
  if (status === 200 && record.status === "deleted") return { kind: "deleted" };
  if (status === 409 && record.error === "blocked") {
    const blockers = readBlockers(record.blockers);
    return blockers.length > 0 ? { kind: "blocked", blockers } : { kind: "error" };
  }
  if (status === 403 && record.error === "reauthentication_required") return { kind: "reauthenticate" };
  if (status === 401) return { kind: "signedOut" };
  return { kind: "error" };
}

export interface ArchiveFile {
  bucket: string;
  path: string;
}

/** The Storage files the archive lists (`files`), to which the browser adds download links. */
export function archiveFiles(archive: Record<string, unknown>): ArchiveFile[] {
  const files = archive.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) =>
    isRecord(f) && typeof f.bucket === "string" && typeof f.path === "string" ? [{ bucket: f.bucket, path: f.path }] : [],
  );
}

/**
 * The archive with a download link on each file the member could sign
 * (`links`: "bucket/path" → URL) and the links' expiry; files without a link
 * keep their path only.
 */
export function withFileLinks(
  archive: Record<string, unknown>,
  links: ReadonlyMap<string, string>,
  linksExpireAt: string,
): Record<string, unknown> {
  if (!Array.isArray(archive.files)) return archive;
  const files = archive.files.map((f) => {
    if (!isRecord(f) || typeof f.bucket !== "string" || typeof f.path !== "string") return f;
    const url = links.get(`${f.bucket}/${f.path}`);
    return url ? { ...f, download_url: url } : f;
  });
  return { ...archive, files, file_links_expire_at: links.size > 0 ? linksExpireAt : null };
}

/** `global-toothgems-mes-donnees-2026-11-06.json` */
export function archiveFileName(generatedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt)?.[0] ?? "export";
  return `global-toothgems-mes-donnees-${day}.json`;
}

/** Whether the account can confirm with a password (else: Google or Apple only, signs in again with it). */
export function hasPasswordSignIn(providers: unknown): boolean {
  return Array.isArray(providers) && providers.includes("email");
}

/** How the member confirms a sensitive step: the password, else a fresh sign-in with the provider the account has. */
export type ReauthMethod = "password" | "google" | "apple";

export function reauthMethodOf(providers: unknown): ReauthMethod {
  if (hasPasswordSignIn(providers)) return "password";
  const list = Array.isArray(providers) ? providers : [];
  return list.includes("apple") && !list.includes("google") ? "apple" : "google";
}
