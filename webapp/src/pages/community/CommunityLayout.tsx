import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { useCommunity } from "../../lib/community";
import { MemberProfileProvider } from "../../components/community/MemberProfile";
import { ComposerProvider, StartDiscussionButton } from "../../components/community/NewDiscussion";
import { CommunityMobileNav, CommunitySidebar } from "../../components/community/CommunityNav";
import { MemberAvatar } from "../../components/community/MemberAvatar";
import { MemberBadges } from "../../components/community/MemberBadges";
import { AccessDemoSwitch } from "../../components/community/AccessDemoSwitch";
import { LockedCommunity } from "../../components/community/LockedCommunity";
import { focusRing } from "../../components/community/styles";

/**
 * Shell of the Artist Community.
 *
 * The community is part of the member area — it is reached from the account
 * sidebar and it lives under `/compte` — but it does not nest inside that
 * sidebar: a screen with two levels of vertical navigation is what makes forum
 * software feel like software. It swaps the account's navigation for its own
 * and keeps one link back, the way a workspace does.
 *
 * Access is decided here rather than per page, for the same reason
 * `RequireAccount` guards the account layout rather than each button: a deep
 * link into a thread has to meet the same door as the home page.
 */
export function CommunityLayout() {
  const { t } = useTranslation();
  const { hasAccess, viewer } = useCommunity();

  if (!hasAccess) {
    return (
      /* The dialogs are not mounted here: nothing on the locked screen opens
         one, and the providers would only add a promise the page cannot keep. */
      <LockedCommunity />
    );
  }

  const identity = (
    <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-3">
        <MemberAvatar member={viewer} size="md" presence />
        <span className="grid min-w-0 gap-0.5">
          <span className="gt-eyebrow">{t("community.eyebrow")}</span>
          <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {viewer.name}
          </strong>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("community.contributionCount", { count: viewer.contributions })}
          </span>
        </span>
      </div>
      <MemberBadges badges={viewer.badges} max={2} />
    </div>
  );

  return (
    <MemberProfileProvider>
      <ComposerProvider>
        <div className="mx-auto grid max-w-[var(--max-width-account)] grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] px-[clamp(14px,4vw,48px)] py-[clamp(20px,4vw,40px)] lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="grid gap-4 lg:sticky lg:top-[92px]">
            <Link
              to="/compte"
              className={clsx(
                "inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] py-1 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t("community.backToAccount")}
            </Link>

            {identity}

            <StartDiscussionButton fullWidth />

            <CommunitySidebar />

            <AccessDemoSwitch className="hidden lg:grid" />
          </aside>

          <div className="grid min-w-0 gap-[clamp(20px,3vw,32px)]">
            <CommunityMobileNav />
            <Outlet />
            <AccessDemoSwitch className="lg:hidden" />
          </div>
        </div>
      </ComposerProvider>
    </MemberProfileProvider>
  );
}
