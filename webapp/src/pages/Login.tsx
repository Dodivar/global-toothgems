import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, GraduationCap, Info, LogOut, ShoppingBag } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { Badge } from "../components/ui/Badge";
import { useAuth } from "../lib/auth";
import { useProgress } from "../lib/progress";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";

type Mode = "signIn" | "signUp";

/** Where a visitor lands when they reach the page on their own, with nothing pending. */
const DEFAULT_TARGET = "/compte";

const BENEFITS = [
  { icon: GraduationCap, titleKey: "auth.benefit1Title", bodyKey: "auth.benefit1Body" },
  { icon: BadgeCheck, titleKey: "auth.benefit2Title", bodyKey: "auth.benefit2Body" },
  { icon: ShoppingBag, titleKey: "auth.benefit3Title", bodyKey: "auth.benefit3Body" },
];

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signedIn, email: sessionEmail, signIn, signOut } = useAuth();
  const { openCourse } = useProgress();
  const { showToast } = useToast();

  /**
   * `from` is set by RequireAccount when it turned someone away from a gated
   * page, and by the training pages when a visitor asked to start a course.
   * `course` carries which one, so that purchase finishes on its own instead of
   * opening whichever course was active.
   */
  const { from, course: pendingCourse } = (location.state as { from?: string; course?: string } | null) ?? {};
  const target = from ?? DEFAULT_TARGET;

  const [mode, setMode] = useState<Mode>("signIn");
  // Prefilled with the same demo identity the checkout uses, so the flow can be
  // walked through without typing. Authentication is not wired up yet: submitting
  // simply continues to the page the visitor asked for.
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "camille@studio.fr",
    password: "gemstudio",
  });
  const [terms, setTerms] = useState(false);
  const [newsletter, setNewsletter] = useState(true);

  const signUp = mode === "signUp";
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The name is only asked for on sign-up; signing in falls back to the email.
    signIn(
      form.email || "camille@studio.fr",
      signUp ? { firstName: form.firstName, lastName: form.lastName } : undefined,
    );
    // Finishes what the visitor came here for: the training they chose is added
    // to the account, so the player opens on it. `openCourse` ignores an id no
    // course carries.
    if (pendingCourse) openCourse(pendingCourse);
    showToast(
      t(signUp ? "auth.toastSignUpTitle" : "auth.toastSignInTitle"),
      t(signUp ? "auth.toastSignUpBody" : "auth.toastSignInBody"),
    );
    // `replace` so the browser Back button returns to the page the visitor came
    // from rather than bouncing them into the login wall again.
    navigate(target, { replace: true });
  };

  if (signedIn) {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-5 px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
        <Badge tone="success" icon={BadgeCheck}>{t("auth.signedInBadge")}</Badge>
        <h1 className="text-[length:var(--text-h1)]">{t("auth.signedInTitle")}</h1>
        <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
          {t("auth.signedInBody", { email: sessionEmail })}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/compte")}>
            {t("auth.signedInAccount")}
          </Button>
          <Button variant="outline" onClick={() => navigate("/academy")}>
            {t("auth.signedInAcademy")}
          </Button>
          <Button variant="outline" iconLeft={LogOut} onClick={() => signOut()}>
            {t("auth.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-start gap-[clamp(32px,5vw,64px)] px-[clamp(14px,4vw,48px)] py-[clamp(40px,6vw,80px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="grid gap-6">
        <div className="grid gap-3">
          <span className="gt-eyebrow">{t("auth.eyebrow")}</span>
          <h1 className="text-[length:var(--text-h1)]">{t(signUp ? "auth.signUpTitle" : "auth.signInTitle")}</h1>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">
            {t(signUp ? "auth.signUpBody" : "auth.signInBody")}
          </p>
        </div>

        {/* Says why they are here. Without it, being bounced out of a course into
            a login form reads as an error rather than as the rule. */}
        {from && (
          <p
            role="status"
            className="m-0 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-info-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]"
          >
            <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
            <span>{t("auth.gateNotice")}</span>
          </p>
        )}

        <div role="group" aria-label={t("auth.modeSwitchLabel")} className="flex gap-1 rounded-[var(--radius-control)] bg-[var(--surface-sunken)] p-1">
          {(["signIn", "signUp"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(m)}
                className="flex-1 rounded-[var(--radius-control)] px-4 py-2.5 text-[length:var(--text-body-sm)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                style={{
                  background: active ? "var(--surface-card)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: active ? "var(--shadow-xs)" : "none",
                }}
              >
                {t(m === "signIn" ? "auth.tabSignIn" : "auth.tabSignUp")}
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)]">
          {signUp && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="auth-first-name"
                label={t("auth.firstName")}
                autoComplete="given-name"
                value={form.firstName}
                onChange={set("firstName")}
              />
              <Input
                id="auth-last-name"
                label={t("auth.lastName")}
                autoComplete="family-name"
                value={form.lastName}
                onChange={set("lastName")}
              />
            </div>
          )}
          <Input
            id="auth-email"
            label={t("auth.email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
          />
          <Input
            id="auth-password"
            label={t("auth.password")}
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            value={form.password}
            onChange={set("password")}
          />
          {signUp ? (
            <div className="grid gap-3">
              <Checkbox label={t("auth.terms")} description={t("auth.termsDescription")} checked={terms} onChange={setTerms} />
              <Checkbox
                label={t("auth.newsletter")}
                description={t("auth.newsletterDescription")}
                checked={newsletter}
                onChange={setNewsletter}
              />
            </div>
          ) : (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("auth.passwordHint")}</p>
          )}
          <Button type="submit" variant="primary" size="lg" fullWidth iconRight={ArrowRight}>
            {t(signUp ? "auth.submitSignUp" : "auth.submitSignIn")}
          </Button>
          <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("auth.mockNote")}</p>
        </form>

        {/* The other half of the rule: the shop never asks for an account. */}
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("auth.guestNote")}{" "}
          <Link to="/boutique" className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]">
            {t("auth.guestCta")}
          </Link>
        </p>
      </section>

      <aside className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-inverse)] text-[var(--text-inverse)]">
        <div className="gt-sparkle relative aspect-[4/3] lg:aspect-[3/2]">
          <img
            src={photo("img-12.jpg")}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="grid gap-5 p-[var(--space-6)]">
          <h2 className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">{t("auth.benefitsTitle")}</h2>
          <ul className="m-0 grid list-none gap-4 p-0">
            {BENEFITS.map(({ icon: Icon, titleKey, bodyKey }) => (
              <li key={titleKey} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10 text-[var(--gt-blue-300)]">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="grid gap-0.5">
                  <strong className="text-[length:var(--text-body-sm)] text-[var(--gt-off-white)]">{t(titleKey)}</strong>
                  <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">{t(bodyKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
