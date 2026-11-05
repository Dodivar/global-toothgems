import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetLanguage } from "../../lib/navigation";
import type { Locale } from "../../lib/localeRoutes";

/** Round flag drawn inline (no emoji: Windows does not render them, no image to load). */
export function Flag({ locale, size = 20 }: { locale: Locale; size?: number }) {
  const clipId = `gt-flag-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="flex-none rounded-full ring-1 ring-inset ring-[var(--border-subtle)]"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {locale === "fr" ? (
          <>
            <rect width="8" height="24" fill="#1d3f9b" />
            <rect x="8" width="8" height="24" fill="#ffffff" />
            <rect x="16" width="8" height="24" fill="#d8232a" />
          </>
        ) : (
          <>
            <rect width="24" height="24" fill="#1d3f7f" />
            <path d="M0 0L24 24M24 0L0 24" stroke="#ffffff" strokeWidth="4.4" />
            <path d="M0 0L24 24M24 0L0 24" stroke="#d8232a" strokeWidth="1.6" />
            <path d="M12 0V24M0 12H24" stroke="#ffffff" strokeWidth="7" />
            <path d="M12 0V24M0 12H24" stroke="#d8232a" strokeWidth="4" />
          </>
        )}
      </g>
    </svg>
  );
}

const LOCALES: Locale[] = ["fr", "en"];

/**
 * The header's language menu: the button shows only the flag of the language
 * in use; opened, it lists the languages by code (flag + FR / EN).
 */
export function LanguageMenu({ placement = "below" }: { placement?: "below" | "above" }) {
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
        className="grid h-9 w-9 place-items-center rounded-full outline-none transition-colors hover:bg-[var(--surface-brand-wash)] focus-visible:shadow-[var(--shadow-focus)]"
      >
        <Flag locale={current} />
      </button>
      {open && (
        <ul
          className={`absolute right-0 z-[70] grid ${placement === "above" ? "bottom-full mb-2" : "top-full mt-2"} min-w-[112px] gap-0.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-card)]`}
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
