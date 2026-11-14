"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarMinus2, CircleAlert, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { fetchImportState, type ImportState, setImportUrl } from "../../../lib/glowbookBooking";
import { useToast } from "../../../lib/toast";
import { fieldClass } from "./workspaceStyles";

const card = "grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6";
const small = "m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]";

/**
 * "Block the hours taken elsewhere" (decision 144, lot 3): the artist pastes
 * the private iCalendar address of another calendar (Google, Planity if it
 * gives one, Apple, Outlook). Every 15 minutes the hours it is busy in are
 * closed on the Glowbook calendar; only the times are kept, never an event's
 * title. A choice made by hand in the week view always wins. `onChanged` lets
 * the week view reload once an address is set or removed.
 */
export function GlowbookCalendarImport({ onChanged }: { onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const ids = { title: useId(), input: useId() };
  const [state, setState] = useState<ImportState | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchImportState();
      setState(next);
      setDraft(next?.url ?? "");
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (url: string | null) => {
    setBusy(true);
    const result = await setImportUrl(url);
    setBusy(false);
    if (!result.ok) {
      showToast(t("booking.artist.actionFailed"), t(result.code === "invalid" ? "booking.import.invalid" : "booking.artist.codes.unavailable"), "error");
      return;
    }
    showToast(url ? t("booking.import.saved") : t("booking.import.removed"), url ? t("booking.import.savedBody") : undefined, "success");
    void load();
    onChanged();
  };

  const checked = state?.checkedAt
    ? new Intl.DateTimeFormat(i18n.language?.startsWith("en") ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.checkedAt))
    : null;
  const trimmed = draft.trim();

  return (
    <section aria-labelledby={ids.title} className={card}>
      <h2 id={ids.title} className="m-0 inline-flex items-center gap-2 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
        <CalendarMinus2 size={17} aria-hidden="true" />
        {t("booking.import.title")}
      </h2>
      <p className={small}>{t("booking.import.body")}</p>

      <label htmlFor={ids.input} className="grid gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("booking.import.label")}</span>
        <input
          id={ids.input}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${fieldClass} font-mono text-[12px]`}
        />
      </label>

      <ul className="m-0 grid gap-1 pl-5 text-[12.5px] leading-relaxed text-[var(--text-body)]">
        <li>{t("booking.import.howGoogle")}</li>
        <li>{t("booking.import.howPlanity")}</li>
        <li>{t("booking.import.howOther")}</li>
      </ul>
      <p className={small}>{t("booking.import.privacy")}</p>

      {state?.url && (
        <p role="status" className="m-0 inline-flex items-start gap-2 text-[13px] text-[var(--text-body)]">
          {state.status === "error" && <CircleAlert size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />}
          {state.status === null
            ? t("booking.import.waiting")
            : state.status === "ok"
              ? t("booking.import.ok", { date: checked ?? "", count: state.hours })
              : t(`booking.import.errors.${state.error ?? "unreachable"}`, { date: checked ?? "" })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={busy || !trimmed || trimmed === state?.url} onClick={() => void save(trimmed)}>
          {t("booking.import.save")}
        </Button>
        {state?.url && (
          <Button size="sm" variant="ghost" iconLeft={Trash2} disabled={busy} onClick={() => void save(null)}>
            {t("booking.import.remove")}
          </Button>
        )}
      </div>
    </section>
  );
}
