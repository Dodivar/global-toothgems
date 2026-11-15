"use client";

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, MapPin } from "lucide-react";
import { DashboardTile } from "./DashboardTile";
import { useAuth } from "../../../lib/auth";
import { bookingAvailable, fetchMyBookings } from "../../../lib/glowbookBooking";
import { type ClientBooking, formatWhen, splitBookings } from "../../../lib/glowbookBookingMapping";
import { APPOINTMENTS_PATH } from "../../layout/clientSpaces";
import { ARTIST_DIRECTORY_PATH } from "../../../lib/studioUrl";

/**
 * The member's next appointment with an artist (decision 144), as a client:
 * when, with whom and where, leading to `/compte/rendez-vous`; with none to
 * come, it says so and leads to the artist directory (decision 145) instead.
 * Read from `my_glowbook_bookings` (the member's own rows only). No card while
 * bookings are unavailable (no project, function missing) or failed to load:
 * nothing rather than a wrong "no appointment".
 */
export function NextAppointmentTile() {
  const { userId } = useAuth();
  const [state, setState] = useState<{ userId: string; next: ClientBooking | null; others: number } | null>(null);

  useEffect(() => {
    if (!userId || !bookingAvailable()) return;
    let cancelled = false;
    fetchMyBookings()
      .then((data) => {
        if (cancelled || !data) return;
        const { upcoming } = splitBookings(data.bookings, new Date());
        setState({ userId, next: upcoming[0] ?? null, others: Math.max(0, upcoming.length - 1) });
      })
      .catch(() => {
        /* No card rather than a wrong one. */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!state || state.userId !== userId) return null;
  return <NextAppointmentCard next={state.next} others={state.others} />;
}

export function NextAppointmentCard({ next, others }: { next: ClientBooking | null; others: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const titleId = useId();

  if (!next) {
    return (
      <DashboardTile icon={CalendarCheck} eyebrow={t("booking.clientDashboard.eyebrow")} to={ARTIST_DIRECTORY_PATH} cta={t("booking.clientDashboard.findCta")} labelledBy={titleId}>
        <h3 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
          {t("booking.clientDashboard.none")}
        </h3>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.clientDashboard.noneBody")}</p>
      </DashboardTile>
    );
  }

  return (
    <DashboardTile icon={CalendarCheck} eyebrow={t("booking.clientDashboard.eyebrow")} to={APPOINTMENTS_PATH} cta={t("booking.clientDashboard.cta")} labelledBy={titleId}>
      <h3 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
        {formatWhen(next.startsAt, next.timezone, lang)}
      </h3>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
        {t("booking.clientDashboard.with", { name: next.artistName })}
      </p>
      {next.place && (
        <p className="m-0 flex items-start gap-1.5 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          <MapPin size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          <span className="min-w-0 truncate">{next.place.label}</span>
        </p>
      )}
      {others > 0 && <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.clientDashboard.others", { count: others })}</p>}
    </DashboardTile>
  );
}
