import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, CircleAlert, Eye, EyeOff, Info, LogOut } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Badge } from "../components/ui/Badge";
import { ShapeGlyph, GLYPH_PATHS } from "../components/ui/ShapeGlyph";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";

/**
 * The alternative authentication direction, served at `/connexion-b` beside the
 * existing page at `/connexion`, the same way `/accueil-b` sits beside `/`.
 *
 * Nothing functional changes: the same `useAuth().signIn` mock, the same two
 * modes, the same fields, the same `auth.*` copy and the same "where do I send
 * them afterwards" rule. What changes is the art direction and the hierarchy.
 *
 * The existing page is a form card with a dark benefits panel bolted to its
 * side — a layout any product could wear. This direction makes the page a
 * *setting*, in the jewellery sense: the authentication card is the stone, and
 * everything around it is the mount. The card wears a pastel-blue crown headed
 * by the facet band cut from the catalogue's own gem glyphs; the page sits on a
 * flat pastel field with one oversized brand cut drawn into it; and the
 * editorial column holds an emerald-cut photograph with its own offset outline.
 *
 * Colour is rationed on purpose: pastel blue carries the whole surface, emerald
 * appears on exactly one control (the primary submit), and fuchsia is reduced to
 * two small sparkle marks. The script face appears once, as a decorative
 * initial, never on a label, an instruction or legal copy.
 */

type Mode = "signIn" | "signUp";

/** Where a visitor lands when they reach the page on their own, with nothing pending. */
const DEFAULT_TARGET = "/compte";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

/** Shared page gutter, matched to the rest of the site. */
const GUTTER = "px-[clamp(14px,4vw,48px)]";

/**
 * Emerald-cut silhouette: the chamfered corners of a step-cut stone. Used for
 * the photograph and, as an identical SVG polygon, for the outline behind it —
 * a clipped border loses its own cut corners, so the outline is drawn, not
 * clipped.
 */
const CUT_CLIP = "polygon(11% 0, 89% 0, 100% 8%, 100% 92%, 89% 100%, 11% 100%, 0 92%, 0 8%)";
const CUT_POINTS = "11,0 89,0 100,8 100,92 89,100 11,100 0,92 0,8";

/**
 * The three reasons to hold an account, carried over verbatim. The generic
 * lucide icons of the existing page are replaced by the catalogue's own gem
 * cuts: the brand already owns a set of marks, so the page uses them.
 */
const BENEFITS = [
  { shape: "round", titleKey: "auth.benefit1Title", bodyKey: "auth.benefit1Body" },
  { shape: "navette", titleKey: "auth.benefit2Title", bodyKey: "auth.benefit2Body" },
  { shape: "star", titleKey: "auth.benefit3Title", bodyKey: "auth.benefit3Body" },
] as const;

/** Four-point mark. Decorative only — every instance is hidden from assistive tech. */
function Sparkle({ size = 16, className = "", color = "currentColor" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12 1.5c.7 5.4 4.4 9.1 9.8 9.8 .1 0 .1.4 0 .4-5.4.7-9.1 4.4-9.8 9.8-.1.1-.4.1-.4 0-.7-5.4-4.4-9.1-9.8-9.8-.1 0-.1-.4 0-.4 5.4-.7 9.1-4.4 9.8-9.8 0-.1.4-.1.4 0Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * The page's field: a flat pastel plane with one oversized brand cut drawn into
 * it. It is the catalogue's own `round` glyph, scaled up until the facet lines
 * read as architecture rather than as an icon — which is what keeps the surface
 * from being "a gradient".
 */
function FacetField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gt-blue-50)]" />
      {/* Centred roughly on the card, so the card's own body masks the middle and
          only the facet rays come out around it — the stone in its setting. */}
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="absolute -right-[22%] -top-[26%] h-[86vw] max-h-[840px] w-[86vw] max-w-[840px] text-[var(--gt-blue-300)] lg:-right-[10%] lg:-top-[20%]"
        style={{ opacity: 0.85 }}
      >
        <path d={GLYPH_PATHS.round.outline} stroke="currentColor" strokeWidth={0.06} fill="none" />
        <path d={GLYPH_PATHS.round.facets} stroke="currentColor" strokeWidth={0.045} fill="none" />
      </svg>
      {/* Fuchsia, once, small: the whole budget for the accent on this surface. */}
      <Sparkle size={20} color="var(--gt-fuchsia-300)" className="absolute left-[6%] top-[22%] hidden lg:block" />
      <Sparkle size={12} color="var(--gt-blue-400)" className="absolute left-[46%] top-[12%] hidden lg:block" />
    </div>
  );
}

/**
 * The crown facets, as a band across the top of the card. Twelve triangles on a
 * baseline, stretched to the card width — the same geometry the gem glyphs draw
 * at 32px, which is what ties the card to the product marks.
 */
function FacetBand() {
  return (
    <svg
      viewBox="0 0 240 16"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-x-0 top-0 h-[16px] w-full text-[var(--gt-blue-600)]"
    >
      <path
        d="M0 16L20 0L40 16L60 0L80 16L100 0L120 16L140 0L160 16L180 0L200 16L220 0L240 16"
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={0.5}
      />
      <path d="M0 15.5H240" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.3} />
    </svg>
  );
}

/**
 * Login / create-account switch.
 *
 * A sliding indicator rather than two repainted buttons: the movement is what
 * says "same panel, other state" instead of "new page". It is one transform over
 * `--duration-normal`, which `prefers-reduced-motion` already collapses to 1ms
 * through the token override in `index.css`.
 *
 * Buttons with `aria-pressed`, not a tablist: the panel below is a form, not a
 * tabpanel, and pressed state is what a screen reader should hear here.
 */
function ModeSwitch({ mode, onChange, label }: { mode: Mode; onChange: (m: Mode) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={label}
      className="relative flex rounded-[var(--radius-control)] bg-white/45 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.65)]"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-[var(--radius-control)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]"
        style={{ transform: mode === "signUp" ? "translateX(100%)" : "translateX(0)" }}
      />
      {(["signIn", "signUp"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className="relative z-10 flex-1 rounded-[var(--radius-control)] px-4 py-2.5 text-[length:var(--text-body-sm)] font-semibold transition-colors duration-[var(--duration-fast)]"
            style={{ color: active ? "var(--text-primary)" : "var(--gt-blue-700)" }}
          >
            {t(m === "signIn" ? "auth.tabSignIn" : "auth.tabSignUp")}
          </button>
        );
      })}
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Rendered inside the pill, on the right — the password reveal lives here. */
  trailing?: ReactNode;
}

/**
 * Authentication input.
 *
 * Deliberately not `ui/Input`: that component is a label and a control, with no
 * room for an error, a hint or a trailing button, and widening it would touch
 * every form on the site. The visual contract is copied from it exactly — same
 * eyebrow label, same pill, same tokens — so the two cannot drift apart
 * visually, only in what they can hold.
 *
 * The error is never colour alone: it carries an icon, sits under the field as
 * text, and is wired to the input through `aria-describedby` + `aria-invalid`.
 */
function Field({ id, label, error, hint, trailing, className = "", ...rest }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-[var(--radius-control)] border bg-[var(--surface-card)] px-[18px] text-[length:var(--text-body-sm)] text-[var(--text-primary)] transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-[var(--text-subtle)] hover:border-[var(--gt-blue-500)] focus:border-[var(--gt-ink-900)] focus:shadow-[var(--shadow-focus)] ${trailing ? "pr-[52px]" : ""} ${className}`}
          style={{ borderColor: error ? "var(--status-error-fg)" : "var(--border-default)" }}
          {...rest}
        />
        {trailing && <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>}
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]"
        >
          <CircleAlert size={13} aria-hidden="true" className="flex-none" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The Google "G", inline so the button needs no network request. */
function GoogleMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="flex-none">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.4Z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.3 15.4 46 24 46Z" />
      <path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7Z" />
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.7 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9 12.3-9Z" />
    </svg>
  );
}

/**
 * Federated sign-in, visual only.
 *
 * There is no OAuth behind it and there is not meant to be: the button exists so
 * the layout, the weight and the states of a Google entry point can be judged
 * next to the real form. Pressing it says so rather than pretending to work.
 * Styled as the `outline` button variant at `lg`, so it reads as the secondary
 * of the pair without inventing a new control.
 */
function GoogleButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-14 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] sm:px-[30px] sm:text-[length:var(--text-body-md)] text-[var(--text-primary)] transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
    >
      <GoogleMark />
      <span>{label}</span>
    </button>
  );
}

/** The card shell: crown, facet band, decorative initial, then whatever it holds. */
function AuthCard({ children, crown }: { children: ReactNode; crown: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]">
      <div className="relative overflow-hidden bg-[var(--gt-blue-200)] px-[clamp(20px,4vw,32px)] pb-5 pt-7">
        <FacetBand />
        {/* The one decorative-script moment on the page: a large initial, the
            use the design system explicitly sanctions. Hidden from readers. */}
        <span
          aria-hidden="true"
          className="gt-script pointer-events-none absolute -top-9 right-2 select-none text-[150px] leading-none text-white/70"
        >
          G
        </span>
        <div className="relative grid gap-4">{crown}</div>
      </div>
      <div className="px-[clamp(20px,4vw,32px)] py-[clamp(24px,3vw,32px)]">{children}</div>
    </div>
  );
}

export function ConnexionEditorial() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signedIn, email: sessionEmail, signIn, signOut } = useAuth();
  const { showToast } = useToast();

  /** Set by RequireAccount when it turned someone away from a gated page. */
  const from = (location.state as { from?: string } | null)?.from;
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
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  // The submit is a timed mock. Without this the timeout can fire after the
  // visitor has navigated away, and React is asked to set state on a gone page.
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const signUp = mode === "signUp";
  const fieldId = (key: string) => `auth-b-${key}`;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    // Clear the complaint as soon as the field is touched: keeping it up while
    // someone is fixing it is the part of inline validation people hate.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
  };

  /** Client-side shape checks only. Nothing here is security — see `lib/auth`. */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (signUp && !form.firstName.trim()) next.firstName = t("authAlt.errorFirstName");
    if (signUp && !form.lastName.trim()) next.lastName = t("authAlt.errorLastName");
    if (!EMAIL_RE.test(form.email.trim())) next.email = t("authAlt.errorEmail");
    if (form.password.length < MIN_PASSWORD) next.password = t("authAlt.errorPassword", { min: MIN_PASSWORD });
    if (signUp && !terms) next.terms = t("authAlt.errorTerms");
    return next;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const firstField = ["firstName", "lastName", "email", "password"].find((k) => found[k]);
    if (firstField) {
      document.getElementById(fieldId(firstField))?.focus();
      return;
    }
    if (Object.keys(found).length > 0) return;

    // The pending state is the point: a real sign-in has latency, and the
    // button has to show it rather than freeze.
    setBusy(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // The name is only asked for on sign-up; signing in falls back to the email.
      signIn(
        form.email || "camille@studio.fr",
        signUp ? { firstName: form.firstName, lastName: form.lastName } : undefined,
      );
      showToast(
        t(signUp ? "auth.toastSignUpTitle" : "auth.toastSignInTitle"),
        t(signUp ? "auth.toastSignUpBody" : "auth.toastSignInBody"),
      );
      // `replace` so the browser Back button returns to the page the visitor came
      // from rather than bouncing them into the login wall again.
      navigate(target, { replace: true });
    }, 700);
  };

  if (signedIn) {
    return (
      <div className={`relative isolate ${GUTTER} py-[clamp(48px,7vw,96px)]`}>
        <FacetField />
        <div className="mx-auto w-full max-w-[480px]">
          <AuthCard
            crown={
              <>
                <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("auth.eyebrow")}</span>
                <Badge tone="success" icon={BadgeCheck} className="justify-self-start">
                  {t("auth.signedInBadge")}
                </Badge>
              </>
            }
          >
            <div className="grid gap-5">
              <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("auth.signedInTitle")}</h1>
              <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
                {t("auth.signedInBody", { email: sessionEmail })}
              </p>
              <div className="grid gap-3">
                <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate("/compte")}>
                  {t("auth.signedInAccount")}
                </Button>
                <Button variant="outline" size="lg" fullWidth onClick={() => navigate("/academy")}>
                  {t("auth.signedInAcademy")}
                </Button>
                <Button variant="ghost" fullWidth iconLeft={LogOut} onClick={() => signOut()}>
                  {t("auth.signOut")}
                </Button>
              </div>
            </div>
          </AuthCard>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative isolate ${GUTTER} py-[clamp(32px,5vw,80px)]`}>
      <FacetField />

      <div className="mx-auto grid w-full max-w-[var(--max-width-content)] items-start gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* ---------------------------------------------------------------- */}
        {/* Editorial column. Second on a phone: the form is what the visitor
            came for, and a 46vh photograph above it would push the first input
            off the screen. */}
        {/* ---------------------------------------------------------------- */}
        <section className="order-2 mx-auto grid w-full max-w-[560px] gap-[clamp(24px,3vw,40px)] lg:order-1 lg:mx-0 lg:max-w-none lg:pt-4">
          <figure className="relative m-0 lg:max-w-[480px]">
            {/* The outline is the stone's echo, offset like a printed register
                mark. Drawn as a polygon because a clipped border loses exactly
                the corners that make the cut readable. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
              className="absolute -left-3 -top-3 h-full w-full sm:-left-4 sm:-top-4"
            >
              <polygon
                points={CUT_POINTS}
                fill="none"
                stroke="var(--gt-blue-400)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div
              className="gt-sparkle relative aspect-[16/11] w-full overflow-hidden lg:aspect-[5/6]"
              style={{ clipPath: CUT_CLIP }}
            >
              <img
                src={photo("mouth-02.jpg")}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </figure>

          <div className="grid gap-4">
            <h2 className="flex items-center gap-2.5 text-[length:var(--text-h4)]">
              <Sparkle size={14} color="var(--gt-fuchsia-400)" />
              {t("auth.benefitsTitle")}
            </h2>
            <ul className="m-0 grid list-none gap-0 p-0">
              {BENEFITS.map(({ shape, titleKey, bodyKey }) => (
                <li
                  key={titleKey}
                  className="flex items-start gap-4 border-t border-[var(--gt-blue-200)] py-4 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span className="mt-0.5 flex-none text-[var(--gt-blue-500)]">
                    <ShapeGlyph shape={shape} size={26} />
                  </span>
                  <span className="grid gap-0.5">
                    <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(titleKey)}</strong>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(bodyKey)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The other half of the rule: the shop never asks for an account. */}
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("auth.guestNote")}{" "}
            <Link
              to="/boutique"
              className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-link-hover)]"
            >
              {t("auth.guestCta")}
            </Link>
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* The card. */}
        {/* ---------------------------------------------------------------- */}
        <div className="order-1 mx-auto w-full max-w-[560px] lg:order-2 lg:sticky lg:top-6 lg:mx-0 lg:max-w-none">
          <AuthCard
            crown={
              <>
                <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("auth.eyebrow")}</span>
                <ModeSwitch mode={mode} onChange={switchMode} label={t("auth.modeSwitchLabel")} />
              </>
            }
          >
            <div className="grid gap-5">
              {/* Keyed on the mode so the swap replays: one short lift, which
                  `prefers-reduced-motion` removes entirely. */}
              <div key={mode} className="gt-auth-swap grid gap-2">
                <h1 className="text-[clamp(26px,3.4vw,34px)]">{t(signUp ? "auth.signUpTitle" : "auth.signInTitle")}</h1>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  {t(signUp ? "auth.signUpBody" : "auth.signInBody")}
                </p>
              </div>

              {/* Says why they are here. Without it, being bounced out of a course
                  into a login form reads as an error rather than as the rule. */}
              {from && (
                <p
                  role="status"
                  className="m-0 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-info-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]"
                >
                  <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                  <span>{t("auth.gateNotice")}</span>
                </p>
              )}

              <form onSubmit={submit} noValidate className="grid gap-4">
                {signUp && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      id={fieldId("firstName")}
                      label={t("auth.firstName")}
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={set("firstName")}
                      error={errors.firstName || undefined}
                    />
                    <Field
                      id={fieldId("lastName")}
                      label={t("auth.lastName")}
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={set("lastName")}
                      error={errors.lastName || undefined}
                    />
                  </div>
                )}

                <Field
                  id={fieldId("email")}
                  label={t("auth.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set("email")}
                  error={errors.email || undefined}
                />

                <Field
                  id={fieldId("password")}
                  label={t("auth.password")}
                  type={reveal ? "text" : "password"}
                  autoComplete={signUp ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={set("password")}
                  error={errors.password || undefined}
                  hint={signUp ? t("authAlt.passwordRule", { min: MIN_PASSWORD }) : undefined}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setReveal((v) => !v)}
                      aria-pressed={reveal}
                      aria-controls={fieldId("password")}
                      aria-label={t(reveal ? "authAlt.hidePassword" : "authAlt.showPassword")}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
                    >
                      {reveal ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                    </button>
                  }
                />

                {signUp ? (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Checkbox
                        label={t("auth.terms")}
                        description={t("auth.termsDescription")}
                        checked={terms}
                        onChange={(v) => {
                          setTerms(v);
                          if (v) setErrors((prev) => (prev.terms ? { ...prev, terms: "" } : prev));
                        }}
                      />
                      {errors.terms && (
                        <p
                          role="alert"
                          className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]"
                        >
                          <CircleAlert size={13} aria-hidden="true" className="flex-none" />
                          {errors.terms}
                        </p>
                      )}
                    </div>
                    <Checkbox
                      label={t("auth.newsletter")}
                      description={t("auth.newsletterDescription")}
                      checked={newsletter}
                      onChange={setNewsletter}
                    />
                  </div>
                ) : (
                  // Recovery is not built yet, so the link says what it is rather
                  // than opening a dead end. The existing hint copy is the answer.
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => showToast(t("authAlt.forgotToastTitle"), t("auth.passwordHint"), "info")}
                      className="rounded-[var(--radius-xs)] text-[length:var(--text-body-sm)] font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--text-link-hover)]"
                    >
                      {t("authAlt.forgot")}
                    </button>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} iconRight={ArrowRight}>
                  {t(signUp ? "auth.submitSignUp" : "auth.submitSignIn")}
                </Button>

                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                  <span className="gt-eyebrow">{t("authAlt.orContinue")}</span>
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                </div>

                <GoogleButton
                  label={t("authAlt.google")}
                  disabled={busy}
                  onClick={() => showToast(t("authAlt.googleToastTitle"), t("authAlt.googleToastBody"), "info")}
                />
              </form>

              <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-5">
                {/* The tabs are the primary switch; this is the sentence that
                    catches everyone who read to the bottom instead. */}
                <p className="m-0 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t(signUp ? "authAlt.switchToSignInPrompt" : "authAlt.switchToSignUpPrompt")}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(signUp ? "signIn" : "signUp")}
                    className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--text-link-hover)]"
                  >
                    {t(signUp ? "authAlt.switchToSignInCta" : "authAlt.switchToSignUpCta")}
                  </button>
                </p>
                <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("auth.mockNote")}
                </p>
              </div>
            </div>
          </AuthCard>
        </div>
      </div>
    </div>
  );
}
