import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StoredTryOn } from "../../../lib/studio3d/tryOnLocal";

/**
 * This creation's earlier results kept on this device (`tryOnLocal.ts`,
 * 24 h at most), under the photo step: a tap shows one again, the bin erases
 * it from the device. Marked `ph-no-capture`: analytics replay never records a face.
 */
export function SavedTryOns({ runs, onShow, onRemove }: { runs: StoredTryOn[]; onShow: (id: string) => void; onRemove: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [urls, setUrls] = useState<Record<string, string>>({});

  // One object URL per thumbnail, revoked when the list changes or the dialog closes.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const run of runs) if (run.result) next[run.id] = URL.createObjectURL(run.result.image);
    setUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [runs]);

  const time = new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <section aria-labelledby="gt-tryon-saved" className="grid gap-2 border-t border-[var(--border-subtle)] pt-4">
      <div className="grid gap-0.5">
        <h3 id="gt-tryon-saved" className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {t("studio.tryOn.saved.title")}
        </h3>
        <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.tryOn.saved.body")}</p>
      </div>
      <ul className="ph-no-capture m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
        {runs.map((run) => (
          <li key={run.id} className="relative flex-none">
            <button
              type="button"
              onClick={() => onShow(run.id)}
              aria-label={t("studio.tryOn.saved.show", { time: time.format(run.createdAt) })}
              className="grid h-20 w-20 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {urls[run.id] && <img src={urls[run.id]} alt="" className="h-full w-full object-cover" draggable={false} />}
            </button>
            <span aria-hidden="true" className="absolute bottom-1 left-1 rounded-[var(--radius-pill)] bg-[rgba(22,26,32,.7)] px-1.5 text-[10.5px] font-semibold text-white">
              {time.format(run.createdAt)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(run.id)}
              aria-label={t("studio.tryOn.saved.remove", { time: time.format(run.createdAt) })}
              className="absolute right-1 top-1 inline-grid h-6 w-6 place-items-center rounded-full bg-[rgba(22,26,32,.7)] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
