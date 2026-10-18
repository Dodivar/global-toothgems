"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Box, Check, Gift, Info, Lock, LogIn, RefreshCcw, UserPlus, WifiOff } from "lucide-react";
import { Button } from "../../ui/Button";
import { StudioPaidPlans } from "../StudioPlans";
import { StudioEditorLoading } from "../editor/StudioEditorLoading";
import { Link, useLocation, useNavigate } from "../../../lib/navigation";
import { useToast } from "../../../lib/toast";
import { useFormat } from "../../../lib/format";
import { useStudioAccess } from "../../../lib/studioAccess";
import { countSavedCreations } from "../../../lib/studioAccessApi";
import { trackStudio, trackStudioOnce } from "../../../lib/studioAnalytics";
import { watchStudioActivity } from "../../../lib/studioActivityAnalytics";
import { studioStore } from "../../../lib/studio3d/store";
import { useAuth } from "../../../lib/auth";
import { STUDIO_PATH } from "../../../lib/studioUrl";
import { RETURN_PARAM, SIGN_IN_PATH } from "../../../lib/authRoutes";
import type { StudioPlan } from "../../../data/studio";
import type { StudioAccessKind } from "../../../lib/studioAccessState";

/**
 * What stands in front of the Studio editor: the trial invitation, a sign-in
 * invitation, the locked screen with the plans, or a retry. The editor itself
 * renders only while `useStudioAccess()` grants it — and the database refuses
 * any write without access whatever this component shows (decision 93).
 */
export function RequireStudioAccess({ children }: { children: ReactNode }) {
  const access = useStudioAccess();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const justStarted = access?.justStarted ?? false;
  const dismiss = access?.dismissJustStarted;

  // The short confirmation, once, as the Studio opens.
  useEffect(() => {
    if (!justStarted) return;
    showToast(t("studio.access.started.title"), t("studio.access.started.body"), "success");
    dismiss?.();
  }, [justStarted, dismiss, showToast, t]);

  if (!access) return <>{children}</>;
  const { status } = access;
  if (status.kind === "preview") return <>{children}</>;
  if (status.kind === "loading") return <StudioEditorLoading />;
  if (status.kind === "signedOut") return <SignedOutScreen />;
  if (status.kind === "error") return <ErrorScreen onRetry={() => void access.refresh()} />;
  if (access.granted) return <SessionTracker>{children}</SessionTracker>;
  if (status.info.state === "not_started") return <TrialOfferScreen />;
  return <LockedScreen state={status.info.state} />;
}

/* -------------------------------------------------------------------------- */

/** The page around every access screen: the Studio's own light backdrop, no storefront chrome. */
function AccessShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main className="gt-studio-alt min-h-[100dvh] overflow-x-clip">
      <div className="gt-studio-b-hero relative min-h-[100dvh] px-4 pb-12 pt-5 sm:px-[clamp(16px,4vw,48px)] sm:pt-8">
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full opacity-60" />
        <div className={`relative mx-auto grid gap-6 ${wide ? "max-w-[var(--max-width-content)]" : "max-w-[640px]"}`}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? window.history.back() : navigate(STUDIO_PATH))}
              className="inline-flex items-center gap-2 rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("studio.access.back")}
            </button>
            <span className="inline-flex items-center gap-2 text-[13px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
              <Box size={15} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
              {t("studio.editor.appName")}
            </span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,4vw,36px)] shadow-[var(--shadow-md)]">
      {children}
    </section>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: typeof Gift; children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--status-success-fg)]">
      <Icon size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Focus the screen's heading when it appears, so a screen reader announces where the visitor is. */
function useHeadingFocus() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

/* -------------------------------------------------------------------------- */

function TrialOfferScreen() {
  const { t } = useTranslation();
  const access = useStudioAccess()!;
  const navigate = useNavigate();
  const heading = useHeadingFocus();

  useEffect(() => trackStudioOnce("offer-viewed", "studio_trial_offer_viewed"), []);

  const points = ["full", "noCard", "save", "after", "kept"] as const;
  return (
    <AccessShell>
      <Card>
        <Eyebrow icon={Gift}>{t("studio.access.offer.eyebrow")}</Eyebrow>
        <div className="grid gap-3">
          <h1 ref={heading} tabIndex={-1} className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] outline-none">
            {t("studio.access.offer.title")}
          </h1>
          <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.access.offer.body")}</p>
        </div>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {points.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-[length:var(--text-body-md)] text-[var(--text-primary)]">
              <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                <Check size={12} strokeWidth={3} />
              </span>
              {t(`studio.access.offer.points.${key}`)}
            </li>
          ))}
        </ul>
        <div className="grid gap-2.5">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            iconRight={ArrowRight}
            loading={access.starting}
            disabled={access.starting}
            onClick={() => void access.startTrial()}
            className="gt-studio-cta !h-auto min-h-14 !whitespace-normal py-3"
          >
            {access.starting ? t("studio.access.offer.starting") : t("studio.access.offer.cta")}
          </Button>
          {access.startError && (
            <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
              {t("studio.access.offer.startError")}
            </p>
          )}
          <Button variant="ghost" fullWidth iconLeft={ArrowLeft} onClick={() => navigate(STUDIO_PATH)} disabled={access.starting}>
            {t("studio.access.backToStudioPage")}
          </Button>
        </div>
        <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("studio.access.offer.note")}
        </p>
      </Card>
    </AccessShell>
  );
}

function SignedOutScreen() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const heading = useHeadingFocus();
  return (
    <AccessShell>
      <Card>
        <Eyebrow icon={Gift}>{t("studio.access.signedOut.eyebrow")}</Eyebrow>
        <div className="grid gap-3">
          <h1 ref={heading} tabIndex={-1} className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] outline-none">
            {t("studio.access.signedOut.title")}
          </h1>
          <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.access.signedOut.body")}</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="primary" size="lg" fullWidth iconLeft={LogIn} onClick={() => navigate(`${SIGN_IN_PATH}?${RETURN_PARAM}=${encodeURIComponent(pathname)}`)}>
            {t("studio.access.signedOut.signIn")}
          </Button>
          <Button variant="outline" size="lg" fullWidth iconLeft={UserPlus} onClick={() => navigate("/inscription", { state: { from: pathname } })}>
            {t("studio.access.signedOut.register")}
          </Button>
        </div>
      </Card>
    </AccessShell>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const heading = useHeadingFocus();
  return (
    <AccessShell>
      <Card>
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
          <WifiOff size={20} />
        </span>
        <div className="grid gap-2" role="alert">
          <h1 ref={heading} tabIndex={-1} className="text-[length:var(--text-h2)] outline-none">
            {t("studio.access.error.title")}
          </h1>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("studio.access.error.body")}</p>
        </div>
        <Button variant="primary" iconLeft={RefreshCcw} onClick={onRetry} className="w-fit">
          {t("studio.access.error.retry")}
        </Button>
      </Card>
    </AccessShell>
  );
}

/* -------------------------------------------------------------------------- */

function LockedScreen({ state }: { state: StudioAccessKind }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const access = useStudioAccess()!;
  const navigate = useNavigate();
  const heading = useHeadingFocus();
  const [saved, setSaved] = useState<number | null | undefined>(undefined);
  const [chosen, setChosen] = useState<StudioPlan | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const pending = state === "subscription_pending";

  useEffect(() => {
    trackStudioOnce(`blocked:${state}`, "studio_trial_access_blocked", { state });
    if (!pending) trackStudioOnce(`plans:${state}`, "studio_subscription_plans_viewed", { surface: "studio_locked" });
  }, [state, pending]);

  useEffect(() => {
    let live = true;
    countSavedCreations()
      .then((n) => live && setSaved(n))
      .catch(() => live && setSaved(null));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (chosen) noticeRef.current?.focus();
  }, [chosen]);

  const choose = (plan: StudioPlan) => {
    trackStudio("studio_subscription_cta_clicked", {
      plan_id: plan.id,
      price_minor: plan.amountMinor,
      currency: plan.currency,
      surface: "studio_locked",
      checkout_available: false,
    });
    setChosen(plan);
  };

  const title = pending ? "pendingTitle" : state === "subscription_ended" ? "endedTitle" : "trialTitle";
  return (
    <AccessShell wide>
      <section className="mx-auto grid max-w-[760px] justify-items-center gap-4 pt-2 text-center">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-white/80 text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
          <Lock size={20} />
        </span>
        <h1 ref={heading} tabIndex={-1} className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] outline-none">
          {t(`studio.access.locked.${title}`)}
        </h1>
        <p className="m-0 max-w-[58ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">
          {t(pending ? "studio.access.locked.pendingBody" : "studio.access.locked.body")}
        </p>
        {saved !== undefined && (
          <p className="m-0 inline-flex max-w-[60ch] items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-white/75 px-4 py-2.5 text-left text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            <Check size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
            {saved ? t("studio.access.locked.kept", { count: saved }) : t("studio.access.locked.keptNone")}
          </p>
        )}
        {pending && (
          <Button variant="primary" iconLeft={RefreshCcw} onClick={() => void access.refresh()}>
            {t("studio.access.locked.refresh")}
          </Button>
        )}
      </section>

      {!pending && (
        <section aria-labelledby="studio-locked-plans" className="grid gap-4">
          <h2 id="studio-locked-plans" className="text-center text-[length:var(--text-h3)]">
            {t("studio.access.locked.plansTitle")}
          </h2>
          <StudioPaidPlans onChoose={choose} />
          <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.access.locked.pricesNote")}</p>
          {chosen && (
            <div
              ref={noticeRef}
              tabIndex={-1}
              role="status"
              className="mx-auto grid max-w-[680px] gap-2 rounded-[var(--radius-lg)] border border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none"
            >
              <strong className="inline-flex items-center gap-2">
                <Info size={15} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
                {t("studio.access.locked.notOpenTitle")}
              </strong>
              <p className="m-0">
                {t("studio.access.locked.notOpenBody", {
                  plan: `${t(`studio.plans.items.${chosen.id}.name`)} (${formatMoney(chosen.amountMinor, chosen.currency)})`,
                })}
              </p>
              <Link to="/contact" className="w-fit font-semibold underline underline-offset-2">
                {t("studio.access.locked.contact")}
              </Link>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={() => navigate("/compte")}>
          {t("studio.access.toAccount")}
        </Button>
        <Button variant="ghost" iconLeft={ArrowLeft} onClick={() => navigate(STUDIO_PATH)}>
          {t("studio.access.backToStudioPage")}
        </Button>
      </div>
    </AccessShell>
  );
}

/* -------------------------------------------------------------------------- */

/** A Studio visit counts as a new session after this long without one. */
const SESSION_GAP_MS = 30 * 60_000;
const SESSION_KEY = "gt-studio-session";

/**
 * Session analytics around the open editor: one session per tab visit (a
 * remount or a reload within 30 minutes continues it), `studio_return_visit`
 * when the session starts more than 30 minutes after the trial began, and the
 * session's length when the page is left.
 */
function SessionTracker({ children }: { children: ReactNode }) {
  const access = useStudioAccess();
  const info = access?.status.kind === "ready" ? access.status.info : null;
  // Read when the session starts; later re-reads of the state do not start a new one.
  const trial = useRef({ startedAt: info?.trialStartedAt ?? null, serverNow: info?.serverNow ?? null });
  const tracked = info !== null;
  const { userId } = useAuth();

  useEffect(() => {
    if (!tracked) return;
    let session: { id: string; startedAt: number; lastSeen: number } | null = null;
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch {
      session = null;
    }
    const now = Date.now();
    if (!session || now - session.lastSeen > SESSION_GAP_MS) {
      session = { id: crypto.randomUUID(), startedAt: now, lastSeen: now };
      const { startedAt, serverNow } = trial.current;
      const returning = startedAt !== null && serverNow !== null && serverNow - startedAt > SESSION_GAP_MS;
      trackStudio("studio_session_started", { session_id: session.id, is_first_session: !returning });
      if (returning) trackStudio("studio_return_visit", { session_id: session.id });
    }
    const current = session;
    const touch = () => {
      current.lastSeen = Date.now();
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
      } catch {
        /* storage blocked: the session ends with the page */
      }
    };
    let ended = false;
    const end = () => {
      touch();
      if (ended) return;
      ended = true;
      trackStudio("studio_session_ended", { session_id: current.id, session_seconds: Math.round((Date.now() - current.startedAt) / 1000) });
    };
    touch();
    const stopActivity = watchStudioActivity(studioStore, { userId, sessionId: current.id });
    const beat = window.setInterval(touch, 60_000);
    window.addEventListener("pagehide", end);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener("pagehide", end);
      stopActivity();
      end();
    };
  }, [tracked, userId]);

  return <>{children}</>;
}
