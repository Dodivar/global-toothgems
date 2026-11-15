import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { CircleAlert } from "lucide-react";
import { photo } from "../../lib/images";
import { AppleMark } from "./AppleMark";

/**
 * The shared setting of the authentication pages — `/connexion`, `/inscription`
 * and the account-confirmation landing. The page sits on a flat pastel field;
 * beside the card, a burst of the shop's own gems (the home carousel's cut-outs)
 * flies out of the centre once and then drifts gently, above the three reasons
 * to hold an account, set as cards.
 *
 * Colour is rationed on purpose: pastel blue carries the whole surface, emerald
 * appears on exactly one control (the primary submit), and fuchsia is reduced to
 * small sparkle marks. The gems are the page's only decoration, never a label,
 * an instruction or legal copy.
 */

/** Shared page gutter, matched to the rest of the site. */
const AUTH_GUTTER = "px-[clamp(14px,4vw,48px)]";

/**
 * The three reasons to hold an account, each with one shop gem as its mark: the
 * brand already owns a set of stones, so the page uses them instead of icons.
 */
const BENEFITS = [
  { gem: "gem-round-saphir.webp", titleKey: "auth.benefit1Title", bodyKey: "auth.benefit1Body" },
  { gem: "gem-navette-bermuda-blue.webp", titleKey: "auth.benefit2Title", bodyKey: "auth.benefit2Body" },
  { gem: "gem-gold-star.webp", titleKey: "auth.benefit3Title", bodyKey: "auth.benefit3Body" },
] as const;

/**
 * The burst: shop gems thrown out from the centre of the panel. A fixed layout
 * (never random at render time, which would break hydration); `x`/`y` are the
 * piece's centre in % of the panel, `size` its width in % of the panel's width.
 */
const BURST: { photo: string; x: number; y: number; size: number; rot: number }[] = [
  { photo: "gem-heart-fuchsia.webp", x: 30, y: 34, size: 13, rot: 20 },
  { photo: "gem-diamond-violet.webp", x: 70, y: 30, size: 13, rot: -25 },
  { photo: "gem-rivoli-bermuda-blue.webp", x: 50, y: 50, size: 12, rot: -12 },
  { photo: "gem-starflower-light-topaz.webp", x: 16, y: 62, size: 11, rot: 40 },
  { photo: "gem-navette-emeraude.webp", x: 84, y: 64, size: 11, rot: 10 },
  { photo: "gem-gold-star.webp", x: 36, y: 78, size: 10, rot: -30 },
  { photo: "gem-heart-aquamarine.webp", x: 64, y: 78, size: 11, rot: 15 },
  { photo: "gem-raindrop-heliotrope.webp", x: 91, y: 22, size: 8, rot: -10 },
  { photo: "gem-baguette-peridot.webp", x: 9, y: 24, size: 9, rot: 25 },
  { photo: "gem-rivoli-crystal-ab.webp", x: 21, y: 88, size: 8, rot: 60 },
  { photo: "gem-square-aquamarine.webp", x: 78, y: 10, size: 8, rot: -40 },
  { photo: "gem-round-saphir.webp", x: 46, y: 14, size: 9, rot: 30 },
  { photo: "gem-gold-heart.webp", x: 91, y: 88, size: 7, rot: 5 },
  { photo: "gem-heart-siam.webp", x: 22, y: 12, size: 9, rot: -18 },
  { photo: "gem-round-emeraude.webp", x: 65, y: 55, size: 7, rot: 0 },
  { photo: "gem-gold-lightning.webp", x: 35, y: 56, size: 7, rot: 18 },
  { photo: "gem-starflower-amethyste.webp", x: 8, y: 44, size: 7, rot: -8 },
  { photo: "gem-raindrop-light-siam.webp", x: 94, y: 46, size: 7, rot: 22 },
];

/** Four-point mark. Decorative only — every instance is hidden from assistive tech. */
export function Sparkle({ size = 16, className = "", color = "currentColor" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12 1.5c.7 5.4 4.4 9.1 9.8 9.8 .1 0 .1.4 0 .4-5.4.7-9.1 4.4-9.8 9.8-.1.1-.4.1-.4 0-.7-5.4-4.4-9.1-9.8-9.8-.1 0-.1-.4 0-.4 5.4-.7 9.1-4.4 9.8-9.8 0-.1.4-.1.4 0Z"
        fill={color}
      />
    </svg>
  );
}

/** The page's field: a flat pastel plane with two small sparkle marks. */
function FacetField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gt-blue-50)]" />
      {/* Fuchsia, once, small: the whole budget for the accent on this surface. */}
      <Sparkle size={20} color="var(--gt-fuchsia-300)" className="absolute left-[6%] top-[22%] hidden lg:block" />
      <Sparkle size={12} color="var(--gt-blue-400)" className="absolute left-[46%] top-[12%] hidden lg:block" />
    </div>
  );
}

/**
 * The crown of the sign-in card: what the account covers, then a two-way switch
 * between signing in and creating an account. The current side is plain text
 * marked `aria-current`; the other is a link carrying the page's history state,
 * so a visitor sent by a course, the cart or the Studio still finishes that
 * errand whichever side they choose.
 */
export function AuthModeSwitch({ current, state }: { current: "signIn" | "signUp"; state?: unknown }) {
  const { t } = useTranslation();
  const sides = [
    { key: "signIn", to: "/connexion", label: t("authSwitch.signIn") },
    { key: "signUp", to: "/inscription", label: t("authSwitch.signUp") },
  ] as const;
  const pill =
    "flex min-h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] px-2 text-center text-[length:var(--text-caption)] font-semibold sm:px-3 sm:text-[length:var(--text-body-sm)]";
  return (
    <>
      <p className="m-0 flex items-center gap-2 text-balance text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)]">
        <Sparkle size={12} color="var(--gt-fuchsia-400)" className="flex-none" />
        {t("authSwitch.oneAccount")}
      </p>
      <nav aria-label={t("authSwitch.label")} className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-white/55 p-1">
        {sides.map((side) =>
          side.key === current ? (
            <span key={side.key} aria-current="page" className={`${pill} bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]`}>
              {side.label}
            </span>
          ) : (
            <Link
              key={side.key}
              to={side.to}
              state={state}
              className={`${pill} text-[var(--gt-blue-700)] transition-colors duration-[var(--duration-fast)] hover:bg-white/70 hover:text-[var(--text-primary)]`}
            >
              {side.label}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}

/**
 * The card shell: a pastel crown, then whatever it holds.
 *
 * `overflow-clip` rather than `overflow-hidden`: clipping keeps the rounded
 * corners without making the card a scroll container, so a sticky action bar
 * inside it (the registration steps on a phone) still sticks to the viewport.
 */
export function AuthCard({ children, crown, label }: { children: ReactNode; crown: ReactNode; label?: string }) {
  return (
    <section
      aria-label={label}
      className="min-w-0 overflow-clip rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]"
    >
      <div className="grid gap-4 bg-[var(--gt-blue-200)] px-[clamp(20px,4vw,32px)] py-6">{crown}</div>
      <div className="px-5 py-6 sm:px-8 sm:py-8">{children}</div>
    </section>
  );
}

/**
 * The burst panel: each gem flies out from the centre once (`gt-auth-burst`,
 * staggered), then floats like the home carousel's stones. The fly-out is
 * measured in container units, so it starts from the panel's true centre at
 * any width. Purely decorative.
 */
function GemBurst() {
  return (
    <div
      aria-hidden="true"
      className="gt-auth-burst-panel relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--gt-blue-100)] lg:aspect-[5/4]"
    >
      <span className="absolute inset-[22%] rounded-full bg-white/70 blur-3xl" />
      {BURST.map((g, i) => (
        <span
          key={g.photo}
          className="gt-auth-burst absolute block aspect-square"
          style={
            {
              left: `${g.x - g.size / 2}%`,
              top: `calc(${g.y}% - ${g.size / 2}cqw)`,
              width: `${g.size}%`,
              "--burst-dx": `${50 - g.x}cqw`,
              "--burst-dy": `${50 - g.y}cqh`,
              animationDelay: `${i * 35}ms`,
            } as CSSProperties
          }
        >
          {/* Fitted in a square box: tall cuts (raindrops, navettes) keep the size of the round ones. */}
          <img
            src={photo(g.photo)}
            alt=""
            decoding="async"
            className={`gt-alt-gem gt-alt-float block h-full w-full object-contain ${i % 2 === 1 ? "gt-alt-float--late" : ""}`}
            style={{ rotate: `${g.rot}deg` }}
          />
        </span>
      ))}
      <Sparkle size={18} color="var(--gt-fuchsia-300)" className="gt-auth-twinkle absolute left-[57%] top-[40%]" />
      <Sparkle size={12} color="white" className="gt-auth-twinkle gt-auth-twinkle--late absolute left-[43%] top-[66%]" />
    </div>
  );
}

/**
 * The editorial column: the gem burst, the three reasons to hold an account as
 * cards, and the reminder that the shop never asks for one. Entirely
 * non-interactive apart from that last link, so the tab order stays in the form.
 */
function EditorialColumn() {
  const { t } = useTranslation();
  return (
    <div className="grid w-full gap-[clamp(20px,2.5vw,32px)]">
      <GemBurst />

      <div className="grid gap-4">
        <h2 className="flex items-center gap-2.5 text-[length:var(--text-h4)]">
          <Sparkle size={14} color="var(--gt-fuchsia-400)" />
          {t("auth.benefitsTitle")}
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {BENEFITS.map(({ gem, titleKey, bodyKey }) => (
            <li
              key={titleKey}
              className="flex items-start gap-3.5 rounded-[var(--radius-xl)] border border-white bg-white/75 p-4 shadow-[var(--shadow-sm)] sm:flex-col lg:flex-row xl:flex-col"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--gt-blue-100)]">
                <img src={photo(gem)} alt="" decoding="async" className="gt-alt-gem h-7 w-7 object-contain" />
              </span>
              <span className="grid gap-1">
                <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(titleKey)}</strong>
                <span className="text-[length:var(--text-caption)] leading-snug text-[var(--text-muted)]">{t(bodyKey)}</span>
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
    </div>
  );
}

/**
 * Page layout: the pastel field, then the editorial column beside the card.
 * The column comes second on a phone — the form is what the visitor came for,
 * and a picture above it would push the first input off the screen.
 */
export function AuthLayout({ children, before, wide = false }: { children: ReactNode; before?: ReactNode; wide?: boolean }) {
  return (
    <div className={`relative isolate overflow-x-clip ${AUTH_GUTTER} py-[clamp(32px,5vw,80px)]`}>
      <FacetField />
      <div className="mx-auto grid w-full max-w-[var(--max-width-content)] gap-6">
        {before}
        <div
          className={`grid w-full items-start gap-[clamp(32px,5vw,72px)] ${
            wide ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]"
          }`}
        >
          <div className="order-2 mx-auto grid w-full max-w-[560px] lg:order-1 lg:mx-0 lg:max-w-none lg:pt-4">
            <EditorialColumn />
          </div>
          <div className="order-1 mx-auto grid w-full min-w-0 max-w-[560px] gap-5 lg:order-2 lg:mx-0 lg:max-w-none">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Rendered inside the pill, on the right — the password reveal lives here. */
  trailing?: ReactNode;
}

/**
 * Authentication input: the storefront `ui/Input` visual contract (eyebrow
 * label, pill, tokens) with room for an error, a hint and a trailing button.
 * The error is never colour alone: it carries an icon, sits under the field as
 * text, and is wired to the input through `aria-describedby` + `aria-invalid`.
 */
export function AuthField({ id, label, error, hint, trailing, className = "", ...rest }: AuthFieldProps) {
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

/** Federated sign-in entry point, styled as the `outline` button variant at `lg`. */
export function GoogleButton({
  label,
  onClick,
  disabled,
  describedBy,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className="inline-flex h-12 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:h-14 sm:px-[30px] sm:text-[length:var(--text-body-md)]"
    >
      <GoogleMark />
      <span>{label}</span>
    </button>
  );
}

/**
 * "Continue with Apple", drawn as Apple's guidelines ask: a black button, the
 * Apple logo in white, the same height and corners as the Google button.
 */
export function AppleButton({
  label,
  onClick,
  disabled,
  describedBy,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className="inline-flex h-12 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border border-black bg-black px-4 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-white transition-[background-color,box-shadow] duration-[var(--duration-fast)] hover:bg-[#1f1f1f] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:h-14 sm:px-[30px] sm:text-[length:var(--text-body-md)]"
    >
      <AppleMark size={19} />
      <span>{label}</span>
    </button>
  );
}
