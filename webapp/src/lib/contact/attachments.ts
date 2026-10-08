/**
 * The contact form's attachment rules, shared by the screen (to tell the visitor early) and
 * checked again by the Edge Function `submit-contact-request` (which also reads the files'
 * content). Pure, so it is unit-tested without a browser.
 */

export const MAX_ATTACHMENTS = 5;
/** 20 MB in all, not per file. */
export const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_ATTACHMENTS = ".jpg,.jpeg,.png,.pdf";

const EXTENSION = /\.(jpe?g|png|pdf)$/i;

export type AttachmentProblem = "count" | "size" | "type";

interface FileLike {
  name: string;
  size: number;
}

/** The first rule the set breaks, or null when it can be sent. */
export function attachmentProblem(files: readonly FileLike[]): AttachmentProblem | null {
  if (files.some((file) => !EXTENSION.test(file.name))) return "type";
  if (files.length > MAX_ATTACHMENTS) return "count";
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENTS_BYTES) return "size";
  return null;
}

/** Adds newly picked files, ignoring one already in the list (same name, size and date). */
export function mergeAttachments<T extends FileLike & { lastModified?: number }>(current: readonly T[], picked: readonly T[]): T[] {
  const same = (a: T, b: T) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  const merged = [...current];
  for (const file of picked) if (!merged.some((existing) => same(existing, file))) merged.push(file);
  return merged;
}
