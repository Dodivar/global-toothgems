import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Monitor, Pencil, Smartphone, Sparkles } from "lucide-react";
import clsx from "clsx";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminSelect } from "../../components/admin/AdminSelect";
import { usePromotions } from "../../lib/adminPromotions";
import { campaignStatus, promotionStatus } from "../../data/adminPromotions";
import { Notice, Panel, PrototypeBar, Segmented } from "../../components/promotions/PromoUi";
import { PromotionStatusBadge, useDiscountLabel } from "../../components/promotions/PromoBadges";
import {
  PreviewCampaignLanding,
  PreviewCart,
  PreviewCheckout,
  PreviewFrame,
  PreviewProductCard,
  PreviewProductPage,
  ShopBadge,
  usePreviewProduct,
} from "../../components/promotions/StorefrontPreviews";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { useAdminShell } from "./AdminLayout";

/**
 * "How will customers see this?" — one promotion, five storefront surfaces.
 *
 * The administrator picks a promotion (and optionally a campaign) and sees
 * the product card, the product page, the cart, the checkout summary and the
 * campaign landing as the shop would draw them. Selections live in the URL so
 * a colleague can be sent straight to "the Black Friday checkout".
 *
 * These are mockups of the storefront, framed and labelled as such. The live
 * shop computes its prices on the server; nothing here is a price promise.
 */
export function PromotionPreview() {
  const { t } = useTranslation();
  const { openNav } = useAdminShell();
  const [params, setParams] = useSearchParams();
  const { promotions, campaigns, getCampaign } = usePromotions();
  const discount = useDiscountLabel();

  const selectable = promotions.filter((p) => promotionStatus(p) !== "archived");
  const promotion = selectable.find((p) => p.id === params.get("promotion")) ?? selectable.find((p) => promotionStatus(p) === "active") ?? selectable[0];
  const campaignId = params.get("campagne") ?? promotion?.campaignId ?? "";
  const campaign = campaignId ? getCampaign(campaignId) : undefined;
  const device = params.get("appareil") === "mobile" ? "mobile" : "desktop";
  const product = usePreviewProduct(promotion ?? null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const header = (
    <AdminHeader
      title={t("promo.preview.title")}
      description={t("promo.preview.description")}
      crumbs={[{ label: t("admin.nav.promotions"), to: "/admin/promotions" }, { label: t("promo.preview.crumb") }]}
      onOpenNav={openNav}
    />
  );

  if (!promotion || !product) {
    return (
      <>
        {header}
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty icon={Eye} title={t("promo.preview.emptyTitle")} body={t("promo.preview.emptyBody")} />
          </div>
        </div>
      </>
    );
  }

  const status = promotionStatus(promotion);
  const campaignPromotions = campaign ? promotions.filter((p) => p.campaignId === campaign.id && promotionStatus(p) !== "archived") : [];

  return (
    <>
      {header}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />

        <section className="gt-admin-panel grid gap-4 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.preview.promotion")}</span>
            <AdminSelect value={promotion.id} onChange={(e) => setParam("promotion", e.target.value)} options={selectable.map((p) => ({ value: p.id, label: `${p.name} — ${t(`promo.status.${promotionStatus(p)}`)}` }))} />
          </label>
          <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.preview.campaign")}</span>
            <AdminSelect value={campaignId} onChange={(e) => setParam("campagne", e.target.value || null)} options={[{ value: "", label: t("promo.preview.noCampaign") }, ...campaigns.filter((c) => campaignStatus(c) !== "archived").map((c) => ({ value: c.id, label: c.name }))]} />
          </label>
          <Segmented
            label={t("promo.preview.device")}
            hideLabel
            value={device}
            onChange={(v) => setParam("appareil", v === "mobile" ? "mobile" : null)}
            options={[
              { value: "desktop", label: t("promo.preview.desktop"), icon: Monitor },
              { value: "mobile", label: t("promo.preview.mobile"), icon: Smartphone },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <PromotionStatusBadge status={status} />
            <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{promotion.name}</span>
            <Link to={`/admin/promotions/${promotion.id}/modifier`} className="ml-auto inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
              <Pencil size={12} aria-hidden="true" /> {t("promo.preview.editPromotion")}
            </Link>
          </div>
        </section>

        {status !== "active" && (
          <Notice tone="info" title={t("promo.preview.notLive", { status: t(`promo.status.${status}`) })}>
            {t("promo.preview.notLiveBody")}
          </Notice>
        )}

        <Panel title={t("promo.preview.badges")} icon={Sparkles}>
          <div className="flex flex-wrap items-center gap-2">
            <ShopBadge>{discount(promotion, "badge")}</ShopBadge>
            {promotions
              .filter((p) => p.id !== promotion.id && promotionStatus(p) === "active")
              .slice(0, 3)
              .map((p) => (
                <ShopBadge key={p.id}>{discount(p, "badge")}</ShopBadge>
              ))}
            {campaign && (
              <ShopBadge tone="ink">
                <Sparkles size={10} aria-hidden="true" />
                {t("promo.shop.partOf", { name: campaign.name })}
              </ShopBadge>
            )}
            <span className="text-[11px] text-[var(--text-muted)]">{t("promo.preview.badgesHint")}</span>
          </div>
        </Panel>

        <div className={clsx("mx-auto grid w-full gap-5 transition-[max-width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]", device === "mobile" ? "max-w-[390px]" : "max-w-none")}>
          <div className={clsx("grid gap-5", device === "desktop" && "lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]")}>
            <PreviewFrame label={t("promo.preview.productCard")}>
              <div className="grid grid-cols-2 gap-3 p-3 sm:p-4">
                <PreviewProductCard product={product} promotion={promotion} campaign={campaign} />
                <div className="opacity-60">
                  <PreviewProductCard product={product} promotion={null} />
                </div>
              </div>
              <p className="m-0 px-4 pb-3 text-[11px] text-[var(--text-muted)]">{t("promo.preview.cardCompare")}</p>
            </PreviewFrame>
            <PreviewFrame label={t("promo.preview.productPage")}>
              <PreviewProductPage product={product} promotion={promotion} campaign={campaign} />
            </PreviewFrame>
          </div>
          <div className={clsx("grid gap-5", device === "desktop" && "lg:grid-cols-2")}>
            <PreviewFrame label={t("promo.preview.cart")}>
              <PreviewCart promotion={promotion} product={product} />
            </PreviewFrame>
            <PreviewFrame label={t("promo.preview.checkout")}>
              <PreviewCheckout promotion={promotion} product={product} />
            </PreviewFrame>
          </div>
          {campaign ? (
            <PreviewFrame label={t("promo.preview.landing")}>
              <PreviewCampaignLanding campaign={campaign} promotions={campaignPromotions.length ? campaignPromotions : [promotion]} productIds={campaign.productIds} />
            </PreviewFrame>
          ) : (
            <p className="m-0 rounded-[var(--admin-radius)] border border-dashed border-[var(--border-default)] p-4 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.preview.noLanding")}</p>
          )}
        </div>
        <p className="m-0 text-center text-[11px] text-[var(--text-muted)]">{t("promo.preview.disclaimer")}</p>
      </div>
    </>
  );
}
