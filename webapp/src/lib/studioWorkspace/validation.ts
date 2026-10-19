import { COLLECTION_COLORS, FEEDBACK_CATEGORIES, type CollectionDetails, type FeedbackInput, type RecordDetails } from "./types";

/**
 * Rules for what the Studio workspace accepts, shared by the dialogs (to say
 * what is wrong) and the repositories (to refuse it). The database repeats
 * them as check constraints; these are the same numbers.
 */

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
export const COLLECTION_NAME_MAX = 40;
export const FEEDBACK_MESSAGE_MIN = 3;
export const FEEDBACK_MESSAGE_MAX = 2000;

/** "  butterfly   wings " → "butterfly wings". */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export type DetailsError = "nameMissing" | "nameTooLong" | "descriptionTooLong";

export function normalizeDetails(details: RecordDetails): RecordDetails {
  return {
    name: squash(details.name),
    description: details.description.trim(),
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

export type CollectionError = "nameMissing" | "nameTooLong" | "nameTaken" | "colorInvalid";

export function normalizeCollection(details: CollectionDetails): CollectionDetails {
  return { name: squash(details.name), color: details.color };
}

/**
 * A collection's name and colour. `taken`: the names of the member's other
 * collections, compared ignoring case, as the database's unique index does.
 */
export function validateCollection(details: CollectionDetails, taken: string[] = []): CollectionError | null {
  const d = normalizeCollection(details);
  if (!d.name) return "nameMissing";
  if (d.name.length > COLLECTION_NAME_MAX) return "nameTooLong";
  if (d.color !== null && !COLLECTION_COLORS.includes(d.color)) return "colorInvalid";
  const key = d.name.toLocaleLowerCase();
  if (taken.some((n) => n.toLocaleLowerCase() === key)) return "nameTaken";
  return null;
}

/** "Crystal Smile" → "Crystal Smile (copy)", cut so the result still fits. */
export function copyName(name: string, suffix: string): string {
  const tail = ` ${suffix}`;
  return `${name.slice(0, NAME_MAX - tail.length).trim()}${tail}`;
}
