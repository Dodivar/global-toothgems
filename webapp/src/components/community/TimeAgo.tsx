import { useTranslation } from "react-i18next";
import { timeAgoParts } from "../../lib/format";

/**
 * The age of a post, in words.
 *
 * Rendered as `<time>` so the relative wording keeps a machine-readable
 * duration beside it; the community fixtures store ages rather than dates, so
 * that duration is an ISO 8601 period rather than a timestamp.
 */
export function TimeAgo({ minutesAgo, className }: { minutesAgo: number; className?: string }) {
  const { t } = useTranslation();
  const { key, count } = timeAgoParts(minutesAgo);
  return (
    <time dateTime={`PT${Math.max(0, Math.round(minutesAgo))}M`} className={className}>
      {t(key, { count })}
    </time>
  );
}
