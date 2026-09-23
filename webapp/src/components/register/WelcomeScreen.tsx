import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CircleCheck, GraduationCap, LayoutDashboard, ShoppingBag, Sparkles, Store } from "lucide-react";
import { Button } from "../ui/Button";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { ContextSummary } from "./ContextSummary";
import type { GemShape } from "../../data/products";
import type { Interest, Persona, RegistrationContext } from "../../lib/registration";

export type WelcomeAction = "cart" | "shop" | "dashboard" | "academy" | "course" | "checkout";

interface Cta {
  action: WelcomeAction;
  label: string;
  icon: LucideIcon;
}

/**
 * Next actions after the account exists: exactly one primary, at most two
 * quieter ones. The primary follows the reason they came — back to the cart,
 * on to the training — and, for a plain sign-up, the interest they picked.
 */
function useCtas(context: RegistrationContext, interest: Interest | null): Cta[] {
  const { t } = useTranslation();
  const dashboard: Cta = { action: "dashboard", label: t("register.welcome.ctaDashboard"), icon: LayoutDashboard };

  if (context.kind === "purchase") {
    return [
      { action: "cart", label: t("register.welcome.ctaCart"), icon: ShoppingBag },
      { action: "shop", label: t("register.welcome.ctaContinueShopping"), icon: Store },
      dashboard,
    ];
  }
  if (context.kind === "training") {
    return [
      { action: "checkout", label: t("register.welcome.ctaCheckout"), icon: ArrowRight },
      { action: "course", label: t("register.welcome.ctaViewTraining"), icon: GraduationCap },
      dashboard,
    ];
  }
  const shop: Cta = { action: "shop", label: t("register.welcome.ctaExploreProducts"), icon: Store };
  const academy: Cta = { action: "academy", label: t("register.welcome.ctaDiscoverTraining"), icon: GraduationCap };
  if (interest === "training") return [academy, shop, dashboard];
  if (interest === "products") return [shop, academy, dashboard];
  return [dashboard, shop, academy];
}

/** Burst positions: angle-spread so the sparkles fan out rather than clump. */
const SPARKS: { shape: GemShape; x: number; y: number; r: number; delay: number; size: number; tone: string }[] = [
  { shape: "star", x: -120, y: -42, r: -40, delay: 0, size: 16, tone: "var(--gt-blue-400)" },
  { shape: "heart", x: 112, y: -52, r: 30, delay: 40, size: 18, tone: "var(--gt-fuchsia-300)" },
  { shape: "round", x: -88, y: 24, r: 60, delay: 90, size: 12, tone: "var(--gt-emerald-400)" },
  { shape: "drop", x: 96, y: 20, r: -20, delay: 60, size: 14, tone: "var(--gt-blue-300)" },
  { shape: "navette", x: -32, y: -71, r: 20, delay: 120, size: 14, tone: "var(--gt-blue-500)" },
  { shape: "star", x: 42, y: -74, r: 80, delay: 30, size: 11, tone: "var(--gt-fuchsia-400)" },
  { shape: "flower", x: -142, y: -6, r: 10, delay: 150, size: 13, tone: "var(--gt-blue-300)" },
  { shape: "square", x: 142, y: -12, r: 45, delay: 110, size: 10, tone: "var(--gt-emerald-300)" },
];

/** Long labels (French, large text settings) wrap instead of widening the card. */
const WRAP = "h-auto! min-h-[46px] whitespace-normal! py-2.5 text-center";

export function WelcomeScreen({
  context,
  firstName,
  persona,
  interest,
  viaGoogle,
  headingRef,
  onAction,
}: {
  context: RegistrationContext;
  firstName: string;
  persona: Persona | null;
  interest: Interest | null;
  viaGoogle: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAction: (action: WelcomeAction) => void;
}) {
  const { t } = useTranslation();
  const [primary, ...secondary] = useCtas(context, interest);

  const checks = [
    t("register.welcome.checkAccount"),
    t(viaGoogle ? "register.welcome.checkGoogle" : "register.welcome.checkEmail"),
    persona || interest ? t("register.welcome.checkPersonalised") : t("register.welcome.checkProfile"),
  ];

  return (
    <div className="grid gap-7">
      <div className="relative grid justify-items-center gap-4 pt-2 text-center">
        {/* Decorative burst of the catalogue's own cuts. Hidden from assistive
            technology and removed entirely under reduced motion. */}
        <div aria-hidden="true" className="gt-burst pointer-events-none absolute left-1/2 top-12 h-0 w-0">
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="gt-burst-spark absolute"
              style={
                {
                  "--x": `${s.x}px`,
                  "--y": `${s.y}px`,
                  "--r": `${s.r}deg`,
                  animationDelay: `${s.delay}ms`,
                  color: s.tone,
                } as CSSProperties
              }
            >
              <ShapeGlyph shape={s.shape} size={s.size} />
            </span>
          ))}
        </div>

        <span
          aria-hidden="true"
          className="gt-celebrate relative grid h-[84px] w-[84px] place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--gt-ink-900)] shadow-[0_12px_36px_-8px_rgba(18,168,122,.55)]"
        >
          <span className="absolute inset-[-8px] rounded-full border border-[var(--gt-emerald-300)] opacity-70" />
          <CircleCheck size={38} strokeWidth={1.8} />
        </span>

        <div className="grid gap-2">
          <span aria-hidden="true" className="gt-script text-[44px] leading-none text-[var(--gt-blue-400)]">
            {t("register.welcome.script")}
          </span>
          <h2 ref={headingRef} tabIndex={-1} className="text-[length:var(--text-h2)] outline-none">
            {t("register.welcome.title")} <span aria-hidden="true">✨</span>
          </h2>
          <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">
            {firstName ? t("register.welcome.readyNamed", { name: firstName }) : t("register.welcome.ready")}
          </p>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-2 rounded-[var(--radius-md)] bg-[var(--gt-off-white)] p-4 shadow-[var(--shadow-inset-hairline)]">
        {checks.map((label, i) => (
          <li
            key={label}
            className="gt-check-in flex items-center gap-2.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)]"
            style={{ animationDelay: `${200 + i * 120}ms` }}
          >
            <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--status-success-fg)] text-white">
              <CircleCheck size={13} />
            </span>
            {label}
          </li>
        ))}
      </ul>

      {context.kind !== "general" && <ContextSummary context={context} compact done />}

      <div className="grid gap-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          iconRight={primary.icon}
          onClick={() => onAction(primary.action)}
          className={WRAP}
        >
          {primary.label}
        </Button>
        <div className="grid gap-2 sm:grid-cols-2">
          {secondary.map((cta) => (
            <Button key={cta.action} variant="outline" fullWidth iconLeft={cta.icon} onClick={() => onAction(cta.action)} className={WRAP}>
              {cta.label}
            </Button>
          ))}
        </div>
      </div>

      {(persona || interest) && (
        <p className="m-0 flex items-start justify-center gap-2 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Sparkles size={13} aria-hidden="true" className="mt-[2px] flex-none text-[var(--accent-highlight)]" />
          {t("register.welcome.personalNote")}
        </p>
      )}
    </div>
  );
}
