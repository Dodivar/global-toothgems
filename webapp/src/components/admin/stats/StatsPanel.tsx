import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * The section primitive of the Statistics page.
 *
 * Every analytics block is the same object: a heading that says what question
 * the block answers, an optional line of context, optional controls, and the
 * content. Sections that are long rather than essential can be folded away, and
 * the fold is a real button with `aria-expanded` rather than a rotating chevron
 * on a div.
 */
export function StatsPanel({
  title,
  description,
  icon: Icon,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  bodyClassName,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  bodyClassName?: string;
}) {
  const { t } = useTranslation();
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="gt-admin-panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
            >
              <Icon size={16} strokeWidth={1.9} />
            </span>
          )}
          <div className="grid min-w-0 gap-0.5">
            <h2 className="text-[length:var(--text-h4)]">{title}</h2>
            {description && (
              <p className="m-0 max-w-[68ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {collapsible && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--admin-panel)] px-2.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {open ? t("admin.stats.panel.collapse") : t("admin.stats.panel.expand")}
              <ChevronDown
                size={14}
                strokeWidth={2.2}
                aria-hidden="true"
                className={clsx("transition-transform duration-[var(--duration-fast)]", open && "rotate-180")}
              />
            </button>
          )}
        </div>
      </header>

      <div id={bodyId} hidden={!open} className={bodyClassName ?? "p-4 sm:p-5"}>
        {children}
      </div>
    </section>
  );
}
