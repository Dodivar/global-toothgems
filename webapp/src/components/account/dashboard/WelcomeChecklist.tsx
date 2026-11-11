import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, Check, GraduationCap, Sparkles, Store, UserRound, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../../lib/navigation";
import { useAuth } from "../../../lib/auth";
import { useFavorites } from "../../../lib/favorites";
import { useOrders } from "../../../lib/orders";
import { useProgress } from "../../../lib/progress";
import { useStudioAccess } from "../../../lib/studioAccess";
import { dismissWelcome, fetchAccountOrigin, fetchMemberPreferences } from "../../../lib/memberPreferencesApi";
import { isNewAccount, showsWelcome, welcomeSteps, type WelcomeStepId } from "../../../lib/memberWelcome";

const ICONS: Record<WelcomeStepId, LucideIcon> = {
  profile: UserRound,
  shop: Store,
  studio: Box,
  academy: GraduationCap,
};

/**
 * "First steps": a short checklist for a new member, under the greeting.
 *
 * Each line is a link to a place worth visiting and ticks itself from what the
 * account really holds (`lib/memberWelcome.ts`). The card is drawn only for an
 * account under two weeks old, while a step is left and until the member
 * closes it — a choice saved on the account (`member_preferences`), so it
 * stays closed on every device. The Studio is suggested even after a purchase
 * or a course, except to a subscriber and to someone who signed up for it.
 */
export function WelcomeChecklist() {
  const { t } = useTranslation();
  const titleId = useId();
  const { profile, userId } = useAuth();
  const { favoriteProducts } = useFavorites();
  const { orders } = useOrders();
  const { enrolledCourses } = useProgress();
  const access = useStudioAccess();

  const [loaded, setLoaded] = useState<{
    userId: string;
    dismissed: boolean;
    createdAt: string | null;
    forStudio: boolean;
  } | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([fetchMemberPreferences(), fetchAccountOrigin()]).then(([prefs, origin]) => {
      if (!active || !prefs || !origin) return;
      setLoaded({ userId, dismissed: prefs.welcomeDismissed, createdAt: origin.createdAt, forStudio: origin.forStudio });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!profile || !loaded || loaded.userId !== userId) return null;

  const steps = welcomeSteps({
    phone: profile.phone,
    addressLine: profile.addressLine,
    hasFavorites: favoriteProducts.length > 0,
    hasOrders: orders.length > 0,
    studio: access?.status.kind === "ready" ? access.status.info.state : null,
    signedUpForStudio: loaded.forStudio,
    holdsCourse: enrolledCourses().length > 0,
  });
  if (!showsWelcome({ isNew: isNewAccount(loaded.createdAt), dismissed: loaded.dismissed, steps })) return null;

  const doneCount = steps.filter((step) => step.done).length;

  const close = async () => {
    setClosing(true);
    // Hidden at once; if the save fails the card simply comes back next visit.
    setLoaded({ ...loaded, dismissed: true });
    await dismissWelcome();
  };

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="gt-eyebrow flex items-center gap-2">
            <Sparkles size={13} aria-hidden="true" />
            {t("account.welcome.eyebrow")}
          </span>
          <h2 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
            {t("account.welcome.title")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.welcome.lead")}</p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={closing}
          aria-label={t("account.welcome.dismiss")}
          className="grid h-9 w-9 flex-none place-items-center rounded-full border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-1.5">
        <div
          role="progressbar"
          aria-label={t("account.welcome.progress", { done: doneCount, total: steps.length })}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        >
          <div className="h-full rounded-full bg-[var(--accent-cta)] transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
          {t("account.welcome.progress", { done: doneCount, total: steps.length })}
        </span>
      </div>

      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {steps.map((step) => {
          const Icon = ICONS[step.id];
          return (
            <li key={step.id}>
              <Link
                to={step.to}
                className={clsx(
                  "flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 no-underline transition-colors hover:border-[var(--border-strong)]",
                  step.done ? "bg-[var(--surface-sunken)]" : "bg-[var(--surface-card)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-9 w-9 flex-none place-items-center rounded-full",
                    step.done ? "bg-[var(--status-success-fg)] text-white" : "bg-[var(--gt-blue-50)] text-[var(--gt-blue-600)]",
                  )}
                >
                  {step.done ? <Check size={16} /> : <Icon size={16} />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
                    {t(`account.welcome.steps.${step.id}.title`)}
                    {step.done && <span className="sr-only"> — {t("account.welcome.done")}</span>}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`account.welcome.steps.${step.id}.text`)}</span>
                </span>
                <ArrowRight size={15} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
