import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import clsx from "clsx";
import { STEPS, type StepId } from "../../lib/registration";

/**
 * "1 Account → 2 Profile → 3 Preferences → 4 Done".
 *
 * An ordered list, the current item marked `aria-current="step"`, and each
 * state spelled out for screen readers ("completed", "current step") rather than
 * left to the tick and the fill. On small screens only the current label is
 * shown next to the dots, plus a "Step 2 of 4" line, so the indicator fits one
 * row without dominating the form.
 */
export function StepProgress({ current, allDone = false }: { current: StepId; allDone?: boolean }) {
  const { t } = useTranslation();
  const currentIndex = STEPS.indexOf(current);

  return (
    <nav aria-label={t("register.progressLabel")} className="grid gap-2">
      <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--text-muted)] sm:hidden">
        {t("register.stepOf", { current: currentIndex + 1, total: STEPS.length })}
      </p>
      <ol className="m-0 flex list-none items-center gap-0 p-0">
        {STEPS.map((step, index) => {
          const done = allDone || index < currentIndex;
          const isCurrent = !allDone && index === currentIndex;
          return (
            <li
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className={clsx("flex items-center", index < STEPS.length - 1 && "flex-1")}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-7 w-7 flex-none place-items-center rounded-full border text-[12px] font-bold transition-[background-color,border-color,color,box-shadow] duration-[var(--duration-normal)]",
                    done && "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white",
                    isCurrent && "border-[var(--gt-ink-900)] bg-white text-[var(--gt-ink-900)] shadow-[0_0_0_4px_var(--gt-blue-200)]",
                    !done && !isCurrent && "border-[var(--border-default)] bg-white text-[var(--text-muted)]",
                  )}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={clsx(
                    "whitespace-nowrap text-[length:var(--text-caption)]",
                    isCurrent ? "font-bold text-[var(--text-primary)]" : "hidden font-medium text-[var(--text-muted)] sm:inline",
                    done && "sm:text-[var(--text-primary)]",
                  )}
                >
                  {t(`register.steps.${step}`)}
                  <span className="sr-only">
                    {" "}
                    ({t(done ? "register.stepCompleted" : isCurrent ? "register.stepCurrent" : "register.stepUpcoming")})
                  </span>
                </span>
              </span>
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="mx-2 h-px flex-1 overflow-hidden bg-[var(--border-subtle)] sm:mx-3">
                  <span
                    className="block h-full origin-left bg-[var(--gt-ink-900)] transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]"
                    style={{ transform: `scaleX(${done ? 1 : 0})` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
