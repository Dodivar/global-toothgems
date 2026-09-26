import type { LucideIcon } from "lucide-react";
import { RichText } from "./RichText";

/**
 * A short process drawn as numbered stages: across the page on a wide screen,
 * down it on a phone. An ordered list underneath, so the sequence and the count
 * are announced; the connecting rule is decoration.
 */
export function StepFlow({ label, steps }: { label: string; steps: { icon: LucideIcon; title: string; text: string }[] }) {
  return (
    <ol
      aria-label={label}
      className="m-0 grid list-none gap-0 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash-strong)] p-4 sm:p-5 lg:grid-flow-col lg:auto-cols-fr lg:gap-3"
    >
      {steps.map((step, i) => {
        const Icon = step.icon;
        const lastStep = i === steps.length - 1;
        return (
          <li key={step.title} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0 lg:grid-cols-1 lg:gap-y-3 lg:pb-0">
            {/* Connector: vertical under the badge on small screens, horizontal after it on large ones. */}
            {!lastStep && (
              <span
                aria-hidden="true"
                className="absolute left-[19px] top-10 bottom-0 w-px bg-[var(--gt-blue-300)] lg:left-12 lg:right-[-12px] lg:top-5 lg:bottom-auto lg:h-px lg:w-auto"
              />
            )}
            <span
              aria-hidden="true"
              className="relative z-[1] grid h-10 w-10 place-items-center rounded-full border border-[var(--gt-blue-300)] bg-[var(--surface-card)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)]"
            >
              <Icon size={18} />
            </span>
            <span className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--gt-blue-700)]">{String(i + 1).padStart(2, "0")}</span>
              <strong className="text-[length:var(--text-body-md)] leading-[1.3] text-[var(--text-primary)]">{step.title}</strong>
              <span className="text-[length:var(--text-body-sm)] leading-[1.55] text-[var(--text-body)]"><RichText text={step.text} /></span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
