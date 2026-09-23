import { useTranslation } from "react-i18next";
import { GraduationCap, Lock, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { formatPrice } from "../../lib/format";
import type { RegistrationContext } from "../../lib/registration";
import { useContextItem } from "./useContextItem";

/**
 * "You're creating an account to continue with your purchase / training."
 *
 * A compact glass card above the progress indicator. Its job is reassurance:
 * the thing they were buying is right here, and creating the account does not
 * lose it. Nothing on it is interactive, so the form stays the only task.
 */
export function ContextSummary({
  context,
  compact = false,
  done = false,
}: {
  context: RegistrationContext;
  compact?: boolean;
  /** The account exists: the card now says the errand is waiting, not that it is being kept. */
  done?: boolean;
}) {
  const { t } = useTranslation();
  const item = useContextItem(context);
  if (context.kind === "general") return null;

  const training = context.kind === "training";
  const Icon = training ? GraduationCap : ShoppingBag;

  return (
    <section
      aria-label={t(training ? "register.context.trainingAria" : "register.context.purchaseAria")}
      className={clsx("gt-glass grid gap-3 rounded-[var(--radius-lg)] p-3.5 sm:p-4", compact && "gap-2.5")}
    >
      <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] font-semibold leading-snug text-[var(--text-primary)]">
        <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--gt-ink-900)] text-white">
          <Icon size={13} />
        </span>
        <span className="pt-[2px]">{t(`register.context.${training ? "training" : "purchase"}${done ? "Ready" : "Notice"}`)}</span>
      </p>

      {item && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white/80 p-2.5 shadow-[var(--shadow-inset-hairline)]">
          <img
            src={item.image}
            alt=""
            loading="lazy"
            decoding="async"
            className={clsx(
              "flex-none rounded-[var(--radius-sm)] object-cover",
              training ? "h-14 w-[76px]" : "h-14 w-14",
            )}
          />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{item.title}</strong>
            {item.subtitle && (
              <span className={clsx("text-[length:var(--text-caption)] text-[var(--text-muted)]", training ? "line-clamp-2" : "truncate")}>
                {item.subtitle}
              </span>
            )}
            {!compact && item.priceNote && (
              <span className="truncate text-[11px] font-medium text-[var(--gt-blue-700)]">{item.priceNote}</span>
            )}
          </div>
          <div className="grid flex-none justify-items-end gap-0.5 text-right">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{formatPrice(item.price)}</strong>
            {item.qty !== undefined && (
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.context.qty", { count: item.qty })}</span>
            )}
          </div>
        </div>
      )}

      {item?.moreCount ? (
        <p className="m-0 flex justify-between gap-3 px-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <span>{t("register.context.moreItems", { count: item.moreCount })}</span>
          {item.subtotal !== undefined && (
            <span>
              {t("register.context.subtotal")}{" "}
              <strong className="text-[var(--text-primary)]">{formatPrice(item.subtotal)}</strong>
            </span>
          )}
        </p>
      ) : null}

      {!done && (
        <p className="m-0 flex items-center gap-1.5 px-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Lock size={12} aria-hidden="true" />
          {t(training ? "register.context.trainingKept" : "register.context.purchaseKept")}
        </p>
      )}
    </section>
  );
}
