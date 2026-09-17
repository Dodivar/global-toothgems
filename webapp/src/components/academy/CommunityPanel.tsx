import { useTranslation } from "react-i18next";
import { MessageCircle, Sparkles, Users } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CheckItem } from "./TrainingPrimitives";

/**
 * The artist forum, which comes with the training rather than as an upsell.
 *
 * The thread list is a styled preview of a space that is not part of this
 * prototype, so it says so in plain text under the card: a mock-up presented as
 * a live feed would be a claim about a product that does not exist yet. The
 * "included" badge, on the other hand, is the actual offer and leads the block.
 */
export function CommunityPanel({ onOpenForum }: { onOpenForum: () => void }) {
  const { t } = useTranslation();

  const threads = [
    { title: t("training.communityThread1Title"), meta: t("training.communityThread1Meta"), initials: "MA" },
    { title: t("training.communityThread2Title"), meta: t("training.communityThread2Meta"), initials: "LC" },
    { title: t("training.communityThread3Title"), meta: t("training.communityThread3Meta"), initials: "SB" },
    { title: t("training.communityThread4Title"), meta: t("training.communityThread4Meta"), initials: "JD" },
  ];

  const points = [
    t("training.communityPoint1"),
    t("training.communityPoint2"),
    t("training.communityPoint3"),
    t("training.communityPoint4"),
    t("training.communityPoint5"),
    t("training.communityPoint6"),
  ];

  return (
    <div className="grid items-start gap-[clamp(28px,4vw,56px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-5">
        {/* Wrapped: a grid item stretches, and a badge that spans the column
            stops reading as a badge. */}
        <div>
          <Badge tone="success" icon={Sparkles}>
            {t("training.communityBadge")}
          </Badge>
        </div>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--text-body)]">
          {t("training.communityLead")}
        </p>
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {points.map((point) => (
            <CheckItem key={point}>{point}</CheckItem>
          ))}
        </ul>
        <div>
          <Button variant="outline" onClick={onOpenForum}>
            {t("training.communityCta")}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-brand-wash)] px-[var(--space-5)] py-4">
            <span className="flex items-center gap-2 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
              <Users size={16} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
              {t("training.communityForumLabel")}
            </span>
            <span className="gt-eyebrow">{t("training.communityThreadsLabel")}</span>
          </div>
          <ul className="m-0 grid list-none gap-0 p-0">
            {threads.map((thread) => (
              <li
                key={thread.title}
                className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-[var(--space-5)] py-4 transition-colors duration-[var(--duration-fast)] last:border-b-0 hover:bg-[var(--surface-sunken)]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--gt-blue-100)] text-[length:var(--text-caption)] font-bold text-[var(--gt-blue-700)]"
                >
                  {thread.initials}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                    {thread.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    <MessageCircle size={12} aria-hidden="true" />
                    {thread.meta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 px-1 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
          {t("training.communityPreviewNote")}
        </p>
      </div>
    </div>
  );
}
