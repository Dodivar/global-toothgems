import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { useReveal } from "../../lib/useReveal";

/**
 * The small, repeated pieces of the training detail page.
 *
 * The page is long — ten sections — so the rhythm has to come from a handful of
 * shared shapes rather than from ten bespoke layouts: one section shell with a
 * fixed set of backgrounds, one heading block, one card, one checklist row, one
 * numbered step. Everything here reads its colours from the design tokens in
 * `index.css`; nothing hard-codes a hex value.
 */

/** Background bands the page alternates between. `ink` is the dark treatment. */
export type SectionTone = "paper" | "sand" | "wash" | "ink";

const sectionTone: Record<SectionTone, string> = {
  paper: "bg-[var(--surface-page)]",
  sand: "bg-[var(--surface-sunken)]",
  wash: "bg-[var(--surface-brand-wash)]",
  ink: "bg-[var(--surface-inverse)]",
};

/**
 * One band of the page: full-bleed background, content capped and guttered like
 * every other screen. Content is revealed on scroll, which is one-shot and
 * degrades to "always visible" under reduced motion (see `useReveal`).
 */
export function Section({
  id,
  tone = "paper",
  labelledBy,
  className,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={clsx(
        "px-[clamp(14px,4vw,48px)] py-[clamp(56px,7vw,var(--section-y))]",
        sectionTone[tone],
        tone === "ink" && "text-[var(--gt-ink-300)]",
        className,
      )}
    >
      <div ref={ref} className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] gap-[clamp(28px,4vw,56px)]">
        {children}
      </div>
    </section>
  );
}

/** Eyebrow + heading + optional lead. `dark` flips it for the ink bands. */
export function SectionIntro({
  id,
  eyebrow,
  title,
  lead,
  dark = false,
  center = false,
  actions,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  dark?: boolean;
  center?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-end gap-[clamp(16px,3vw,32px)]",
        center ? "justify-center text-center" : "justify-between",
      )}
    >
      <div className={clsx("grid gap-3", center && "justify-items-center")}>
        <span className={clsx("gt-eyebrow", dark && "text-[var(--gt-blue-300)]")}>{eyebrow}</span>
        <h2
          id={id}
          className={clsx(
            "max-w-[16ch] text-[length:var(--text-h2)] sm:max-w-[22ch]",
            dark && "text-[var(--gt-off-white)]",
          )}
        >
          {title}
        </h2>
        {lead && (
          <p
            className={clsx(
              "m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)]",
              dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
            )}
          >
            {lead}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}

/** The icon tile every card and step is introduced by. */
export function IconTile({
  icon: Icon,
  tone = "brand",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: "brand" | "emerald" | "fuchsia" | "ink";
  size?: "sm" | "md";
}) {
  const tones: Record<string, string> = {
    brand: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
    emerald: "bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]",
    fuchsia: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]",
    ink: "bg-white/10 text-[var(--gt-blue-300)]",
  };
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "flex flex-none items-center justify-center rounded-[var(--radius-md)]",
        size === "sm" ? "h-9 w-9" : "h-11 w-11",
        tones[tone],
      )}
    >
      <Icon size={size === "sm" ? 16 : 19} strokeWidth={1.9} />
    </span>
  );
}

/** A card in the "what you'll experience" and "why this training" grids. */
export function FeatureCard({
  icon,
  title,
  body,
  tone = "brand",
  dark = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: "brand" | "emerald" | "fuchsia" | "ink";
  dark?: boolean;
  className?: string;
}) {
  return (
    <article
      className={clsx(
        "grid content-start gap-3 rounded-[var(--radius-card)] border p-[var(--space-5)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] focus-within:-translate-y-[3px] focus-within:shadow-[var(--shadow-md)]",
        dark
          ? "border-white/10 bg-white/[.04] hover:border-white/20"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] hover:border-[var(--border-default)]",
        className,
      )}
    >
      <IconTile icon={icon} tone={dark ? "ink" : tone} />
      <h3 className={clsx("text-[length:var(--text-h4)]", dark && "text-[var(--gt-off-white)]")}>{title}</h3>
      <p
        className={clsx(
          "m-0 text-[length:var(--text-body-sm)]",
          dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
        )}
      >
        {body}
      </p>
    </article>
  );
}

/**
 * One line of a learning-outcome checklist. The tick is decorative: the meaning
 * is carried by the list semantics and the text, never by the colour alone.
 */
export function CheckItem({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={clsx(
          "mt-[2px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full",
          dark ? "bg-[var(--accent-cta)] text-[var(--gt-ink-900)]" : "bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]",
        )}
      >
        <Check size={13} strokeWidth={3} />
      </span>
      <span
        className={clsx(
          "text-[length:var(--text-body-md)]",
          dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]",
        )}
      >
        {children}
      </span>
    </li>
  );
}

/** "01 — Learn": one stage of the training journey. */
export function StepCard({
  step,
  title,
  body,
  last = false,
}: {
  step: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <li className="relative grid content-start gap-2.5 pt-8">
      {/* The rail: a hairline through the numbers, cut after the last step. */}
      <span
        aria-hidden="true"
        className={clsx("absolute left-0 top-[14px] h-px bg-white/15", last ? "w-0" : "w-full")}
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-[8px] h-3.5 w-3.5 rounded-full border-2 border-[var(--accent-cta)] bg-[var(--surface-inverse)]"
      />
      <span
        className="text-[length:var(--text-caption)] font-semibold tracking-[var(--tracking-wide)] text-[var(--gt-blue-300)]"
        style={{ fontFamily: "var(--gt-font-mono)" }}
      >
        {String(step).padStart(2, "0")}
      </span>
      <h3 className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">{title}</h3>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">{body}</p>
    </li>
  );
}

/**
 * A metadata chip in the hero. It renders the `dt`/`dd` pair itself, because the
 * hero groups these as a definition list — the label is the term, the figure is
 * the definition, and a screen reader should hear them paired.
 */
export function MetaPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] py-2 pl-3 pr-4 leading-tight shadow-[var(--shadow-xs)]">
      <Icon size={15} strokeWidth={1.9} aria-hidden="true" className="row-span-2 text-[var(--gt-blue-600)]" />
      <dt className="text-[10px] uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{label}</dt>
      <dd className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
