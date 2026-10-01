import { useTranslation } from "react-i18next";
import { getProduct } from "../../data/products";
import { DEFAULT_MENU_THUMB } from "../../data/menu";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { lessonCount } from "../../lib/academy/publicCourse";
import { formatDuration } from "../../lib/trainingFilters";
import { pick } from "../../data/types";
import { useCart } from "../../lib/cart";
import { toMajorUnits } from "../../lib/catalog/money";
import type { RegistrationContext } from "../../lib/registration";

/** What the summary card shows, resolved from the context and the live cart. */
export interface ContextItem {
  image: string;
  title: string;
  subtitle?: string;
  price: number;
  qty?: number;
  /** Other cart lines beyond the one shown. */
  moreCount?: number;
  subtotal?: number;
  priceNote?: string;
}

/**
 * Resolves the product or course the visitor was on their way to buy. A
 * product named in the URL wins; otherwise the cart's first line stands for the
 * cart, with the rest summarised, so the card always matches what is actually
 * waiting for them.
 */
export function useContextItem(context: RegistrationContext): ContextItem | null {
  const { t, i18n } = useTranslation();
  const { lines, count, subtotal } = useCart();
  const { findCourse } = useAcademy();
  const lang = i18n.language;

  if (context.kind === "training") {
    // A published course (the fixtures in mock mode), by any of its slugs.
    const course = findCourse(context.courseId);
    if (!course) return null;
    return {
      image: course.cover?.src ?? DEFAULT_MENU_THUMB,
      title: pick(course.title, lang),
      subtitle: course.summary ? pick(course.summary, lang) : undefined,
      price: toMajorUnits(course.currentPrice.minor),
      priceNote: [t(`academy.levels.${course.level}`), t("course.lessonCount", { count: lessonCount(course) }), formatDuration(course.minutes, lang)].join(" · "),
    };
  }

  if (context.kind === "purchase") {
    const product = context.productId ? getProduct(context.productId) : undefined;
    if (product) {
      return {
        image: product.image,
        title: pick(product.name, lang),
        subtitle: pick(product.subtitle, lang),
        price: product.price,
        qty: context.qty ?? 1,
      };
    }
    const first = lines[0];
    if (!first) return null;
    return {
      image: first.image,
      title: first.name,
      subtitle: first.variant,
      price: toMajorUnits(first.unitPrice),
      qty: first.qty,
      moreCount: count - first.qty,
      subtotal: toMajorUnits(subtotal),
      priceNote: t("register.context.cartSaved"),
    };
  }

  return null;
}
