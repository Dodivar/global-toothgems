"use client";

import { useTranslation } from "react-i18next";
import { LanguageMenu } from "./LanguageMenu";
import { Link, useNavigate } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { useCookieConsent } from "../../lib/cookieConsent";
import { useHydrated } from "../../lib/useHydrated";
import { RETURN_PARAM, SIGN_IN_PATH } from "../../lib/authRoutes";
import { STUDIO_EDITOR_PATH } from "../../lib/studioUrl";
import { LEGAL_PATHS } from "../../data/legal/routes";
import logoWordmark from "../../assets/logo-wordmark.svg";

/**
 * The quiet chrome of a focus visit (`lib/adFocus.ts`): a logo that is not a
 * link, the language menu and "Sign in" (or "Open the Studio" for a member),
 * then, at the bottom, the legal links the law asks to keep reachable. No shop,
 * Academy, cart or search: the visitor stays on the Studio's pages.
 */
export function FocusBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const member = useHydrated() && signedIn;

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-chrome)] px-4 sm:px-[clamp(16px,4vw,48px)]">
      <img src={logoWordmark.src} alt="Global Toothgems" className="h-5 w-auto sm:h-6" />
      <div className="flex items-center gap-2 sm:gap-4">
        <LanguageMenu />
        <button
          type="button"
          onClick={() => navigate(member ? STUDIO_EDITOR_PATH : `${SIGN_IN_PATH}?${RETURN_PARAM}=${encodeURIComponent(STUDIO_EDITOR_PATH)}`)}
          className="min-h-11 rounded-[var(--radius-md)] px-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] hover:underline"
        >
          {member ? t("nav.studioWorkshop") : t("nav.signIn")}
        </button>
      </div>
    </header>
  );
}

export function FocusFooter() {
  const { t } = useTranslation();
  const { openSettings } = useCookieConsent();
  const link = "py-2 text-[var(--text-body)] hover:underline";

  return (
    <footer className="border-t border-[var(--border-subtle)] px-4 py-8 sm:px-[clamp(16px,4vw,48px)]">
      <div className="mx-auto flex max-w-[var(--max-width-content)] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("footer.colLegal")} className="flex flex-wrap gap-x-5 gap-y-1 text-[length:var(--text-body-sm)]">
          <Link to={LEGAL_PATHS.legalNotice} className={link}>{t("legal.pages.legalNotice")}</Link>
          <Link to={LEGAL_PATHS.terms} className={link}>{t("legal.pages.terms")}</Link>
          <Link to={LEGAL_PATHS.privacy} className={link}>{t("legal.pages.privacy")}</Link>
          <Link to={LEGAL_PATHS.cookies} className={link}>{t("legal.pages.cookies")}</Link>
          <button type="button" onClick={openSettings} className={link}>{t("legal.cookies.settingsLink")}</button>
          <Link to={LEGAL_PATHS.contact} className={link}>{t("legal.pages.contact")}</Link>
        </nav>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("footer.copyright")}</p>
      </div>
    </footer>
  );
}
