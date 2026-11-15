"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, CalendarCheck, CalendarDays, CalendarPlus, CalendarX2, MapPin, PlugZap, ShieldAlert, Sparkles } from "lucide-react";
import { SectionHeader } from "../../components/account/SectionHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { STATUS_TONE } from "../../components/glowbook/bookingStatus";
import { bookingAvailable, cancelBooking, fetchArtistAppointments, fetchMyBookings } from "../../lib/glowbookBooking";
import {
  type ClientBooking,
  clientCancellation,
  formatWhen,
  localDay,
  splitBookings,
} from "../../lib/glowbookBookingMapping";
import { isLocale, localizedPath } from "../../lib/localeRoutes";
import { Link } from "../../lib/navigation";
import { AGENDA_PATH } from "../../lib/agendaRoutes";
import { useToast } from "../../lib/toast";
import { appointmentIcs, downloadIcs } from "../../lib/glowbookIcs";
import { directionsLinks } from "../../lib/studioWorkspace/glowbookPlace";
import { glowbookCreationPath } from "../../lib/studioUrl";
import { BUCKETS, signedUrls } from "../../lib/supabase/storage";

const panel = "grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(16px,3vw,24px)]";
const sectionTitle = "m-0 text-[length:var(--text-h4,18px)] font-[var(--weight-black)] text-[var(--text-primary)]";

type State = "loading" | "ready" | "error" | "unavailable";

/**
 * `/compte/rendez-vous` (decision 144): the appointments the member booked on
 * artists' Glowbooks — to come (cancel: free until 24 hours before, "late"
 * afterwards) and past, a booking ban if two no-shows or late cancellations
 * led to one. An artist's own appointments are in their calendar
 * (`/compte/agenda`, decision 147): this page only points there. The client
 * e-mails link here. Each appointment shows the creation booked (its public
 * picture and 3D view), where it takes place (a salon's address with
 * directions, or an area), and, while to come, "Add to my calendar" — an
 * `.ics` file with the e-mails' event id (decision 147 (d)).
 */
export function Bookings() {
  const { t, i18n } = useTranslation();
  const lang = isLocale(i18n.language) ? i18n.language : "fr";
  const { showToast } = useToast();
  const [state, setState] = useState<State>(bookingAvailable() ? "loading" : "unavailable");
  const [mine, setMine] = useState<ClientBooking[]>([]);
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [confirm, setConfirm] = useState<ClientBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [images, setImages] = useState<Map<string, string>>(new Map());

  // The booked creations' public pictures, signed once the list is known.
  useEffect(() => {
    const paths = [...new Set(mine.flatMap((b) => (b.thumbnailPath ? [b.thumbnailPath] : [])))];
    if (paths.length === 0) return;
    let cancelled = false;
    signedUrls(BUCKETS.studioThumbnails, paths)
      .then((urls) => {
        if (!cancelled) setImages(urls);
      })
      .catch(() => {
        /* No picture rather than a broken one. */
      });
    return () => {
      cancelled = true;
    };
  }, [mine]);

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
      setReceived((around?.toMark.length ?? 0) + (around?.upcoming.length ?? 0));
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
                    <ClientBookingRow booking={b} lang={lang} imageUrl={b.thumbnailPath ? (images.get(b.thumbnailPath) ?? null) : null} onCancel={() => setConfirm(b)} upcoming />
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
                    <ClientBookingRow booking={b} lang={lang} imageUrl={b.thumbnailPath ? (images.get(b.thumbnailPath) ?? null) : null} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* An artist's own appointments are handled in their calendar (decision 147),
              which stays open to them after the plan ends. */}
          {received > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
              <CalendarDays size={18} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              <p className="m-0 min-w-0 flex-1 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("booking.mine.receivedMoved")}</p>
              <Link to={AGENDA_PATH} className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)] underline underline-offset-4">
                {t("booking.mine.receivedLink")}
              </Link>
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

function ClientBookingRow({
  booking,
  lang,
  imageUrl,
  onCancel,
  upcoming = false,
}: {
  booking: ClientBooking;
  lang: "fr" | "en";
  imageUrl: string | null;
  onCancel?: () => void;
  /** To come: offers "Add to my calendar". */
  upcoming?: boolean;
}) {
  const { t } = useTranslation();
  const viewUrl = booking.itemLive && booking.itemId && booking.artistHandle ? glowbookCreationPath(booking.artistHandle, booking.itemId) : null;
  const design = booking.designKind === "custom" ? t("booking.design.custom") : (booking.creationName ?? "");
  const place = booking.place;

  const addToCalendar = () => {
    const pageUrl = `${window.location.origin}/compte/rendez-vous`;
    const lines = [t("booking.mine.icsDesign", { design }), booking.comment ?? "", pageUrl].filter(Boolean);
    downloadIcs(
      appointmentIcs({
        bookingId: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        summary: t("booking.mine.icsSummary", { name: booking.artistName }),
        description: lines.join("\n"),
        location: place?.label ?? null,
        url: pageUrl,
      }),
      lang === "fr" ? "rendez-vous.ics" : "appointment.ics",
    );
  };

  return (
    <article className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="m-0 text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{formatWhen(booking.startsAt, booking.timezone, lang)}</p>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            {booking.artistHandle ? (
              <Link to={localizedPath("glowbook", lang, { id: booking.artistHandle })} className="font-semibold underline">{booking.artistName}</Link>
            ) : (
              booking.artistName
            )}
          </p>
        </div>
        <Badge tone={STATUS_TONE[booking.status]}>
          {t(`booking.status.${booking.status}`)}
          {booking.status === "cancelled_client" && booking.lateCancel ? ` · ${t("booking.status.late")}` : ""}
        </Badge>
      </div>

      {/* What was booked: the creation's picture and 3D view, or a custom design. */}
      <div className="flex items-center gap-3">
        {booking.designKind === "creation" && imageUrl ? (
          <img src={imageUrl} alt="" className="h-16 w-16 flex-none rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-16 w-16 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
            {booking.designKind === "custom" ? <Sparkles size={20} /> : <Box size={20} />}
          </span>
        )}
        <div className="grid min-w-0 gap-1">
          <p className="m-0 truncate text-[14px] font-bold text-[var(--text-primary)]">{design || "—"}</p>
          {viewUrl && (
            <Link to={viewUrl} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold underline">
              <Box size={13} aria-hidden="true" />
              {t("booking.artist.view3d")}
            </Link>
          )}
        </div>
      </div>

      {/* Where: a salon's address with directions, or the artist's area. */}
      {place && (
        <div className="grid gap-1.5 text-[13.5px] text-[var(--text-body)]">
          <p className="m-0 flex items-start gap-1.5">
            <MapPin size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--text-muted)]" />
            <span>
              <span className="font-semibold text-[var(--text-primary)]">{place.label}</span>
              {place.mode === "area" && <span className="block text-[12.5px] text-[var(--text-muted)]">{t("booking.mine.placeArea")}</span>}
            </span>
          </p>
          {place.mode === "exact" && (
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 pl-[21px] text-[12.5px]">
              {directionsLinks(place).map((link) => (
                <a key={link.app} href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  {t(`studio.glowbook.place.directions.${link.app}`)}
                </a>
              ))}
            </p>
          )}
        </div>
      )}

      {booking.comment && <p className="m-0 whitespace-pre-line text-[13.5px] text-[var(--text-body)]">{booking.comment}</p>}
      {booking.cancelReason && <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("booking.mine.artistReason", { reason: booking.cancelReason })}</p>}
      {(onCancel || (upcoming && booking.status === "booked")) && (
        <div className="flex flex-wrap gap-2">
          {upcoming && booking.status === "booked" && (
            <Button size="sm" variant="outline" iconLeft={CalendarPlus} onClick={addToCalendar}>{t("booking.mine.addToCalendar")}</Button>
          )}
          {onCancel && <Button size="sm" variant="dangerOutline" iconLeft={CalendarX2} onClick={onCancel}>{t("booking.mine.cancel")}</Button>}
        </div>
      )}
    </article>
  );
}
