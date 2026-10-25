import type { Localized } from "../data/types";
import type { Json } from "./supabase/database.types";

/**
 * Back-office FAQ groups (`/admin/faq`, migration `…_product_specs_faq`): a set
 * of questions written once and assigned to products and categories. Pure
 * row ↔ form mapping and validation; the database enforces the same limits
 * (`admin_save_faq_group()`), these only spare a round trip.
 *
 * Rule shown to the administrator, applied by `product_faq()`: a product with
 * a published group of its own shows only its own; otherwise its category's.
 */

export type FaqStatus = "draft" | "published";

export interface AdminFaqItem {
  id: string;
  question: Localized;
  answer: Localized;
}

export interface AdminFaqGroup {
  id: string;
  /** Back office only, never shown to customers. */
  name: string;
  status: FaqStatus;
  position: number;
  items: AdminFaqItem[];
  productIds: string[];
  categoryIds: string[];
  updatedAt: string;
}

export const FAQ_LIMITS = { name: 120, question: 300, answer: 2000, items: 50 } as const;

/** What the admin reads: groups with their questions, translations and assignments. */
export const ADMIN_FAQ_SELECT = `
  id, name, status, position, updated_at,
  faq_items ( id, question, answer, position, faq_item_translations ( locale, question, answer ) ),
  product_faq_groups ( product_id ),
  category_faq_groups ( category_id )
`;

export interface FaqGroupRow {
  id: string;
  name: string;
  status: string;
  position: number;
  updated_at: string;
  faq_items: {
    id: string;
    question: string;
    answer: string;
    position: number;
    faq_item_translations: { locale: string; question: string; answer: string }[] | null;
  }[] | null;
  product_faq_groups: { product_id: string }[] | null;
  category_faq_groups: { category_id: string }[] | null;
}

export function rowToGroup(row: FaqGroupRow): AdminFaqGroup {
  return {
    id: row.id,
    name: row.name,
    status: row.status === "published" ? "published" : "draft",
    position: row.position,
    items: [...(row.faq_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => {
        const en = item.faq_item_translations?.find((t) => t.locale === "en");
        return {
          id: item.id,
          question: { fr: item.question, en: en?.question ?? "" },
          answer: { fr: item.answer, en: en?.answer ?? "" },
        };
      }),
    productIds: (row.product_faq_groups ?? []).map((link) => link.product_id),
    categoryIds: (row.category_faq_groups ?? []).map((link) => link.category_id),
    updatedAt: row.updated_at,
  };
}

/** Groups in the order a product page shows them when it has several. */
export function sortGroups(groups: AdminFaqGroup[]): AdminFaqGroup[] {
  return [...groups].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}

/** Payload of `admin_save_faq_group()`: the complete group, its ordered questions and its assignments. */
export function groupToPayload(group: AdminFaqGroup): Json {
  return {
    id: group.id,
    name: group.name.trim(),
    status: group.status,
    items: group.items.map((item) => ({
      id: item.id,
      question: item.question.fr.trim(),
      answer: item.answer.fr.trim(),
      question_en: item.question.en.trim(),
      answer_en: item.answer.en.trim(),
    })),
    product_ids: [...new Set(group.productIds)],
    category_ids: [...new Set(group.categoryIds)],
  };
}

export type FaqGroupError = "name" | "noQuestion" | "tooMany" | "question" | "answer";

/** What blocks a save, in the order the form shows it; empty = ready. */
export function validateGroup(group: AdminFaqGroup): { group: FaqGroupError[]; items: Record<string, ("question" | "answer")[]> } {
  const errors: FaqGroupError[] = [];
  const items: Record<string, ("question" | "answer")[]> = {};
  const name = group.name.trim();
  if (!name || name.length > FAQ_LIMITS.name) errors.push("name");
  if (group.status === "published" && group.items.length === 0) errors.push("noQuestion");
  if (group.items.length > FAQ_LIMITS.items) errors.push("tooMany");
  for (const item of group.items) {
    const wrong: ("question" | "answer")[] = [];
    const q = item.question.fr.trim();
    const a = item.answer.fr.trim();
    if (!q || q.length > FAQ_LIMITS.question || item.question.en.trim().length > FAQ_LIMITS.question) wrong.push("question");
    if (!a || a.length > FAQ_LIMITS.answer || item.answer.en.trim().length > FAQ_LIMITS.answer) wrong.push("answer");
    if (wrong.length > 0) items[item.id] = wrong;
  }
  if (Object.keys(items).some((id) => items[id].includes("question"))) errors.push("question");
  if (Object.keys(items).some((id) => items[id].includes("answer"))) errors.push("answer");
  return { group: errors, items };
}

/** An English translation only reaches customers once both texts are written. */
export function isTranslated(item: AdminFaqItem): boolean {
  return item.question.en.trim() !== "" && item.answer.en.trim() !== "";
}

/** The groups that reach a product's page, by the database's rule. */
export function groupsShownOn(
  groups: AdminFaqGroup[],
  product: { id: string; categoryId: string },
): { groups: AdminFaqGroup[]; source: "product" | "category" | "none" } {
  const published = sortGroups(groups.filter((g) => g.status === "published"));
  const own = published.filter((g) => g.productIds.includes(product.id));
  if (own.length > 0) return { groups: own, source: "product" };
  const fromCategory = published.filter((g) => g.categoryIds.includes(product.categoryId));
  return fromCategory.length > 0 ? { groups: fromCategory, source: "category" } : { groups: [], source: "none" };
}

export function newGroup(id: string): AdminFaqGroup {
  return { id, name: "", status: "draft", position: 0, items: [], productIds: [], categoryIds: [], updatedAt: "" };
}

export function newItem(id: string): AdminFaqItem {
  return { id, question: { fr: "", en: "" }, answer: { fr: "", en: "" } };
}

export function readErrorOf(error: { code?: string; message?: string } | null): "forbidden" | "error" {
  if (error?.code === "42501" || error?.message?.includes("permission denied")) return "forbidden";
  return "error";
}
