import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useFavorites } from "../../lib/favorites";
import { useToast } from "../../lib/toast";
import { Button } from "../ui/Button";

/**
 * On the favourites view: offers the promotion alert to a member who has favourites
 * and has not agreed to receive our e-mails yet (decision 148). The alert is
 * commercial prospection, so it is sent only with marketing consent; this is the
 * place where the member gives it, as the same consent the profile page and the
 * newsletter use (`updateProfile({ newsletter })` writes the consent record).
 * Hidden for a member who already agreed, signed out, or without a favourite.
 */
export function FavoritePromoOptIn() {
  const { t } = useTranslation();
  const titleId = useId();
  const { profile, signedIn, updateProfile } = useAuth();
  const { status, favoriteProducts } = useFavorites();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!signedIn || !profile || profile.newsletter || status !== "ready" || favoriteProducts.length === 0) return null;

  const agree = async () => {
    setSaving(true);
    const saved = await updateProfile({ newsletter: true });
    setSaving(false);
    if (saved) showToast(t("favorites.promoAlert.savedTitle"), t("favorites.promoAlert.savedBody"));
    else showToast(t("favorites.promoAlert.errorTitle"), t("favorites.promoAlert.errorBody"), "error");
  };

  return (
    <section
      aria-labelledby={titleId}
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]"
    >
      <span
        aria-hidden="true"
        className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--gt-blue-50)] text-[var(--gt-blue-600)]"
      >
        <BellRing size={18} />
      </span>
      <div className="grid min-w-[16rem] flex-1 gap-0.5">
        <h2 id={titleId} className="m-0 text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]">
          {t("favorites.promoAlert.title")}
        </h2>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("favorites.promoAlert.body")}</p>
      </div>
      <Button variant="primary" size="sm" loading={saving} onClick={agree}>
        {t("favorites.promoAlert.cta")}
      </Button>
    </section>
  );
}
