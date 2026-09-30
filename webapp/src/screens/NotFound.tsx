import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Compass, House } from "lucide-react";
import { Button } from "../components/ui/Button";
import { SystemPage } from "../components/system/SystemPage";
import { MisplacedGemVisual } from "../components/system/SystemVisuals";
import { useRouterLink } from "../components/system/useRouterLink";

/**
 * 404 — the catch-all route.
 *
 * Friendly rather than technical: it names the address that was asked for (so
 * a mistyped link is easy to spot), then offers the homepage, the shop and,
 * when there is somewhere to return to, the previous page.
 */
export function NotFound() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const link = useRouterLink();

  // React Router numbers its history entries; 0 means this tab arrived here
  // directly, where "back" would leave the site, so the action is not offered.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  return (
    <SystemPage
      kind="notFound"
      status={{ label: t("errors.notFound.status"), icon: Compass }}
      title={t("errors.notFound.title")}
      body={t("errors.notFound.body")}
      note={
        <>
          {t("errors.notFound.requested")}{" "}
          <span className="font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere]">{pathname}</span>
        </>
      }
      actions={
        <>
          <Button {...link("/")} variant="primary" size="lg" iconLeft={House}>
            {t("errors.actions.home")}
          </Button>
          <Button {...link("/boutique")} variant="outline" size="lg" iconRight={ArrowRight}>
            {t("errors.notFound.shop")}
          </Button>
          {canGoBack && (
            <Button variant="ghost" size="md" iconLeft={ArrowLeft} onClick={() => navigate(-1)}>
              {t("errors.notFound.back")}
            </Button>
          )}
        </>
      }
      visual={<MisplacedGemVisual />}
    />
  );
}
