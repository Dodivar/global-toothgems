import type { Localized } from "../types";

/**
 * Content model for the legal and help pages.
 *
 * Every page in the help centre is data rendered by one layout, so the
 * difference between "what the law says", "what the shop decided", "what the
 * customer has to do" and "what nobody has confirmed yet" is carried by the
 * block's `kind`/`tone` rather than by whoever writes the copy remembering to
 * style it. The layout then labels each one with an icon and a word, never
 * colour alone.
 *
 * Inline markup inside any `Localized` string (see `RichText`):
 *   [[Label]]    — a value to verify before publication
 *   [[!Label]]   — business information that must be supplied
 *   <<text|/to>> — an internal link
 *   **text**     — emphasis
 */

/**
 * - `legal`: what the law provides, independent of the shop's choices.
 * - `policy`: a decision the business makes (and must confirm).
 * - `instruction`: what the customer has to do.
 * - `verify`: an open question for the business before publication.
 */
export type CalloutTone = "legal" | "policy" | "instruction" | "verify";

export type IconKey =
  | "eye"
  | "pencil"
  | "trash"
  | "pause"
  | "hand"
  | "download"
  | "undo"
  | "scale"
  | "cart"
  | "cog"
  | "truck"
  | "package"
  | "map"
  | "home"
  | "mail"
  | "search"
  | "wallet"
  | "check"
  | "clipboard";

export interface BusinessField {
  label: Localized;
  /** The value to publish. Absent means it has not been supplied yet. */
  value?: Localized;
  /** What to supply, shown as a placeholder when `value` is absent. */
  placeholder?: Localized;
  /** Optional hint under the row, e.g. "only if registered for VAT". */
  hint?: Localized;
}

export interface TableColumn {
  key: string;
  label: Localized;
}

export type Block =
  | { kind: "p"; text: Localized }
  | { kind: "list"; items: Localized[]; ordered?: boolean }
  | { kind: "callout"; tone: CalloutTone; title?: Localized; text: Localized; items?: Localized[] }
  | { kind: "fields"; fields: BusinessField[] }
  | { kind: "table"; caption: Localized; columns: TableColumn[]; rows: Record<string, Localized>[] }
  | { kind: "cards"; items: { icon: IconKey; title: Localized; text: Localized }[] }
  | { kind: "steps"; label: Localized; items: { icon: IconKey; title: Localized; text: Localized }[] }
  /** A reviewer-only note: hidden when review annotations are switched off. */
  | { kind: "internal"; text: Localized }
  /** Interactive panel rendered by the page (e.g. the current cookie choices). */
  | { kind: "widget"; widget: "cookieChoices" };

export interface LegalSection {
  id: string;
  title: Localized;
  /** Starts a new group in the table of contents. */
  part?: Localized;
  blocks: Block[];
}

export type ContactCategory =
  | "order"
  | "delivery"
  | "returns"
  | "product"
  | "training"
  | "technical"
  | "privacy"
  | "professional"
  | "other";

export interface LegalDocument {
  id: string;
  path: string;
  eyebrow: Localized;
  title: Localized;
  intro: Localized;
  /** Draft date, ISO. Replaced with the publication date on release. */
  updated: string;
  /** Numbered clauses (terms, policies) rather than a free-form help page. */
  numbered?: boolean;
  /** Show the four-way content key under the header. */
  showKey?: boolean;
  /** Blocks shown between the header and the first section. */
  lead?: Block[];
  sections: LegalSection[];
  /** Pre-selects the contact form's category from the closing CTA. */
  contactCategory: ContactCategory;
}

/** Shorthand for bilingual content: French first, as everywhere in the app. */
export const l = (fr: string, en: string): Localized => ({ fr, en });

/** Draft date shown as "last updated" on every document until publication. */
export const DRAFT_DATE = "2026-09-23";
