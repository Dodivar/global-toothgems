import { useId } from "react";
import { Link, useLocation } from "../../lib/navigation";
import { useTranslation } from "react-i18next";
import { Cookie, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/Button";
import { useCookieConsent } from "../../lib/cookieConsent";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { ADVERTISING_ENABLED } from "../../lib/metaPixelConfig";
import { usePhoneLayout } from "../../lib/studio3d/phoneLayout";

/** The 3D Studio editor's addresses (`/studio-3d/atelier…`), where a phone shows the compact banner. */
const STUDIO_EDITOR_PREFIX = "/studio-3d/atelier";

/**
 * First-visit cookie banner.
 *
 * A labelled region rather than a modal: the page stays usable behind it, and
 * nothing is assumed while it is open — no choice means no optional cookies.
 * It is rendered at the top of the document (see `App`) so it is the first
 * thing a keyboard or screen-reader user reaches, while sitting visually at the
 * bottom of the screen.
 *
 * "Reject non-essential" and "Accept all" share one style and one size; the
 * refusal comes first so it is never the one you have to hunt for.
 */
export function CookieBanner() {
  const { t } = useTranslation();
  const { record, known, settingsOpen, acceptAll, rejectAll, openSettings } = useCookieConsent();
  const titleId = useId();
  const bodyId = useId();
  const { pathname } = useLocation();
  // Null on the server and on a tablet or a computer: the full banner, exactly as everywhere else.
  const phone = usePhoneLayout();

  if (!known || record || settingsOpen) return null;

  // On a phone, over the 3D Studio editor, the full banner would hide the whole stage: the
  // same three choices — refusal first, refusal and acceptance alike — in a slim band.
  if (phone && pathname.startsWith(STUDIO_EDITOR_PREFIX)) {
    return (
      <section aria-labelledby={titleId} aria-describedby={bodyId} className="fixed inset-x-2 bottom-2 z-[400] mx-auto max-w-[560px]">
        <div className="gt-cookie-banner grid gap-2 rounded-[var(--radius-lg)] px-3 py-2.5">
          <p id={bodyId} className="m-0 text-[11.5px] leading-snug text-[var(--text-body)]">
            <strong id={titleId} className="font-bold text-[var(--text-primary)]">
              {t("legal.cookies.bannerCompactTitle")}
            </strong>{" "}
            · {t(ADVERTISING_ENABLED ? "legal.cookies.bannerCompactBodyAdvertising" : "legal.cookies.bannerCompactBody")}{" "}
            <Link to={LEGAL_PATHS.cookies} className="gt-legal-link">
              {t("legal.cookies.policyLink")}
            </Link>
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <Button variant="dark" size="sm" onClick={rejectAll} className="h-10 px-2" aria-label={t("legal.cookies.rejectNonEssential")}>
              {t("legal.cookies.rejectCompact")}
            </Button>
            <Button variant="dark" size="sm" onClick={acceptAll} className="h-10 px-2" aria-label={t("legal.cookies.acceptAll")}>
              {t("legal.cookies.acceptCompact")}
            </Button>
            <Button variant="outline" size="sm" onClick={openSettings} className="h-10 px-2" aria-label={t("legal.cookies.customize")}>
              {t("legal.cookies.customizeCompact")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-x-3 bottom-3 z-[400] mx-auto max-w-[980px] sm:inset-x-6 sm:bottom-6"
    >
      <div className="gt-cookie-banner grid gap-4 rounded-[var(--radius-xl)] p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
        <div className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="mt-0.5 hidden h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)] sm:grid"
          >
            <Cookie size={19} />
          </span>
          <div className="grid gap-1.5">
            <h2 id={titleId} className="text-[length:var(--text-body-lg)]">
              {t("legal.cookies.bannerTitle")}
            </h2>
            <p id={bodyId} className="m-0 text-[length:var(--text-caption)] leading-[1.6] text-[var(--text-body)] sm:text-[length:var(--text-body-sm)]">
              {t(ADVERTISING_ENABLED ? "legal.cookies.bannerBodyAdvertising" : "legal.cookies.bannerBody")}{" "}
              <Link to={LEGAL_PATHS.cookies} className="gt-legal-link">
                {t("legal.cookies.policyLink")}
              </Link>
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:items-stretch">
          <Button variant="dark" size="sm" onClick={rejectAll} className="h-11">
            {t("legal.cookies.rejectNonEssential")}
          </Button>
          <Button variant="dark" size="sm" onClick={acceptAll} className="h-11">
            {t("legal.cookies.acceptAll")}
          </Button>
          <Button variant="outline" size="sm" iconLeft={SlidersHorizontal} onClick={openSettings} className="h-11">
            {t("legal.cookies.customize")}
          </Button>
        </div>
      </div>
    </section>
  );
}
