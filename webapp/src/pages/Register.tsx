import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, CircleAlert, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { StepProgress } from "../components/register/StepProgress";
import { ContextSummary } from "../components/register/ContextSummary";
import { AuthCard, AuthLayout } from "../components/auth/AuthScene";
import { GoogleDialog, type GoogleIdentity } from "../components/register/GoogleDialog";
import { LegalDialog, type LegalDoc } from "../components/register/LegalDialog";
import { VerifyEmail } from "../components/register/VerifyEmail";
import { CheckInbox } from "../components/register/CheckInbox";
import { WelcomeScreen, type WelcomeAction } from "../components/register/WelcomeScreen";
import { DemoPanel } from "../components/register/DemoPanel";
import { AccountStep } from "../components/register/steps/AccountStep";
import { ProfileStep } from "../components/register/steps/ProfileStep";
import { PreferencesStep, type CreateFailure } from "../components/register/steps/PreferencesStep";
import { useAuth } from "../lib/auth";
import { confirmationRedirect } from "../lib/authRedirect";
import { useProgress } from "../lib/progress";
import { useToast } from "../lib/toast";
import { FORGOT_PATH } from "../lib/accountSecurity";
import { DELIVERY_COUNTRIES } from "../data/countries";
import {
  EMPTY_REGISTRATION,
  RegistrationError,
  STEPS,
  checkEmailAvailable,
  contextParam,
  createAccount,
  fieldsForStep,
  resolveContext,
  validateField,
  validateStep,
  type ContextKind,
  type FieldName,
  type RegistrationData,
  type Scenario,
} from "../lib/registration";

type Phase = "form" | "verify" | "welcome";
type FormStep = "account" | "profile" | "preferences";

const FORM_STEPS: FormStep[] = ["account", "profile", "preferences"];

const normaliseEmail = (email: string) => email.trim().toLowerCase();

/**
 * The registration journey, at `/inscription`.
 *
 * Three short form steps, a simulated verification, and a welcome whose next
 * action follows the reason the visitor came: a plain sign-up, a purchase in
 * progress, or a training. The context arrives in the query string
 * (`?contexte=achat`, `?contexte=formation&formation=fondation`) or in history
 * state from the login wall, and is shown beside the form throughout so that
 * creating the account never reads as a detour.
 *
 * With Supabase configured, the last step creates the account through
 * Supabase Auth (`useAuth().signUp`): the answers travel as sign-up metadata,
 * which the database copies into the profile and the consent records, and
 * Supabase sends the confirmation email, whose link lands on
 * `/confirmation-compte`. Without Supabase, `lib/registration.ts` simulates
 * the service — mock inbox included — and nothing is stored.
 */
export function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { signedIn, restoring, realAuth, signIn, signUp, signOut, email: sessionEmail } = useAuth();
  const { openCourse } = useProgress();
  const { showToast } = useToast();

  const routeState = location.state as { from?: string; course?: string } | null;
  const context = useMemo(() => resolveContext(params, routeState), [params, routeState]);

  // Read once, as soon as a kept session is known: signing in at the end of this
  // journey must not swap the welcome screen for the "already signed in" one.
  const [arrival, setArrival] = useState<boolean | null>(restoring ? null : signedIn);
  if (arrival === null && !restoring) setArrival(signedIn);
  const signedInOnArrival = arrival === true;

  const [phase, setPhase] = useState<Phase>("form");
  const [step, setStep] = useState<FormStep>("account");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [data, setData] = useState<RegistrationData>(EMPTY_REGISTRATION);
  const [touched, setTouched] = useState<Set<FieldName>>(() => new Set());
  const [summary, setSummary] = useState<FieldName[]>([]);

  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  /** Last address the availability check cleared, so going back and forth does not re-check it. */
  const [clearedEmail, setClearedEmail] = useState<string | null>(null);

  const [viaGoogle, setViaGoogle] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<CreateFailure>(null);
  const [scenario, setScenario] = useState<Scenario>("success");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const fields = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});
  const pendingFocus = useRef<FieldName | null>(null);

  /* ---------------- form state ---------------- */

  const set = useCallback(<K extends FieldName>(name: K, value: RegistrationData[K]) => {
    setData((d) => ({ ...d, [name]: value }));
    if (name === "email") {
      setEmailTaken(false);
      setClearedEmail(null);
    }
    // Ticking the box is itself the fix, so its error clears at once.
    if (name === "terms") setTouched((prev) => new Set(prev).add("terms"));
  }, []);

  /** Errors appear on blur only once something was typed; an untouched field waits for Continue. */
  const blur = useCallback(
    (name: FieldName) => {
      const value = data[name];
      if (typeof value === "string" && value.trim() === "") return;
      setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
    },
    [data],
  );

  const fieldRef = useCallback(
    (name: FieldName) => (el: HTMLElement | null) => {
      fields.current[name] = el;
    },
    [],
  );

  const errors = useMemo(() => {
    const out: Partial<Record<FieldName, string>> = {};
    for (const name of touched) {
      const key = validateField(name, data);
      if (key) out[name] = t(key);
    }
    if (emailTaken && !out.email) out.email = t("register.errors.emailTaken");
    return out;
  }, [touched, data, emailTaken, t]);

  const liveSummary = summary.filter((name) => errors[name]);

  /* ---------------- navigation between steps ---------------- */

  const scrollToTop = () => {
    const el = topRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  };

  const goTo = (next: FormStep) => {
    setDirection(FORM_STEPS.indexOf(next) > FORM_STEPS.indexOf(step) ? "forward" : "back");
    setSummary([]);
    setStep(next);
    scrollToTop();
  };

  // Moves focus to the new step's heading (or a field flagged for attention)
  // whenever the step or phase changes. Keyed on the previous value rather than
  // a "first render" flag, so StrictMode's double effect cannot steal focus on load.
  const viewKey = `${phase}:${step}`;
  const lastView = useRef(viewKey);
  useEffect(() => {
    if (lastView.current === viewKey) return;
    lastView.current = viewKey;
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    const target = pending ? fields.current[pending] : headingRef.current;
    target?.focus({ preventScroll: true });
  }, [viewKey]);

  const focusField = (name: FieldName) => {
    const el = fields.current[name];
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "auto" });
  };

  /* ---------------- account service (simulated) ---------------- */

  const completeAccount = () => {
    // A real session was opened by the confirmation link (or by sign-up itself).
    if (realAuth) {
      setPhase("welcome");
      scrollToTop();
      return;
    }
    const country = data.country.toLowerCase();
    signIn(data.email, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone.trim() || undefined,
      country: (DELIVERY_COUNTRIES as readonly string[]).includes(country) ? country : undefined,
      newsletter: data.marketing,
    });
    setPhase("welcome");
    scrollToTop();
  };

  const emailTakenOnCreate = () => {
    setEmailTaken(true);
    setViaGoogle(false);
    pendingFocus.current = "email";
    goTo("account");
  };

  const create = async () => {
    setFailure(null);
    setCreating(true);
    if (realAuth) {
      const result = await signUp(data, i18n.language, confirmationRedirect(afterConfirmation));
      setCreating(false);
      switch (result) {
        case "confirmationSent":
          setPhase("verify");
          return scrollToTop();
        case "signedIn":
          return completeAccount();
        case "emailTaken":
          return emailTakenOnCreate();
        default:
          return setFailure(result);
      }
    }
    try {
      await createAccount(data, scenario);
      setCreating(false);
      // Google has already proven the address, so there is nothing to verify.
      if (viaGoogle) completeAccount();
      else {
        setPhase("verify");
        scrollToTop();
      }
    } catch (error) {
      setCreating(false);
      const code = error instanceof RegistrationError ? error.code : "server";
      if (code === "emailTaken") {
        emailTakenOnCreate();
      } else {
        setFailure(code === "network" ? "network" : "server");
      }
    }
  };

  const submitStep = async (e: FormEvent) => {
    e.preventDefault();
    if (checkingEmail || creating) return;

    const stepFields = fieldsForStep(step, viaGoogle);
    setTouched((prev) => new Set([...prev, ...stepFields]));
    const stepErrors = validateStep(step, data, viaGoogle);
    const invalid = stepFields.filter((f) => stepErrors[f]);
    if (step === "account" && emailTaken && !invalid.includes("email")) invalid.unshift("email");

    if (invalid.length > 0) {
      setSummary(invalid);
      focusField(invalid[0]);
      return;
    }
    setSummary([]);

    if (step === "account") {
      // The mock checks availability up front. Supabase Auth offers visitors no
      // such query — it would reveal who holds an account — so a taken address
      // is only reported when the account is created.
      if (!realAuth && !viaGoogle && clearedEmail !== normaliseEmail(data.email)) {
        setCheckingEmail(true);
        const available = await checkEmailAvailable(data.email);
        setCheckingEmail(false);
        if (!available) {
          setEmailTaken(true);
          focusField("email");
          return;
        }
        setClearedEmail(normaliseEmail(data.email));
      }
      goTo("profile");
    } else if (step === "profile") {
      goTo("preferences");
    } else {
      await create();
    }
  };

  const back = () => {
    const index = FORM_STEPS.indexOf(step);
    if (index > 0) goTo(FORM_STEPS[index - 1]);
  };

  /* ---------------- Google (simulated) ---------------- */

  const completeGoogle = useCallback(
    (identity: GoogleIdentity) => {
      setGoogleOpen(false);
      setViaGoogle(true);
      setEmailTaken(false);
      setClearedEmail(normaliseEmail(identity.email));
      setData((d) => ({
        ...d,
        email: identity.email,
        password: "",
        confirmPassword: "",
        firstName: d.firstName || identity.firstName,
        lastName: d.lastName || identity.lastName,
      }));
      showToast(t("register.google.toastTitle"), t("register.google.toastBody"));
      setDirection("forward");
      setSummary([]);
      setStep("profile");
    },
    [showToast, t],
  );

  const useEmailInstead = () => {
    setViaGoogle(false);
    setClearedEmail(null);
    setData((d) => ({ ...d, email: "" }));
    setTouched(new Set());
    pendingFocus.current = "email";
  };

  // After "use email instead" the email field reappears; focus it once it exists.
  useEffect(() => {
    if (!viaGoogle && pendingFocus.current === "email" && step === "account" && fields.current.email) {
      pendingFocus.current = null;
      fields.current.email.focus();
    }
  }, [viaGoogle, step]);

  /* ---------------- context and demo ---------------- */

  const courseId = context.kind === "training" ? context.courseId : "fondation";

  /** Where the confirmation page offers to continue, following the reason the visitor came. */
  const afterConfirmation =
    context.kind === "training" ? `/academy/formation/${courseId}` : context.kind === "purchase" ? "/panier" : "/compte";

  /** Google sign-in is not connected to Supabase yet: say so rather than pretend. */
  const openGoogle = () => {
    if (realAuth) showToast(t("authAlt.googleToastTitle"), t("authAlt.googleToastBody"), "info");
    else setGoogleOpen(true);
  };

  const changeContext = (kind: ContextKind) => {
    const next = new URLSearchParams({ contexte: contextParam(kind) });
    if (kind === "training") next.set("formation", courseId);
    setParams(next, { replace: true });
  };

  const restart = () => {
    setPhase("form");
    setStep("account");
    setDirection("back");
    setData(EMPTY_REGISTRATION);
    setTouched(new Set());
    setSummary([]);
    setEmailTaken(false);
    setClearedEmail(null);
    setViaGoogle(false);
    setFailure(null);
    setCreating(false);
    setCheckingEmail(false);
    if (signedIn && !signedInOnArrival) signOut();
    scrollToTop();
  };

  /** What the sign-in link carries, so signing in instead still finishes the same errand. */
  const signInState =
    routeState ?? (context.kind === "training" ? { from: "/academy/lecon", course: courseId } : context.kind === "purchase" ? { from: "/panier" } : undefined);

  const onWelcomeAction = (action: WelcomeAction) => {
    switch (action) {
      case "cart":
        return navigate("/panier");
      case "shop":
        return navigate("/boutique");
      case "academy":
        return navigate("/academy");
      case "course":
        return navigate(`/academy/formation/${courseId}`);
      case "dashboard":
        return navigate("/compte");
      case "checkout":
        // In this prototype, starting a training stands in for buying it — the
        // same call the course page's "Start this training" makes.
        openCourse(courseId);
        showToast(t("register.welcome.toastCheckoutTitle"), t("register.welcome.toastCheckoutBody"));
        return navigate("/academy/lecon");
    }
  };

  /* ---------------- render ---------------- */

  const progressStep = phase === "form" ? step : "done";
  const stepIndex = STEPS.indexOf(progressStep);

  const primaryLabel = creating
    ? t("register.actions.creating")
    : checkingEmail
      ? t("register.actions.checking")
      : step === "preferences"
        ? t("register.actions.create")
        : t("register.actions.continue");

  const crown = (
    <>
      <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("register.eyebrow")}</span>
      {signedInOnArrival && phase === "form" ? (
        <Badge tone="success" icon={BadgeCheck} className="justify-self-start">
          {t("auth.signedInBadge")}
        </Badge>
      ) : (
        <StepProgress current={progressStep} allDone={phase === "welcome"} />
      )}
    </>
  );

  return (
    <>
      <AuthLayout
        wide
        before={
          realAuth ? undefined : (
            <DemoPanel
              context={context.kind}
              onContextChange={changeContext}
              scenario={scenario}
              onScenarioChange={setScenario}
              onRestart={restart}
            />
          )
        }
      >
        <div ref={topRef} className="grid min-w-0 scroll-mt-24 gap-5">
          {arrival === null ? (
            <div aria-busy="true" className="min-h-[420px]" />
          ) : (
            <>
              {phase !== "welcome" && !signedInOnArrival && <ContextSummary context={context} />}

              <AuthCard crown={crown} label={t("register.cardLabel", { current: stepIndex + 1, total: STEPS.length })}>
                {signedInOnArrival && phase === "form" ? (
                  <div className="grid justify-items-start gap-4">
                    <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("register.signedIn.title")}</h1>
                    <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                      {t("register.signedIn.body", { email: sessionEmail })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" iconLeft={LayoutDashboard} onClick={() => navigate("/compte")}>
                        {t("register.welcome.ctaDashboard")}
                      </Button>
                      <Button
                        variant="outline"
                        iconLeft={LogOut}
                        onClick={() => {
                          signOut();
                          setArrival(false);
                        }}
                      >
                        {t("register.signedIn.signOut")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {phase === "form" ? (
                      <header className="mb-6 grid gap-2">
                        <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("register.title")}</h1>
                        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("register.lede")}</p>
                      </header>
                    ) : (
                      <h1 className="sr-only">{t("register.title")}</h1>
                    )}

                    {phase === "form" && (
                      <form noValidate onSubmit={submitStep} className="grid min-w-0">
                        {liveSummary.length > 1 && (
                          <div
                            role="alert"
                            className="gt-field-message mb-6 grid gap-2 rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4"
                          >
                            <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-error-fg)]">
                              <CircleAlert size={16} aria-hidden="true" />
                              {t("register.summary", { count: liveSummary.length })}
                            </p>
                            <ul className="m-0 grid gap-1 pl-6 text-[length:var(--text-caption)]">
                              {liveSummary.map((name) => (
                                <li key={name}>
                                  <button
                                    type="button"
                                    onClick={() => focusField(name)}
                                    className="text-left text-[var(--status-error-fg)] underline decoration-1 underline-offset-2 hover:text-[var(--gt-ink-900)]"
                                  >
                                    {errors[name]}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div key={step} className={direction === "forward" ? "gt-step-forward" : "gt-step-back"}>
                          {step === "account" && (
                            <AccountStep
                              data={data}
                              errors={errors}
                              set={set}
                              blur={blur}
                              fieldRef={fieldRef}
                              headingRef={headingRef}
                              touched={(name) => touched.has(name)}
                              checkingEmail={checkingEmail}
                              emailTaken={emailTaken}
                              viaGoogle={viaGoogle}
                              onGoogle={openGoogle}
                              onUseEmail={useEmailInstead}
                              signInState={signInState}
                              onForgotPassword={() => navigate(FORGOT_PATH, { state: { email: data.email.trim() } })}
                            />
                          )}
                          {step === "profile" && (
                            <ProfileStep data={data} errors={errors} set={set} blur={blur} fieldRef={fieldRef} headingRef={headingRef} />
                          )}
                          {step === "preferences" && (
                            <PreferencesStep
                              data={data}
                              errors={errors}
                              set={set}
                              blur={blur}
                              fieldRef={fieldRef}
                              headingRef={headingRef}
                              onOpenLegal={setLegalDoc}
                              failure={failure}
                              onRetry={() => void create()}
                              creating={creating}
                            />
                          )}
                        </div>

                        {/* On phones the actions stick to the bottom of the screen, so
                            Continue is always one thumb away on a long step. */}
                        <div className="gt-step-actions sticky bottom-0 z-10 -mx-5 mt-7 flex items-center gap-3 border-t border-[var(--border-subtle)] bg-white/90 px-5 py-3 backdrop-blur-[10px] sm:static sm:m-0 sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                          {step !== "account" && (
                            <Button variant="ghost" size="lg" iconLeft={ArrowLeft} onClick={back} disabled={creating} className="flex-none gap-0 px-4! sm:gap-2 sm:px-5!">
                              {/* Icon-only on phones so the primary action keeps its full label. */}
                              <span className="sr-only sm:not-sr-only">{t("register.actions.back")}</span>
                            </Button>
                          )}
                          <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            iconRight={ArrowRight}
                            loading={checkingEmail || creating}
                            className="min-w-0 flex-1 px-5! max-sm:text-[length:var(--text-body-sm)] sm:ml-auto sm:flex-none sm:px-[30px]!"
                          >
                            {primaryLabel}
                          </Button>
                        </div>
                      </form>
                    )}

                    {phase === "verify" && (
                      <div className="gt-step-forward">
                        {realAuth ? (
                          <CheckInbox
                            email={data.email}
                            redirectTo={confirmationRedirect(afterConfirmation)}
                            headingRef={headingRef}
                            onVerified={completeAccount}
                            onRestart={restart}
                          />
                        ) : (
                          <VerifyEmail
                            email={data.email}
                            firstName={data.firstName}
                            scenario={scenario}
                            headingRef={headingRef}
                            onEmailChange={(email) => {
                              setData((d) => ({ ...d, email }));
                              setClearedEmail(normaliseEmail(email));
                            }}
                            onVerified={completeAccount}
                          />
                        )}
                      </div>
                    )}

                    {phase === "welcome" && (
                      <WelcomeScreen
                        context={context}
                        firstName={data.firstName}
                        persona={data.persona}
                        interest={data.interest}
                        viaGoogle={viaGoogle}
                        headingRef={headingRef}
                        onAction={onWelcomeAction}
                      />
                    )}

                    {phase === "form" && (
                      <div className="mt-6 grid justify-items-center gap-2 border-t border-[var(--border-subtle)] pt-5 text-center">
                        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                          {t("register.haveAccount")}{" "}
                          <Link
                            to="/connexion"
                            state={signInState}
                            className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-link-hover)]"
                          >
                            {t("register.signIn")}
                          </Link>
                        </p>
                        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.reassurance")}</p>
                      </div>
                    )}
                  </>
                )}
              </AuthCard>
            </>
          )}
        </div>
      </AuthLayout>

      {googleOpen && (
        <GoogleDialog
          onClose={() => setGoogleOpen(false)}
          onComplete={completeGoogle}
          onSignIn={() => navigate("/connexion", { state: signInState })}
        />
      )}
      <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}
