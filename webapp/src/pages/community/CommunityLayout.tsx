import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { useCommunity } from "../../lib/community";
import { MemberProfileProvider } from "../../components/community/MemberProfile";
import { ComposerProvider, StartDiscussionButton } from "../../components/community/NewDiscussion";
import { CommunityMobileNav, CommunitySidebar } from "../../components/community/CommunityNav";
import { MemberAvatar } from "../../components/community/MemberAvatar";
import { MemberBadges } from "../../components/community/MemberBadges";
import { AccessDemoSwitch } from "../../components/community/AccessDemoSwitch";
import { LockedCommunity } from "../../components/community/LockedCommunity";

/**
 * Shell of the Artist Community.
 *
 * The community is part of the member area — it lives under `/compte` and
 * inside the same `MemberShell`, whose sidebar marks it as the current
 * section and is the way back to the rest of the account. Its channels are a
 * column of this page, not a second sidebar level: they only sit beside the
 * content on wide screens, and are a row above it otherwise.
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
        {/* Inside the member-space shell, whose sidebar already takes the
            left edge: the channel column only opens beside the page from
            `xl`, below that the channels are a row above it. */}
        <div className="mx-auto grid w-full min-w-0 max-w-[var(--max-width-account)] grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] px-[clamp(14px,4vw,48px)] py-[clamp(20px,4vw,40px)] xl:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="grid gap-4 xl:sticky xl:top-6">
            {identity}

            <StartDiscussionButton fullWidth />

            <CommunitySidebar />

            <AccessDemoSwitch className="hidden xl:grid" />
          </aside>

          <div className="grid min-w-0 gap-[clamp(20px,3vw,32px)]">
            <CommunityMobileNav />
            <Outlet />
            <AccessDemoSwitch className="xl:hidden" />
          </div>
        </div>
      </ComposerProvider>
    </MemberProfileProvider>
  );
}
