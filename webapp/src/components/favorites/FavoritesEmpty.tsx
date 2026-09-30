import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Heart, LogIn, RotateCw, Store, UserPlus } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * What the shop's favourites view shows instead of a grid:
 * - `signedOut`: favourites need an account (a shared link, or the header's heart);
 * - `empty`: signed in, nothing saved yet;
 * - `error`: the list could not be read.
 *
 * `onAction` is the single action of `empty` (back to the whole shop) and
 * `error` (retry); signed out, the two ways in lead back to this page.
 */
export function FavoritesEmpty({ kind, onAction }: { kind: "signedOut" | "empty" | "error"; onAction?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const goTo = (path: string) =>
    navigate(path, { state: { from: location.pathname + location.search, reason: "favorite" } });

  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface-card)] px-5 py-14 text-center shadow-[var(--shadow-card)] sm:px-6 sm:py-16">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--accent-highlight)]"
      >
        <Heart size={22} />
      </span>
      <p className="m-0 text-[length:var(--text-h4)] font-semibold text-[var(--text-primary)]">
        {t(`favorites.empty.${kind}Title`)}
      </p>
      <p className="m-0 max-w-[44ch] text-sm text-[var(--text-muted)]">{t(`favorites.empty.${kind}Body`)}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {kind === "signedOut" ? (
          <>
            <Button variant="primary" iconLeft={UserPlus} onClick={() => goTo("/inscription")}>
              {t("favorites.gate.register")}
            </Button>
            <Button variant="outline" iconLeft={LogIn} onClick={() => goTo("/connexion")}>
              {t("favorites.gate.signIn")}
            </Button>
          </>
        ) : (
          <Button variant="outline" iconLeft={kind === "empty" ? Store : RotateCw} onClick={onAction}>
            {t(kind === "empty" ? "favorites.empty.emptyCta" : "favorites.empty.errorCta")}
          </Button>
        )}
      </div>
    </div>
  );
}
