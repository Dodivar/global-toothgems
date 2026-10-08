import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, Tag, X } from "lucide-react";
import { Button } from "../ui/Button";
import { addPromotionCode, MAX_PROMOTION_CODES } from "../../lib/checkout/basketQuote";

/**
 * Promotion codes typed in the checkout (at most 3). The browser only checks
 * the shape of a code; whether it exists, is running, applies to this basket
 * and has uses left is the database's verdict, which the cart reads back
 * through the basket quote and passes here as `refusal`. A code is shown as
 * typed (unlike a gift card code it is not a credential), with the amount it
 * takes off in the order summary.
 */
export function PromotionCodes({
  codes,
  onChange,
  disabled,
  checking,
  refusal,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  /** The database is looking at the codes right now. */
  checking?: boolean;
  /** The verdict on the last code typed: it was refused and removed. */
  refusal?: "invalid" | "too_many_attempts" | "dropped" | null;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<"format" | "duplicate" | "limit" | null>(null);
  const locked = disabled;

  const add = () => {
    const result = addPromotionCode(codes, input);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setInput("");
    onChange(result.codes);
  };

  const message = error
    ? t(`checkout.promo.errors.${error}`, { max: MAX_PROMOTION_CODES })
    : refusal
      ? t(`checkout.promo.refusal.${refusal}`)
      : null;

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3 border-t border-[var(--border-subtle)] pt-4">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-[length:var(--text-body)] font-semibold">
        <Tag size={16} aria-hidden="true" />
        {t("checkout.promo.title")}
      </h2>
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="grid min-w-[160px] flex-1 grid-cols-[minmax(0,1fr)] gap-1.5">
          <label htmlFor={`${id}-code`} className="gt-field-label">{t("checkout.promo.label")}</label>
          <input
            id={`${id}-code`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            disabled={locked || codes.length >= MAX_PROMOTION_CODES}
            aria-invalid={message ? true : undefined}
            aria-describedby={`${id}-status`}
            className="gt-field font-[family-name:var(--gt-font-mono)] uppercase"
          />
        </div>
        <Button type="submit" variant="outline" disabled={locked || !input.trim() || codes.length >= MAX_PROMOTION_CODES}>
          {t("checkout.promo.apply")}
        </Button>
      </form>
      <div id={`${id}-status`} aria-live="polite">
        {checking && codes.length > 0 && (
          <p className="m-0 text-sm text-[var(--text-muted)]">{t("checkout.promo.checking")}</p>
        )}
        {message && (
          <p role="alert" className="m-0 flex items-center gap-1.5 text-sm font-medium text-[var(--status-error-fg)]">
            <CircleAlert size={14} aria-hidden="true" className="flex-none" /> {message}
          </p>
        )}
      </div>
      {codes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("checkout.promo.added")}>
          {codes.map((code) => (
            <li key={code} className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-sunken)] py-1 pl-3 pr-1 text-sm">
              <span className="font-[family-name:var(--gt-font-mono)]">{code}</span>
              <button
                type="button"
                onClick={() => onChange(codes.filter((c) => c !== code))}
                disabled={disabled}
                aria-label={t("checkout.promo.remove", { code })}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
