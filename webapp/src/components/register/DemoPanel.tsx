import { useTranslation } from "react-i18next";
import { ChevronDown, FlaskConical, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { SCENARIOS, TAKEN_EMAILS, type ContextKind, type Scenario } from "../../lib/registration";

const CONTEXTS: ContextKind[] = ["general", "purchase", "training"];

function RadioPills<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  labelFor,
}: {
  name: string;
  legend: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <fieldset className="m-0 min-w-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <label
              key={option}
              className={clsx(
                "flex min-h-[36px] cursor-pointer items-center rounded-full border px-3.5 text-[length:var(--text-caption)] font-semibold transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected
                  ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                  : "border-[var(--border-subtle)] bg-white text-[var(--text-body)] hover:border-[var(--border-default)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {labelFor(option)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Review controls for the prototype.
 *
 * Visible and labelled as a demo, like the community's access switch and the
 * loyalty state picker: the people reviewing this need to reach the purchase
 * and training variants and every failure state without hunting for the input
 * that triggers them. Collapsed by default so it does not compete with the
 * form. It writes to page state only; no rule is decided here.
 */
export function DemoPanel({
  context,
  onContextChange,
  scenario,
  onScenarioChange,
  onRestart,
}: {
  context: ContextKind;
  onContextChange: (kind: ContextKind) => void;
  scenario: Scenario;
  onScenarioChange: (scenario: Scenario) => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation();

  return (
    <details className="group rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-white/70 backdrop-blur-[6px]">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-[var(--radius-lg)] px-4 py-2 text-[length:var(--text-caption)] [&::-webkit-details-marker]:hidden">
        <FlaskConical size={14} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
        <span className="font-semibold text-[var(--text-primary)]">{t("register.demo.title")}</span>
        <span className="hidden truncate text-[var(--text-muted)] sm:inline">
          · {t(`register.demo.context.${context}`)} · {t(`register.demo.scenario.${scenario}`)}
        </span>
        <ChevronDown size={15} aria-hidden="true" className="ml-auto flex-none text-[var(--text-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-dashed border-[var(--border-default)] p-4">
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.demo.body")}</p>
        <RadioPills
          name="gt-register-context"
          legend={t("register.demo.contextLegend")}
          options={CONTEXTS}
          value={context}
          onChange={onContextChange}
          labelFor={(v) => t(`register.demo.context.${v}`)}
        />
        <RadioPills
          name="gt-register-scenario"
          legend={t("register.demo.scenarioLegend")}
          options={SCENARIOS}
          value={scenario}
          onChange={onScenarioChange}
          labelFor={(v) => t(`register.demo.scenario.${v}`)}
        />
        <div className="grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-primary)]">{t("register.demo.takenLegend")}</span>
          <span>
            {TAKEN_EMAILS.map((email, i) => (
              <span key={email}>
                <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[family-name:var(--gt-font-mono)] text-[11px] text-[var(--text-primary)]">
                  {email}
                </code>
                {i < TAKEN_EMAILS.length - 1 ? " " : ""}
              </span>
            ))}
          </span>
          <span>{t("register.demo.otherTips")}</span>
        </div>
        <div>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-3.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("register.demo.restart")}
          </button>
        </div>
      </div>
    </details>
  );
}
