"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarX2, PlugZap, ShieldAlert, Sparkles } from "lucide-react";
import { SectionHeader } from "../../components/account/SectionHeader";
import { ArtistBookingCard } from "../../components/glowbook/ArtistBookingCard";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { STATUS_TONE } from "../../components/glowbook/bookingStatus";
import { bookingAvailable, cancelBooking, fetchArtistAppointments, fetchMyBookings } from "../../lib/glowbookBooking";
import {
  type ArtistBooking,
  type ClientBooking,
  clientCancellation,
  formatWhen,
  localDay,
  splitBookings,
} from "../../lib/glowbookBookingMapping";
import { isLocale, localizedPath } from "../../lib/localeRoutes";
import { Link } from "../../lib/navigation";
import { useToast } from "../../lib/toast";

const panel = "grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(16px,3vw,24px)]";
const sectionTitle = "m-0 text-[length:var(--text-h4,18px)] font-[var(--weight-black)] text-[var(--text-primary)]";

type State = "loading" | "ready" | "error" | "unavailable";

/**
 * `/compte/rendez-vous` (decision 144): the appointments the member booked on
 * artists' Glowbooks — to come (cancel: free until 24 hours before, "late"
 * afterwards) and past, a booking ban if two no-shows or late cancellations
 * led to one —, and, for an artist, the appointments booked on their own
 * calendar in the coming weeks (still handled here if they left the Atelier
 * plan, which closes the Glowbook's calendar tab). The e-mails link here.
 */
export function Bookings() {
  const { t, i18n } = useTranslation();
  const lang = isLocale(i18n.language) ? i18n.language : "fr";
  const { showToast } = useToast();
  const [state, setState] = useState<State>(bookingAvailable() ? "loading" : "unavailable");
  const [mine, setMine] = useState<ClientBooking[]>([]);
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);
  const [received, setReceived] = useState<ArtistBooking[]>([]);
  const [confirm, setConfirm] = useState<ClientBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!bookingAvailable()) return;
    setState("loading");
    try {
      const today = localDay(new Date().toISOString(), "Europe/Paris");
      const [own, around] = await Promise.all([fetchMyBookings(), fetchArtistAppointments(today)]);
      if (!own) {
        setState("unavailable");
        return;
      }
      setMine(own.bookings);
      setBannedUntil(own.bannedUntil);
      setReceived([...(around?.toMark ?? []), ...(around?.upcoming ?? [])]);
      setNow(new Date());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doCancel = async () => {
    if (!confirm) return;
    setBusy(true);
    const result = await cancelBooking(confirm.id);
    setBusy(false);
    setConfirm(null);
    if (result.ok) {
      showToast(t("booking.mine.cancelled"), undefined, "success");
      void load();
    } else {
      showToast(t("booking.artist.actionFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
    }
  };

  const { upcoming, past } = now ? splitBookings(mine, now) : { upcoming: [], past: [] };
  const confirmLate = confirm && now ? clientCancellation(confirm, now).late : false;

  return (
    <section className="grid gap-[var(--space-5)]">
      <SectionHeader icon={CalendarCheck} eyebrow={t("booking.mine.eyebrow")} title={t("booking.mine.title")} description={t("booking.mine.description")} />

      {state === "unavailable" ? (
        <div className={panel}>
          <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            <PlugZap size={18} aria-hidden="true" />
            {t("booking.mine.unavailable")}
          </p>
        </div>
      ) : state === "loading" ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">{t("booking.mine.loading")}</span>
          {[0, 1].map((i) => (
            <div key={i} className="gt-skeleton h-28 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : state === "error" ? (
        <div className={panel}>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("booking.mine.error")}</p>
          <div>
            <Button variant="outline" size="sm" onClick={() => void load()}>{t("booking.when.retry")}</Button>
          </div>
        </div>
      ) : (
        <>
          {bannedUntil && (
            <div role="status" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4 text-[var(--status-warning-fg)]">
              <ShieldAlert size={20} aria-hidden="true" className="mt-0.5 flex-none" />
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">
                {t("booking.mine.banned", { date: new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(new Date(bannedUntil)) })}
              </p>
            </div>
          )}

          <div className={panel}>
            <h2 className={sectionTitle}>{t("booking.mine.upcoming")}</h2>
            {upcoming.length === 0 ? (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.mine.noneUpcoming")}</p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {upcoming.map((b) => (
                  <li key={b.id}>
                    <ClientBookingRow booking={b} lang={lang} onCancel={() => setConfirm(b)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {past.length > 0 && (
            <div className={panel}>
              <h2 className={sectionTitle}>{t("booking.mine.past")}</h2>
              <ul className="m-0 grid list-none gap-3 p-0">
                {past.map((b) => (
                  <li key={b.id}>
                    <ClientBookingRow booking={b} lang={lang} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {received.length > 0 && (
            <div className={panel}>
              <h2 className={sectionTitle}>{t("booking.mine.received")}</h2>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.mine.receivedHint")}</p>
              <ul className="m-0 grid list-none gap-3 p-0">
                {received.map((b) => (
                  <li key={b.id}>
                    <ArtistBookingCard booking={b} onChanged={() => void load()} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        tone="danger"
        title={t("booking.mine.cancelTitle")}
        description={confirmLate ? t("booking.mine.cancelLate") : t("booking.mine.cancelFree")}
        closeLabel={t("booking.dialog.close")}
        footer={
          <>
            <Button variant="danger" iconLeft={CalendarX2} disabled={busy} onClick={() => void doCancel()}>
              {t("booking.mine.cancelConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t("booking.mine.keep")}</Button>
          </>
        }
      >
        {confirm && <p className="m-0 font-semibold text-[var(--text-primary)]">{formatWhen(confirm.startsAt, confirm.timezone, lang)}</p>}
      </Dialog>
    </section>
  );
}

function ClientBookingRow({ booking, lang, onCancel }: { booking: ClientBooking; lang: "fr" | "en"; onCancel?: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="m-0 text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{formatWhen(booking.startsAt, booking.timezone, lang)}</p>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            {booking.artistHandle ? (
              <Link to={localizedPath("glowbook", lang, { id: booking.artistHandle })} className="font-semibold underline">{booking.artistName}</Link>
            ) : (
              booking.artistName
            )}
            {" · "}
            {booking.designKind === "custom" ? (
              <span className="inline-flex items-center gap-1"><Sparkles size={12} aria-hidden="true" />{t("booking.design.custom")}</span>
            ) : (
              booking.creationName
            )}
          </p>
        </div>
        <Badge tone={STATUS_TONE[booking.status]}>
          {t(`booking.status.${booking.status}`)}
          {booking.status === "cancelled_client" && booking.lateCancel ? ` · ${t("booking.status.late")}` : ""}
        </Badge>
      </div>
      {booking.comment && <p className="m-0 whitespace-pre-line text-[13.5px] text-[var(--text-body)]">{booking.comment}</p>}
      {booking.cancelReason && <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("booking.mine.artistReason", { reason: booking.cancelReason })}</p>}
      {onCancel && (
        <div>
          <Button size="sm" variant="dangerOutline" iconLeft={CalendarX2} onClick={onCancel}>{t("booking.mine.cancel")}</Button>
        </div>
      )}
    </article>
  );
}
