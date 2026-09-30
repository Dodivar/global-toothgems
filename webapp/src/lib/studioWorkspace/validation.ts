import { FEEDBACK_CATEGORIES, type FeedbackInput, type RecordDetails } from "./types";

/**
 * Rules for what the Studio workspace accepts, shared by the dialogs (to say
 * what is wrong) and the repositories (to refuse it). The database repeats
 * them as check constraints; these are the same numbers.
 */

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
export const TAG_MAX = 24;
export const TAGS_MAX = 8;
export const FEEDBACK_MESSAGE_MIN = 3;
export const FEEDBACK_MESSAGE_MAX = 2000;

/** "  butterfly   wings " → "butterfly wings". */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Trimmed, de-duplicated (ignoring case), each cut to the limit, at most `TAGS_MAX`. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = squash(raw.replace(/^#/, "")).slice(0, TAG_MAX);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === TAGS_MAX) break;
  }
  return out;
}

/** A comma-typed tag list, as the dialogs' tag field produces it. */
export function parseTagList(text: string): string[] {
  return normalizeTags(text.split(","));
}

export type DetailsError = "nameMissing" | "nameTooLong" | "descriptionTooLong";

export function normalizeDetails(details: RecordDetails): RecordDetails {
  return {
    name: squash(details.name),
    description: details.description.trim(),
    tags: normalizeTags(details.tags),
  };
}

export function validateDetails(details: RecordDetails): DetailsError | null {
  const d = normalizeDetails(details);
  if (!d.name) return "nameMissing";
  if (d.name.length > NAME_MAX) return "nameTooLong";
  if (d.description.length > DESCRIPTION_MAX) return "descriptionTooLong";
  return null;
}

export type FeedbackError = "ratingMissing" | "messageTooShort" | "messageTooLong" | "categoryInvalid";

export function validateFeedback(input: Pick<FeedbackInput, "rating" | "category" | "message">): FeedbackError | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return "ratingMissing";
  if (!FEEDBACK_CATEGORIES.includes(input.category)) return "categoryInvalid";
  const message = input.message.trim();
  if (message.length < FEEDBACK_MESSAGE_MIN) return "messageTooShort";
  if (message.length > FEEDBACK_MESSAGE_MAX) return "messageTooLong";
  return null;
}

/** "Crystal Smile" → "Crystal Smile (copy)", cut so the result still fits. */
export function copyName(name: string, suffix: string): string {
  const tail = ` ${suffix}`;
  return `${name.slice(0, NAME_MAX - tail.length).trim()}${tail}`;
}
