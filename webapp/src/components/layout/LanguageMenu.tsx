import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetLanguage } from "../../lib/navigation";
import type { Locale } from "../../lib/localeRoutes";

/** Rounded-rectangle flag drawn inline (no emoji: Windows does not render them, no image to load). */
export function Flag({ locale, size = 20 }: { locale: Locale; size?: number }) {
  const clipId = `gt-flag-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 30 20"
      width={Math.round(size * 1.5)}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="30" height="20" rx="4" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {locale === "fr" ? (
          <>
            <rect width="10" height="20" fill="#1d3f9b" />
            <rect x="10" width="10" height="20" fill="#ffffff" />
            <rect x="20" width="10" height="20" fill="#d8232a" />
          </>
        ) : (
          <>
            <rect width="30" height="20" fill="#1d3f7f" />
            <path d="M0 0L30 20M30 0L0 20" stroke="#ffffff" strokeWidth="4" />
            <path d="M0 0L30 20M30 0L0 20" stroke="#d8232a" strokeWidth="1.4" />
            <path d="M15 0V20M0 10H30" stroke="#ffffff" strokeWidth="6.5" />
            <path d="M15 0V20M0 10H30" stroke="#d8232a" strokeWidth="3.6" />
          </>
        )}
      </g>
      <rect width="30" height="20" rx="4" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
    </svg>
  );
}

const LOCALES: Locale[] = ["fr", "en"];

/**
 * The header's language menu: the button shows only the flag of the language
 * in use; opened, it lists the languages by code (flag + FR / EN).
 */
export function LanguageMenu({ placement = "below", align = "end" }: { placement?: "below" | "above"; align?: "start" | "end" }) {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current: Locale = i18n.language?.startsWith("en") ? "en" : "fr";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (locale: Locale) => {
    setOpen(false);
    if (locale !== current) setLanguage(locale);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("common.langMenuAria")}
        aria-haspopup="true"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] outline-none transition-colors hover:bg-[var(--surface-brand-wash)] focus-visible:shadow-[var(--shadow-focus)]"
      >
        <Flag locale={current} />
      </button>
      {open && (
        <ul
          className={`absolute ${align === "start" ? "left-0" : "right-0"} z-[70] grid ${placement === "above" ? "bottom-full mb-2" : "top-full mt-2"} min-w-[112px] gap-0.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-card)]`}
        >
          {LOCALES.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                onClick={() => choose(locale)}
                lang={locale}
                aria-label={t(`common.langName.${locale}`)}
                aria-current={locale === current ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-xs font-semibold uppercase tracking-[var(--tracking-wide)] outline-none transition-colors hover:bg-[var(--surface-brand-wash)] focus-visible:shadow-[var(--shadow-focus)] ${
                  locale === current ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                }`}
              >
                <Flag locale={locale} size={18} />
                {locale.toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
