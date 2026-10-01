/**
 * Course price and course promotions, in integer minor units.
 *
 * A course is not a shop product (owner's decision, 2026-10-01): its price
 * lives on the course and its promotions are their own, simpler mechanism — a
 * dated percentage or amount off one course, at most one running at a time.
 * The database is the authority (`course_promotions` guard, view
 * `course_current_prices`); this module mirrors the same arithmetic so the
 * back office can show the resulting price while an administrator types, and
 * validates the same rules before sending, so a refusal is the exception.
 */

export type CourseDiscountType = "percentage" | "amount";

export interface CoursePromotion {
  id: string;
  courseId: string;
  /** Internal label, back office only ("Black Friday"). */
  label: string;
  discountType: CourseDiscountType;
  /** Whole percent (1–99) for `percentage`; minor units for `amount`. */
  value: number;
  /** ISO timestamps; `endsAt` null = open-ended. */
  startsAt: string;
  endsAt: string | null;
  active: boolean;
}

/** Price after a discount, in minor units. Rounded half away from zero like the database. */
export function discountedPrice(priceMinor: number, type: CourseDiscountType, value: number): number {
  if (type === "percentage") return Math.round((priceMinor * (100 - value)) / 100);
  return Math.max(priceMinor - value, 0);
}

export function isRunning(promotion: CoursePromotion, at: Date): boolean {
  if (!promotion.active) return false;
  const now = at.getTime();
  return new Date(promotion.startsAt).getTime() <= now && (promotion.endsAt === null || new Date(promotion.endsAt).getTime() > now);
}

export type PromotionState = "running" | "scheduled" | "ended" | "inactive";

export function promotionState(promotion: CoursePromotion, at: Date): PromotionState {
  if (!promotion.active) return "inactive";
  if (isRunning(promotion, at)) return "running";
  return new Date(promotion.startsAt).getTime() > at.getTime() ? "scheduled" : "ended";
}

/** The course's price right now: its running promotion applied, if any. */
export function currentPrice(
  priceMinor: number,
  promotions: CoursePromotion[],
  at: Date,
): { priceMinor: number; promotion: CoursePromotion | null } {
  const running = promotions
    .filter((p) => isRunning(p, at))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
  if (!running) return { priceMinor, promotion: null };
  return { priceMinor: discountedPrice(priceMinor, running.discountType, running.value), promotion: running };
}

export type PromotionProblem = "label" | "value" | "percentRange" | "amountTooHigh" | "start" | "period" | "overlap";

/** Same rules as the database guard, checked before saving. */
export function promotionProblems(
  promotion: CoursePromotion,
  priceMinor: number,
  others: CoursePromotion[],
): PromotionProblem[] {
  const problems: PromotionProblem[] = [];
  if (promotion.label.trim() === "") problems.push("label");
  if (!Number.isInteger(promotion.value) || promotion.value <= 0) problems.push("value");
  else if (promotion.discountType === "percentage" && promotion.value >= 100) problems.push("percentRange");
  else if (promotion.discountType === "amount" && promotion.value >= priceMinor) problems.push("amountTooHigh");
  const start = Date.parse(promotion.startsAt);
  const end = promotion.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(promotion.endsAt);
  if (Number.isNaN(start)) problems.push("start");
  else if (Number.isNaN(end) || end <= start) problems.push("period");
  else if (
    promotion.active &&
    others.some((other) => {
      if (other.id === promotion.id || !other.active) return false;
      const otherStart = Date.parse(other.startsAt);
      const otherEnd = other.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(other.endsAt);
      return start < otherEnd && otherStart < end;
    })
  ) {
    problems.push("overlap");
  }
  return problems;
}

/** Minor units → the decimal string the database functions accept ("349.00"). */
export function minorToDecimalString(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * A price typed by an administrator ("349", "349,9", "349.90") → minor units,
 * or null when it is not a valid amount. No floating point: the text is split.
 */
export function parsePriceInput(text: string): number | null {
  const value = text.trim().replace(/\s/g, "").replace(",", ".");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
