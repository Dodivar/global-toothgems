import type { ReactNode, RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-blue.png";

/**
 * Page frame for the recovery and verification screens.
 *
 * One narrow card on the registration journey's pastel wash: the same
 * atmosphere a member met when creating the account, with nothing else on the
 * screen competing with the one thing to do. The brand monogram sits on top of
 * the card, so a visitor arriving cold from an email knows at once where they
 * landed. The demo panel, when given, sits above the card and outside it.
 */
export function AuthShell({ demo, children, footer }: { demo?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="gt-register relative isolate overflow-x-clip">
      <div aria-hidden="true" className="gt-register-wash absolute inset-0 -z-10" />
      <div className="mx-auto grid w-full max-w-[560px] gap-5 px-4 pb-[clamp(48px,7vw,96px)] pt-4 sm:px-6 sm:pt-8">
        {demo}
        <section className="relative grid min-w-0 gap-6 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/95 p-5 pt-12 shadow-[var(--shadow-lg)] backdrop-blur-[6px] sm:p-9 sm:pt-14">
          <img
            src={monogram}
            alt="Global Toothgems"
            className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border-subtle)] bg-[var(--gt-ink-900)] object-contain p-2.5 shadow-[var(--shadow-md)]"
          />
          {children}
        </section>
        {footer}
      </div>
    </div>
  );
}

export type Tone = "brand" | "success" | "warning" | "error" | "neutral";

const toneClasses: Record<Tone, string> = {
  brand: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  error: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
  neutral: "bg-[var(--gt-ink-100)] text-[var(--text-body)]",
};

/**
 * Round state illustration: an icon in a tinted disc with one small fuchsia
 * spark, the registration journey's envelope motif. The icon's shape carries
 * the meaning (clock for expired, check for done…), so the tint never has to.
 */
export function StateMark({ icon: Icon, tone = "brand", spark = true }: { icon: LucideIcon; tone?: Tone; spark?: boolean }) {
  return (
    <span aria-hidden="true" className={clsx("gt-pop-in relative grid h-[72px] w-[72px] place-items-center rounded-full", toneClasses[tone])}>
      <Icon size={30} strokeWidth={1.6} />
      {spark && <span className="gt-envelope-spark absolute -right-0.5 top-1 h-3 w-3 rotate-45 rounded-[2px] bg-[var(--gt-fuchsia-300)]" />}
    </span>
  );
}

/**
 * Heading block of a state. The heading takes focus when the state changes
 * (via `headingRef`), so a screen-reader user hears the new situation first
 * rather than being left on a button that no longer exists.
 */
export function StateHeading({
  icon,
  tone,
  eyebrow,
  title,
  children,
  headingRef,
  align = "center",
}: {
  icon?: LucideIcon;
  tone?: Tone;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  align?: "center" | "start";
}) {
  return (
    <header className={clsx("grid gap-4", align === "center" ? "justify-items-center text-center" : "justify-items-start")}>
      {icon && <StateMark icon={icon} tone={tone} />}
      <div className="grid gap-2">
        {eyebrow && <span className="gt-eyebrow">{eyebrow}</span>}
        <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)] outline-none">
          {title}
        </h1>
        {children && <div className="grid gap-2 text-[length:var(--text-body-md)] text-[var(--text-body)] [&_p]:m-0">{children}</div>}
      </div>
    </header>
  );
}
