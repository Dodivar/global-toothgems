import type { InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { ShapeGlyph, GLYPH_PATHS } from "../ui/ShapeGlyph";
import { photo } from "../../lib/images";

/**
 * The shared setting of the authentication pages — `/connexion`, `/inscription`
 * and the account-confirmation landing — in the jewellery sense: the card is the
 * stone, everything around it is the mount. The card wears a pastel-blue crown
 * headed by the facet band cut from the catalogue's own gem glyphs; the page
 * sits on a flat pastel field with one oversized brand cut drawn into it; and
 * the editorial column holds a rounded photograph with its own offset outline.
 *
 * Colour is rationed on purpose: pastel blue carries the whole surface, emerald
 * appears on exactly one control (the primary submit), and fuchsia is reduced to
 * two small sparkle marks. The script face appears once, as a decorative
 * initial, never on a label, an instruction or legal copy.
 */

/** Shared page gutter, matched to the rest of the site. */
export const AUTH_GUTTER = "px-[clamp(14px,4vw,48px)]";

/**
 * The three reasons to hold an account. The catalogue's own gem cuts stand in
 * for generic icons: the brand already owns a set of marks, so the page uses them.
 */
const BENEFITS = [
  { shape: "round", titleKey: "auth.benefit1Title", bodyKey: "auth.benefit1Body" },
  { shape: "navette", titleKey: "auth.benefit2Title", bodyKey: "auth.benefit2Body" },
  { shape: "star", titleKey: "auth.benefit3Title", bodyKey: "auth.benefit3Body" },
] as const;

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

/**
 * The page's field: a flat pastel plane with one oversized brand cut drawn into
 * it. It is the catalogue's own `round` glyph, scaled up until the facet lines
 * read as architecture rather than as an icon.
 */
export function FacetField() {
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
 * The card shell: crown, facet band, decorative initial, then whatever it holds.
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
      <div className="px-5 py-6 sm:px-8 sm:py-8">{children}</div>
    </section>
  );
}

/**
 * The editorial column: the photograph, the three reasons to hold an account,
 * and the reminder that the shop never asks for one. Entirely non-interactive
 * apart from that last link, so the tab order stays in the form.
 */
export function EditorialColumn({ image = "mouth-02.jpg" }: { image?: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid w-full gap-[clamp(24px,3vw,40px)]">
      <figure className="relative m-0 lg:max-w-[480px]">
        {/* The outline is the photograph's echo, offset like a printed register
            mark, with the same radius as every other surface on the site. */}
        <span
          aria-hidden="true"
          className="absolute -left-3 -top-3 h-full w-full rounded-[var(--radius-2xl)] border border-[var(--gt-blue-400)] sm:-left-4 sm:-top-4"
        />
        <div className="gt-sparkle relative aspect-[16/11] w-full overflow-hidden rounded-[var(--radius-2xl)] lg:aspect-[5/6]">
          <img src={photo(image)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
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
    </div>
  );
}

/**
 * Page layout: the facet field, then the editorial column beside the card.
 * The column comes second on a phone — the form is what the visitor came for,
 * and a photograph above it would push the first input off the screen.
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
export function GoogleButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-14 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:px-[30px] sm:text-[length:var(--text-body-md)]"
    >
      <GoogleMark />
      <span>{label}</span>
    </button>
  );
}
