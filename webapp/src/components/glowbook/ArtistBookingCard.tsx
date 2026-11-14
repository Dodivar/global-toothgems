"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CalendarX2, Check, Mail, Phone, Sparkles, UserX } from "lucide-react";
import { Badge } from "../ui/Badge";
import { STATUS_TONE } from "./bookingStatus";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { blockClient, cancelBooking, markBooking } from "../../lib/glowbookBooking";
import { type ArtistBooking, formatWhen } from "../../lib/glowbookBookingMapping";
import { useToast } from "../../lib/toast";

/**
 * One appointment as the artist sees it (decision 144): when, what the client
 * wants in their own words, how to reach them; cancel (with a reason the
 * client reads) before the hour, record the outcome after it, block the client.
 * Used by the Glowbook calendar and by the member's appointments page (so an
 * artist who left the Atelier plan still handles what was booked).
 */
export function ArtistBookingCard({ booking, onChanged }: { booking: ArtistBooking; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const { showToast } = useToast();
  const reasonId = useId();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const start = new Date(booking.startsAt).getTime();
  const future = start > now;
  const markable = !future && start > now - 60 * 86400 * 1000 && !booking.clientErased && ["booked", "honoured", "no_show"].includes(booking.status);

  const run = async (action: () => Promise<{ ok: true } | { ok: false; code: string }>, done: string) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      showToast(done, undefined, "success");
      onChanged();
    } else {
      showToast(t("booking.artist.actionFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
    }
  };

  return (
    <article className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="m-0 text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{formatWhen(booking.startsAt, booking.timezone, lang)}</p>
          <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
            {booking.designKind === "custom" ? <Sparkles size={13} aria-hidden="true" /> : null}
            {booking.designKind === "custom" ? t("booking.design.custom") : (booking.creationName ?? "—")}
          </p>
        </div>
        <Badge tone={STATUS_TONE[booking.status]}>
          {t(`booking.status.${booking.status}`)}
          {booking.status === "cancelled_client" && booking.lateCancel ? ` · ${t("booking.status.late")}` : ""}
        </Badge>
      </div>

      {booking.clientErased ? (
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("booking.artist.clientErased")}</p>
      ) : (
        <dl className="m-0 grid gap-1 text-[13.5px] text-[var(--text-body)]">
          <div className="flex gap-2">
            <dt className="sr-only">{t("booking.fields.name")}</dt>
            <dd className="m-0 font-bold text-[var(--text-primary)]">
              {booking.clientName}
              {booking.clientBlocked && <span className="ml-2 text-[12px] font-semibold text-[var(--status-error-fg)]">{t("booking.artist.blocked")}</span>}
            </dd>
          </div>
          {booking.clientEmail && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("booking.artist.email")}</dt>
              <Mail size={13} aria-hidden="true" />
              <dd className="m-0">
                <a href={`mailto:${booking.clientEmail}`} className="underline">{booking.clientEmail}</a>
              </dd>
            </div>
          )}
          {booking.clientPhone && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("booking.fields.phone")}</dt>
              <Phone size={13} aria-hidden="true" />
              <dd className="m-0">
                <a href={`tel:${booking.clientPhone.replace(/[^+0-9]/g, "")}`} className="underline">{booking.clientPhone}</a>
              </dd>
            </div>
          )}
        </dl>
      )}

      {booking.comment && (
        <p className="m-0 whitespace-pre-line rounded-[var(--radius-md)] bg-[var(--surface-page)] p-3 text-[13.5px] leading-relaxed text-[var(--text-primary)]">
          <span className="block text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("booking.artist.comment")}</span>
          {booking.comment}
        </p>
      )}
      {booking.cancelReason && (
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("booking.artist.yourReason", { reason: booking.cancelReason })}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {booking.status === "booked" && future && (
          <Button size="sm" variant="dangerOutline" iconLeft={CalendarX2} disabled={busy} onClick={() => setCancelling(true)}>
            {t("booking.artist.cancel")}
          </Button>
        )}
        {markable && (
          <>
            <Button size="sm" variant={booking.status === "honoured" ? "dark" : "outline"} iconLeft={Check} disabled={busy}
              onClick={() => run(() => markBooking(booking.id, "honoured"), t("booking.artist.markedHonoured"))}>
              {t("booking.artist.honoured")}
            </Button>
            <Button size="sm" variant={booking.status === "no_show" ? "dark" : "outline"} iconLeft={UserX} disabled={busy}
              onClick={() => run(() => markBooking(booking.id, "no_show"), t("booking.artist.markedNoShow"))}>
              {t("booking.artist.noShow")}
            </Button>
          </>
        )}
        {!booking.clientErased && !booking.clientBlocked && (
          <Button size="sm" variant="ghost" iconLeft={Ban} disabled={busy}
            onClick={() => run(() => blockClient(booking.id), t("booking.artist.blockedDone"))}>
            {t("booking.artist.block")}
          </Button>
        )}
      </div>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        tone="danger"
        title={t("booking.artist.cancelTitle")}
        description={t("booking.artist.cancelBody")}
        closeLabel={t("booking.dialog.close")}
        footer={
          <>
            <Button variant="danger" disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                await run(() => cancelBooking(booking.id, reason.trim()), t("booking.artist.cancelled"));
                setCancelling(false);
                setReason("");
              }}>
              {t("booking.artist.cancelConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setCancelling(false)}>{t("booking.dialog.cancel")}</Button>
          </>
        }
      >
        <label htmlFor={reasonId} className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("booking.artist.reason")}</span>
          <textarea
            id={reasonId}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[88px] w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] outline-none focus:border-[var(--focus-ring)]"
          />
        </label>
      </Dialog>
    </article>
  );
}
