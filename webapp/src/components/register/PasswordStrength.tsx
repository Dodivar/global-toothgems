import { useTranslation } from "react-i18next";
import { Check, Circle } from "lucide-react";
import clsx from "clsx";
import {
  MIN_PASSWORD,
  PASSWORD_RULES,
  STRENGTH_KEYS,
  isCommonPassword,
  passwordRuleMet,
  passwordStrength,
} from "../../lib/registration";

/** Segment fill per strength: the label beside it carries the same meaning in words. */
const STRENGTH_COLOR = {
  0: "var(--gt-ink-200)",
  1: "var(--gt-red-500)",
  2: "var(--gt-amber-400)",
  3: "var(--gt-emerald-500)",
  4: "var(--gt-emerald-600)",
} as const;

/**
 * Strength meter and requirement checklist.
 *
 * Progressive: before anything is typed the rules are listed plainly, as a
 * promise of what is needed; as the visitor types, each rule ticks off with an
 * icon and a hidden "met" / "not met" so a screen reader hears the same thing
 * the eye sees. The meter never replaces the rules — "Good" with an unmet rule
 * would be a contradiction, so the score cannot pass "Fair" until all are met.
 */
export function PasswordStrength({ id, value, errorShown = false }: { id: string; value: string; errorShown?: boolean }) {
  const { t } = useTranslation();
  const strength = passwordStrength(value);
  const common = value.length > 0 && isCommonPassword(value);

  return (
    <div id={id} className="grid gap-2.5 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-3.5">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className="h-1.5 rounded-full transition-[background-color] duration-[var(--duration-normal)]"
              style={{ background: strength >= segment ? STRENGTH_COLOR[strength] : "var(--gt-ink-200)" }}
            />
          ))}
        </div>
        <span className="min-w-[88px] text-right text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          <span className="sr-only">{t("register.strength.label")} </span>
          {t(STRENGTH_KEYS[strength])}
        </span>
      </div>

      <ul className="m-0 grid list-none gap-1.5 p-0" aria-label={t("register.rulesLabel")}>
        {PASSWORD_RULES.map((rule) => {
          const met = passwordRuleMet(rule, value);
          return (
            <li
              key={rule}
              className={clsx(
                "flex items-center gap-2 text-[length:var(--text-caption)] transition-colors",
                met ? "text-[var(--status-success-fg)]" : "text-[var(--text-muted)]",
              )}
            >
              {met ? (
                <span aria-hidden="true" className="gt-pop-in grid h-4 w-4 place-items-center rounded-full bg-[var(--status-success-fg)] text-white">
                  <Check size={10} strokeWidth={3.5} />
                </span>
              ) : (
                <Circle size={16} aria-hidden="true" strokeWidth={1.5} className="text-[var(--gt-ink-300)]" />
              )}
              <span className={met ? "font-medium" : undefined}>{t(`register.rules.${rule}`, { min: MIN_PASSWORD })}</span>
              <span className="sr-only">{t(met ? "register.ruleMet" : "register.ruleNotMet")}</span>
            </li>
          );
        })}
      </ul>

      {/* Live hint while typing; once the field shows its own error, that says it. */}
      {common && !errorShown && (
        <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">{t("register.commonWarning")}</p>
      )}
      {!common && strength === 3 && (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.strengthTip")}</p>
      )}
    </div>
  );
}
