import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import clsx from "clsx";
import { LOYALTY_STATES, LOYALTY_STATE_ORDER, STAMPS_PER_CARD, type LoyaltyStateId } from "../../data/loyalty";

/**
 * Preview switcher for the five card states.
 *
 * It is deliberately visible and labelled as a demo control rather than hidden
 * behind a development flag: this whole app is a review prototype, and a switcher
 * that only existed in `npm run dev` could not show the states to the people the
 * prototype is built for. It writes to local component state and nothing else.
 *
 * Radio inputs rather than buttons, so the group is one tab stop and the arrow
 * keys move between states the way they do in any other radio group.
 */
export function LoyaltyStateDemo({
  value,
  onChange,
  className,
}: {
  value: LoyaltyStateId;
  onChange: (next: LoyaltyStateId) => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <fieldset
      className={clsx(
        "m-0 grid gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-[var(--space-4)]",
        className,
      )}
    >
      <legend className="gt-eyebrow flex items-center gap-2 px-1">
        <FlaskConical size={13} aria-hidden="true" />
        {t("loyalty.demoTitle")}
      </legend>

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("loyalty.demoBody")}</p>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {LOYALTY_STATE_ORDER.map((id) => {
          const selected = id === value;
          return (
            <label
              key={id}
              className={clsx(
                "grid flex-none cursor-pointer gap-0.5 rounded-[var(--radius-md)] border px-3.5 py-2 text-left transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected
                  ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--border-default)]",
              )}
            >
              <input
                type="radio"
                name="gt-loyalty-demo-state"
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <strong className="text-[length:var(--text-body-sm)] tabular-nums">
                {t("loyalty.progressValue", { done: LOYALTY_STATES[id].stamps, total: STAMPS_PER_CARD })}
              </strong>
              <span
                className={clsx(
                  "whitespace-nowrap text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)]",
                  selected ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
                )}
              >
                {t(`loyalty.state.${id}.demoLabel`)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
