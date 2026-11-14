"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarSync, Copy, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { createFeed, disableFeed, type FeedState, fetchFeedState } from "../../../lib/glowbookBooking";
import { useToast } from "../../../lib/toast";
import { fieldClass } from "./workspaceStyles";

const card = "grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6";
const small = "m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]";

/**
 * "Sync with my calendar" (decision 144, lot 2): a private iCalendar address
 * the artist pastes into Google Calendar, Apple Calendar or Outlook, which then
 * show their Glowbook appointments (those apps refresh it on their own schedule,
 * Google about once a day). The secret is shown once, when the link is created;
 * a new link revokes the old one; the link can be switched off. The feed carries
 * the clients' names, phones and comments, which the card says before creating it.
 */
export function GlowbookCalendarFeed() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const ids = { title: useId(), url: useId() };
  const [state, setState] = useState<FeedState | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "disable" | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchFeedState());
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    const result = await createFeed();
    setBusy(false);
    setConfirm(null);
    if (!result.ok) {
      showToast(t("booking.artist.actionFailed"), t("booking.artist.codes.unavailable"), "error");
      return;
    }
    setUrl(result.url);
    void load();
  };

  const disable = async () => {
    setBusy(true);
    const result = await disableFeed();
    setBusy(false);
    setConfirm(null);
    if (result.ok) {
      setUrl(null);
      showToast(t("booking.feed.disabled"), undefined, "success");
      void load();
    } else showToast(t("booking.artist.actionFailed"), undefined, "error");
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("booking.feed.copied"), undefined, "success");
    } catch {
      showToast(t("booking.feed.copyFailed"), undefined, "error");
    }
  };

  const since = state?.createdAt
    ? new Intl.DateTimeFormat(i18n.language?.startsWith("en") ? "en-GB" : "fr-FR", { dateStyle: "long" }).format(new Date(state.createdAt))
    : null;

  return (
    <section aria-labelledby={ids.title} className={card}>
      <h2 id={ids.title} className="m-0 inline-flex items-center gap-2 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
        <CalendarSync size={17} aria-hidden="true" />
        {t("booking.feed.title")}
      </h2>
      <p className={small}>{t("booking.feed.body")}</p>

      {url ? (
        <div className="grid gap-2">
          <label htmlFor={ids.url} className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("booking.feed.yourLink")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input id={ids.url} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${fieldClass} min-w-0 flex-1 font-mono text-[12px]`} />
            <Button size="sm" iconLeft={Copy} onClick={() => void copy()}>{t("booking.feed.copy")}</Button>
          </div>
          <p className="m-0 text-[12.5px] font-semibold text-[var(--status-warning-fg)]">{t("booking.feed.onlyOnce")}</p>
          <ul className="m-0 grid gap-1 pl-5 text-[12.5px] leading-relaxed text-[var(--text-body)]">
            <li>{t("booking.feed.howGoogle")}</li>
            <li>{t("booking.feed.howApple")}</li>
            <li>{t("booking.feed.howOutlook")}</li>
          </ul>
          <p className={small}>{t("booking.feed.refresh")}</p>
        </div>
      ) : state?.active ? (
        <p className="m-0 text-[13px] text-[var(--text-body)]">{t("booking.feed.active", { date: since ?? "" })}</p>
      ) : (
        <p className={small}>{t("booking.feed.privacy")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!state?.active && !url && (
          <Button size="sm" iconLeft={CalendarSync} loading={busy} disabled={busy} onClick={() => void create()}>
            {t("booking.feed.create")}
          </Button>
        )}
        {(state?.active || url) && (
          <>
            <Button size="sm" variant="outline" iconLeft={RefreshCw} disabled={busy} onClick={() => setConfirm("rotate")}>
              {t("booking.feed.rotate")}
            </Button>
            <Button size="sm" variant="ghost" iconLeft={Link2Off} disabled={busy} onClick={() => setConfirm("disable")}>
              {t("booking.feed.disable")}
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        tone={confirm === "disable" ? "danger" : "neutral"}
        title={confirm === "disable" ? t("booking.feed.disableTitle") : t("booking.feed.rotateTitle")}
        description={confirm === "disable" ? t("booking.feed.disableBody") : t("booking.feed.rotateBody")}
        closeLabel={t("booking.dialog.close")}
        footer={
          <>
            <Button variant={confirm === "disable" ? "danger" : "primary"} disabled={busy} onClick={() => void (confirm === "disable" ? disable() : create())}>
              {confirm === "disable" ? t("booking.feed.disable") : t("booking.feed.rotate")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t("booking.dialog.cancel")}</Button>
          </>
        }
      />
    </section>
  );
}
