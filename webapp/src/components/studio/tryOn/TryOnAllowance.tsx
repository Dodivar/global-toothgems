import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import type { TryOnStatus } from "../../../lib/studio3d/tryOn";

/** One line under the "Try it on my smile" call: renders left, unlimited, or the account needed. Nothing while unknown. */
export function TryOnAllowance({ status }: { status: TryOnStatus | null }) {
  const { t } = useTranslation();
  const { signedIn } = useAuth();
  if (!status?.available) return null;

  let text: string | null = null;
  if (!signedIn) {
    text = status.dailyLimit ? t("studio.tryOn.allowance.signedOut", { count: status.dailyLimit }) : t("studio.tryOn.allowance.signedOutPlain");
  } else if (status.quota?.unlimited) {
    text = t("studio.tryOn.allowance.unlimited");
  } else if (status.quota) {
    text =
      status.quota.remaining === 0
        ? t("studio.tryOn.allowance.none", { limit: status.quota.limit })
        : t("studio.tryOn.allowance.remaining", { count: status.quota.remaining, limit: status.quota.limit });
  }
  if (!text) return null;

  const empty = signedIn && status.quota && !status.quota.unlimited && status.quota.remaining === 0;
  return (
    <p
      role="status"
      className={
        empty
          ? "m-0 inline-flex items-start gap-1.5 text-[12px] font-semibold leading-relaxed text-[var(--status-error-fg)]"
          : "m-0 inline-flex items-start gap-1.5 text-[12px] font-semibold leading-relaxed text-[var(--text-primary)]"
      }
    >
      <Gauge size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
      {text}
    </p>
  );
}
