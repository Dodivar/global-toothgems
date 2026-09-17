import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, MessageCircle, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { ACTIVE_MEMBERS, COMMUNITY_STATS, DISCUSSIONS, getMember } from "../../data/community";
import { pick } from "../../data/types";
import { formatCount } from "../../lib/format";
import { AvatarStack, MemberAvatar } from "./MemberAvatar";
import { ChannelChip } from "./ChannelChip";
import { CommunityStats } from "./CommunityStats";
import { TimeAgo } from "./TimeAgo";
import { AccessDemoSwitch } from "./AccessDemoSwitch";
import { cardBase, focusRing } from "./styles";

/**
 * The community, seen from outside.
 *
 * The brief for this screen is a difficult one: make it desirable without
 * making it punitive. Three decisions carry that.
 *
 *  - What is real is shown for real. The figures, the artists' names and four
 *    live discussion titles are not blurred, because a paywall that hides even
 *    the subject of the conversation reads as a wall rather than as a room.
 *  - What is blurred is blurred honestly: the cards behind the panel are the
 *    actual discussions, softened, not a decorative texture.
 *  - Nothing here is disabled. There is one clear way in — a training — and one
 *    way back to the account, and the copy never scolds.
 *
 * The preview is `inert` and `aria-hidden`, so the blur is never a keyboard
 * trap and a screen reader is given the four readable titles instead of a wall
 * of unreachable controls.
 */

/** A discussion as the locked preview shows it: shape, not content. */
function BlurredCard({ discussionId }: { discussionId: string }) {
  const { i18n } = useTranslation();
  const discussion = DISCUSSIONS.find((d) => d.id === discussionId);
  if (!discussion) return null;
  const author = getMember(discussion.authorId);

  return (
    <div className={clsx("grid gap-3 p-[var(--space-5)]", cardBase)}>
      <div className="flex items-center gap-2.5">
        {author && <MemberAvatar member={author} size="sm" />}
        <div className="grid gap-1">
          <span className="h-2.5 w-28 rounded-[var(--radius-pill)] bg-[var(--gt-ink-200)]" />
          <span className="h-2 w-16 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]" />
        </div>
      </div>
      <strong className="text-[length:var(--text-h4)] leading-[var(--leading-snug)] text-[var(--text-primary)]">
        {pick(discussion.title, i18n.language)}
      </strong>
      <span className="h-2.5 w-full rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]" />
      <span className="h-2.5 w-3/4 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]" />
      <div className="flex items-center gap-2">
        <span className="h-7 w-14 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]" />
        <span className="h-7 w-14 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]" />
      </div>
    </div>
  );
}

export function LockedCommunity() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();

  /** The four titles shown in the clear: the community's current front page. */
  const visible = DISCUSSIONS.filter((d) => d.featured).slice(0, 4);
  const gallery = DISCUSSIONS.filter((d) => d.image).slice(0, 4);

  return (
    <div className="mx-auto grid max-w-[var(--max-width-account)] gap-[clamp(28px,4vw,44px)] px-[clamp(14px,4vw,48px)] py-[clamp(24px,4vw,44px)]">
      <Link
        to="/compte"
        className={clsx(
          "inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] px-1 py-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
          focusRing,
        )}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {t("community.backToAccount")}
      </Link>

      <header className="grid gap-4">
        <span className="gt-eyebrow flex items-center gap-2">
          <Sparkles size={13} aria-hidden="true" />
          {t("community.lockedEyebrow")}
        </span>
        <h1 className="max-w-[18ch] text-[length:var(--text-display-2)] leading-[var(--leading-tight)]">
          {t("community.lockedHeroTitle")}
        </h1>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
          {t("community.lockedHeroBody")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarStack members={ACTIVE_MEMBERS} max={6} />
          <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("community.lockedSocialProof", { count: COMMUNITY_STATS.artists, value: formatCount(COMMUNITY_STATS.artists) })}
          </span>
        </div>
      </header>

      <CommunityStats />

      {/* The preview: real discussions, softened, with the way in on top. */}
      <section className="relative isolate overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        <div
          inert
          aria-hidden="true"
          className="pointer-events-none grid max-h-[620px] select-none gap-4 p-[clamp(16px,3vw,28px)] blur-[5px] lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]"
        >
          <div className="grid content-start gap-4">
            <BlurredCard discussionId="adhesif-du-moment" />
            <BlurredCard discussionId="tarifs-sur-mesure" />
            <BlurredCard discussionId="premiere-cliente-stress" />
          </div>
          <div className="hidden grid-cols-2 content-start gap-3 lg:grid">
            {gallery.map((post) => (
              <img
                key={post.id}
                src={post.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-square w-full rounded-[var(--radius-md)] object-cover"
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,rgba(250,250,248,.55),rgba(250,250,248,.86)_45%,rgba(250,250,248,.97))] p-[clamp(14px,3vw,32px)]">
          <div className="gt-glass-panel gt-glass-panel-compact grid w-[min(520px,100%)] justify-items-center gap-4 rounded-[var(--radius-xl)] p-[clamp(20px,4vw,36px)] text-center">
            <span
              aria-hidden="true"
              className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-brand)] text-[var(--gt-ink-900)]"
            >
              <LockKeyhole size={22} strokeWidth={1.75} />
            </span>
            <h2 className="text-[length:var(--text-h2)] leading-[var(--leading-snug)]">
              {t("community.lockedCardTitle")}
            </h2>
            <p className="m-0 max-w-[44ch] text-[length:var(--text-body-md)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
              {t("community.lockedCardBody")}
            </p>
            <p className="m-0 inline-flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--accent-cta-ink)]">
              <Check size={15} strokeWidth={2.5} aria-hidden="true" />
              {t("community.lockedIncluded")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
                {t("community.lockedPrimaryCta")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/compte")}>
                {t("community.backToAccount")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Shown in the clear: what is being talked about right now. */}
      <section className="grid gap-4">
        <div className="grid gap-1.5">
          <h2 className="text-[length:var(--text-h3)]">{t("community.lockedTeaserTitle")}</h2>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("community.lockedTeaserBody")}
          </p>
        </div>

        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {visible.map((discussion) => (
            <li key={discussion.id} className={clsx("grid gap-2.5 p-[var(--space-5)]", cardBase)}>
              <ChannelChip channelId={discussion.channelId} as="text" className="w-fit" />
              <strong className="text-[length:var(--text-body-lg)] leading-[var(--leading-snug)] text-[var(--text-primary)]">
                {pick(discussion.title, lang)}
              </strong>
              <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <MessageCircle size={13} aria-hidden="true" />
                {t("community.replyCount", { count: discussion.replies.length })}
                <span aria-hidden="true">·</span>
                <TimeAgo minutesAgo={discussion.minutesAgo} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AccessDemoSwitch className="max-w-[var(--max-width-prose)]" />
    </div>
  );
}
