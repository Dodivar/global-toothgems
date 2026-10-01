import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { Heart, LogIn, UserPlus } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";

/**
 * Shown when a visitor taps a heart: favourites are kept on the account, so
 * one is needed.
 *
 * A dialog rather than a redirect to the sign-up form: the tap is often an
 * idle "I like this" while browsing, and being thrown out of the shop for it
 * costs the visitor their place. The dialog says why, offers both ways in
 * (most visitors have no account yet, so creating one leads), and can be
 * dismissed to carry on browsing. Both ways carry the current page, so the
 * visitor comes back to it, and the product is added once the session opens.
 */
export function FavoriteAccountDialog({
  open,
  productName,
  returnTo,
  onContinue,
  onDismiss,
}: {
  open: boolean;
  /** The product whose heart was tapped; absent when opened from the favourites view. */
  productName?: string;
  /** Page to come back to after signing in or registering. */
  returnTo: string;
  /** The visitor chose to sign in or register: keep the remembered product. */
  onContinue: () => void;
  /** Closed without going on: forget it. */
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const go = (path: string) => {
    onContinue();
    navigate(path, { state: { from: returnTo, reason: "favorite" } });
  };

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      title={t("favorites.gate.title")}
      description={
        productName ? t("favorites.gate.bodyProduct", { name: productName }) : t("favorites.gate.body")
      }
      icon={<Heart size={18} />}
      closeLabel={t("favorites.gate.close")}
      footer={
        <>
          <Button variant="primary" iconLeft={UserPlus} onClick={() => go("/inscription")}>
            {t("favorites.gate.register")}
          </Button>
          <Button variant="outline" iconLeft={LogIn} onClick={() => go("/connexion")}>
            {t("favorites.gate.signIn")}
          </Button>
          <Button variant="ghost" className="sm:ml-auto" onClick={onDismiss}>
            {t("favorites.gate.later")}
          </Button>
        </>
      }
    >
      <ul className="m-0 grid gap-2 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
        <li>{t("favorites.gate.perk1")}</li>
        <li>{t("favorites.gate.perk2")}</li>
        <li>{t("favorites.gate.perk3")}</li>
      </ul>
    </Dialog>
  );
}
