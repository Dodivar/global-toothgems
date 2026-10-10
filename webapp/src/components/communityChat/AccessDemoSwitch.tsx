import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import clsx from "clsx";
import { ACCESS_MODES, useCommunity, type AccessMode } from "../../lib/community";

/**
 * Preview switcher for the two access states.
 *
 * Visible and labelled as a demo control, for the same reason the loyalty card
 * carries one: this whole app is a review prototype, and the seeded account
 * owns two courses, so the locked community would otherwise be unreachable by
 * the people the prototype is built for. It writes to the community context and
 * nothing else — no rule about who may enter is decided here.
 *
 * Radio inputs rather than buttons, so the group is one tab stop and the arrow
 * keys move through it like any other radio group.
 */
export function AccessDemoSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { accessMode, setAccessMode, ownedCourses } = useCommunity();

  return (
    <fieldset
      className={clsx(
        "m-0 grid gap-2.5 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-[var(--space-4)]",
        className,
      )}
    >
      <legend className="gt-eyebrow flex items-center gap-2 px-1">
        <FlaskConical size={13} aria-hidden="true" />
        {t("community.demoTitle")}
      </legend>

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("community.demoBody", { count: ownedCourses })}
      </p>

      <div className="grid gap-1.5">
        {ACCESS_MODES.map((mode: AccessMode) => {
          const selected = mode === accessMode;
          return (
            <label
              key={mode}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[length:var(--text-caption)] font-semibold transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected
                  ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--border-default)]",
              )}
            >
              <input
                type="radio"
                name="gt-community-access"
                value={mode}
                checked={selected}
                onChange={() => setAccessMode(mode)}
                className="sr-only"
              />
              {t(`community.demoMode.${mode}`)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
