import { useTranslation } from "react-i18next";
import { getProduct } from "../../data/products";
import { getCourse } from "../../data/courses";
import { pick } from "../../data/types";
import { useCart } from "../../lib/cart";
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
  const lang = i18n.language;

  if (context.kind === "training") {
    const course = getCourse(context.courseId);
    if (!course) return null;
    return {
      image: course.image,
      title: pick(course.title, lang),
      subtitle: pick(course.copy, lang),
      price: course.price,
      priceNote: `${pick(course.level, lang)} · ${pick(course.meta, lang)}`,
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
      price: first.price,
      qty: first.qty,
      moreCount: count - first.qty,
      subtotal,
      priceNote: t("register.context.cartSaved"),
    };
  }

  return null;
}
