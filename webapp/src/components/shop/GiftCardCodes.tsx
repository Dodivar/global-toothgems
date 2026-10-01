import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, Gift, X } from "lucide-react";
import { Button } from "../ui/Button";
import { addGiftCardCode, MAX_GIFT_CARD_CODES } from "../../lib/giftCards/giftCardMapping";

/**
 * Gift card codes typed in the cart, sent with the order to the checkout
 * function (at most 5). The browser only checks the shape of a code: whether
 * it exists, is active, unexpired or has money left is decided by the database
 * when the order is created, and every refusal reads the same ("cannot be
 * used"), so the page never tells which codes exist. Codes are shown masked
 * once added and are never stored.
 */
export function GiftCardCodes({
  codes,
  onChange,
  disabled,
  refused,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  /** The last checkout refused one of the codes (which one is not said). */
  refused?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<"format" | "duplicate" | "limit" | null>(null);

  const add = () => {
    const result = addGiftCardCode(codes, input);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setInput("");
    onChange(result.codes);
  };

  const message = error ? t(`checkout.giftCard.errors.${error}`, { max: MAX_GIFT_CARD_CODES }) : refused ? t("checkout.errors.gift_card_invalid") : null;

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-[length:var(--text-h3)]">
        <Gift size={20} aria-hidden="true" />
        {t("checkout.giftCard.title")}
      </h2>
      <p className="m-0 text-sm text-[var(--text-muted)]">{t("checkout.giftCard.hint")}</p>
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="grid min-w-[220px] flex-1 gap-1.5">
          <label htmlFor={`${id}-code`} className="gt-field-label">{t("checkout.giftCard.label")}</label>
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
            placeholder="GT-XXXX-XXXX-XXXX"
            maxLength={24}
            disabled={disabled || codes.length >= MAX_GIFT_CARD_CODES}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error` : undefined}
            className="gt-field font-[family-name:var(--gt-font-mono)] uppercase"
          />
        </div>
        <Button type="submit" variant="outline" disabled={disabled || !input.trim() || codes.length >= MAX_GIFT_CARD_CODES}>
          {t("checkout.giftCard.add")}
        </Button>
      </form>
      {message && (
        <p id={`${id}-error`} role="alert" className="m-0 flex items-center gap-1.5 text-sm font-medium text-[var(--status-error-fg)]">
          <CircleAlert size={14} aria-hidden="true" className="flex-none" /> {message}
        </p>
      )}
      {codes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("checkout.giftCard.added")}>
          {codes.map((code) => (
            <li key={code} className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-sunken)] py-1 pl-3 pr-1 text-sm">
              <span className="font-[family-name:var(--gt-font-mono)]">•••• {code.slice(-4)}</span>
              <button
                type="button"
                onClick={() => onChange(codes.filter((c) => c !== code))}
                disabled={disabled}
                aria-label={t("checkout.giftCard.remove", { last4: code.slice(-4) })}
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
