import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { FlaskConical, Flag, LayoutDashboard, ListChecks } from "lucide-react";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ErrorPanel, PromoTabs, Segmented, type TabItem } from "../../components/promotions/PromoUi";
import { ReviewDashboard } from "../../components/reviews/admin/ReviewDashboard";
import { ModerationQueue } from "../../components/reviews/admin/ModerationQueue";
import { ReportedReviews } from "../../components/reviews/admin/ReportedReviews";
import { ModerationSheet } from "../../components/reviews/admin/ModerationSheet";
import { ModerationDialogs, type DialogAction, type PendingAction } from "../../components/reviews/admin/ModerationDialogs";
import { REVIEW_NOW } from "../../data/reviewSystem";
import { isReported, viewCounts } from "../../lib/reviewRules";
import { useReviews, type ReviewDemoMode } from "../../lib/reviews";
import { formatDate } from "../../lib/format";
import { useAdminShell } from "./AdminLayout";

type Tab = "overview" | "queue" | "reported";
const SLUG: Record<Tab, string> = { overview: "", queue: "file", reported: "signalements" };

/**
 * Reviews — the moderation workspace.
 *
 * Three views of the same reviews, as tabs whose slug is part of the address:
 * the overview (`/admin/avis`), the moderation queue (`?vue=file`) and the
 * reported reviews (`?vue=signalements`). The review being moderated is a
 * side panel addressed by `?avis=RV-1008`, so the queue stays in place behind
 * it and a review can be linked to in a message.
 *
 * Every decision is made against the shared review store, so what is approved
 * here appears on the storefront immediately, and a report sent from a product
 * page arrives here.
 */
export function Reviews() {
  const { t } = useTranslation();
  const { openNav } = useAdminShell();
  const [params, setParams] = useSearchParams();
  const { reviews, loading, demoMode, setDemoMode, retry } = useReviews();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const tab = ((Object.keys(SLUG) as Tab[]).find((k) => SLUG[k] === (params.get("vue") ?? "")) ?? "overview") as Tab;
  const openId = params.get("avis");

  const hrefFor = useCallback((query: Record<string, string>) => `/admin/avis?${new URLSearchParams(query).toString()}`, []);

  const openReview = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set("avis", id);
      setParams(next);
    },
    [params, setParams],
  );
  const closeReview = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("avis");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const counts = viewCounts(reviews);
  const reported = reviews.filter(isReported).length;

  const tabs: TabItem[] = [
    { id: "overview", label: t("reviews.admin.tabs.overview"), icon: LayoutDashboard, to: "/admin/avis" },
    { id: "queue", label: t("reviews.admin.tabs.queue"), icon: ListChecks, count: loading ? undefined : counts.pending, to: hrefFor({ vue: "file" }) },
    { id: "reported", label: t("reviews.admin.tabs.reported"), icon: Flag, count: loading ? undefined : reported, to: hrefFor({ vue: "signalements" }) },
  ];

  const onAction = (kind: DialogAction, id: string) => setPending({ kind, id });

  return (
    <>
      <AdminHeader
        title={t("reviews.admin.title")}
        description={t("reviews.admin.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("reviews.nav.admin") }]}
        onOpenNav={openNav}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--admin-radius)] border border-dashed border-[var(--gt-blue-400)] bg-[var(--gt-blue-50)] px-3.5 py-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <FlaskConical size={14} aria-hidden="true" />
            {t("reviews.proto.label")}
          </span>
          <span>{t("reviews.admin.protoToday", { date: formatDate(REVIEW_NOW) })}</span>
          <div className="ml-auto">
            <Segmented<ReviewDemoMode>
              label={t("reviews.admin.protoSimulate")}
              hideLabel
              size="sm"
              value={demoMode}
              onChange={setDemoMode}
              options={(["live", "empty", "error"] as const).map((m) => ({ value: m, label: t(`reviews.admin.protoModes.${m}`) }))}
            />
          </div>
        </div>

        <PromoTabs items={tabs} current={tab} label={t("reviews.admin.tabs.label")} />

        {demoMode === "error" && !loading ? (
          <ErrorPanel title={t("reviews.admin.errorTitle")} body={t("reviews.admin.errorBody")} onRetry={retry} retryLabel={t("reviews.section.retry")} />
        ) : (
          <div key={tab}>
            {tab === "overview" && <ReviewDashboard hrefFor={hrefFor} onOpen={openReview} />}
            {tab === "queue" && <ModerationQueue onOpen={openReview} />}
            {tab === "reported" && <ReportedReviews onOpen={openReview} onAction={onAction} />}
          </div>
        )}
      </div>

      <ModerationSheet id={openId} onClose={closeReview} onAction={onAction} />
      <ModerationDialogs action={pending} onClose={() => setPending(null)} />
    </>
  );
}
