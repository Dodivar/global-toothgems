import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { getChannel } from "../../data/community";
import { pick } from "../../data/types";
import { CHANNEL_ICONS, TONE_SOFT } from "./channelStyle";
import { focusRing } from "./styles";
import { channelPath } from "./routes";

/**
 * The channel a discussion belongs to, as a chip.
 *
 * A link by default — seeing "Techniques & tips" on a card and not being able
 * to go there would be a dead end — and plain text when it sits inside a card
 * that is itself a link, where nesting one would be invalid.
 */
export function ChannelChip({
  channelId,
  as = "link",
  className,
}: {
  channelId: string;
  as?: "link" | "text";
  className?: string;
}) {
  const { i18n } = useTranslation();
  const channel = getChannel(channelId);
  if (!channel) return null;

  const Icon = CHANNEL_ICONS[channelId];
  const content = (
    <>
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      {pick(channel.name, i18n.language)}
    </>
  );

  const base = clsx(
    "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold",
    TONE_SOFT[channel.tone],
    className,
  );

  if (as === "text") {
    return <span className={base}>{content}</span>;
  }

  return (
    <Link
      to={channelPath(channelId)}
      className={clsx(base, focusRing, "transition-opacity duration-[var(--duration-fast)] hover:opacity-80")}
    >
      {content}
    </Link>
  );
}
