"use client";

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import clsx from "clsx";
import { DashboardTile } from "./DashboardTile";
import { useAuth } from "../../../lib/auth";
import { AGENDA_PATH } from "../../../lib/agendaRoutes";
import { useBookingsPlanKnown } from "../../layout/useGlowbookPlanKnown";
import { bookingAvailable, fetchArtistAppointments } from "../../../lib/glowbookBooking";
import { DEFAULT_SETTINGS, formatDay, formatWhen, localDay, type ArtistCalendar } from "../../../lib/glowbookBookingMapping";

type Agenda = NonNullable<Awaited<ReturnType<typeof fetchArtistAppointments>>>;

/** How many appointments the card lists before "Open my calendar". */
const SHOWN = 3;

/**
 * The artist's calendar, small (decision 147): the next appointments, those
 * left to record (in the dark dress: the client's no-show count depends on
 * it), and the next time off. Shown to a member who has a Glowbook page or
 * appointments booked on it — whatever the plan, since the calendar stays
 * readable after it ends —, never to anyone else. A page without the
 * calendar's plan (Artist, decision 152) and no appointment shows no card. Read from
 * `glowbook_artist_calendar` (the artist's own rows only).
 */
export function AgendaTile() {
  const { userId } = useAuth();
  const bookingsPlan = useBookingsPlanKnown();
  const [agenda, setAgenda] = useState<{ userId: string; data: Agenda } | null>(null);

  useEffect(() => {
    if (!userId || !bookingAvailable()) return;
    let cancelled = false;
    fetchArtistAppointments(localDay(new Date().toISOString(), DEFAULT_SETTINGS.timezone))
      .then((data) => {
        if (!cancelled && data) setAgenda({ userId, data });
      })
      .catch(() => {
        /* No card rather than a wrong one. */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!agenda || agenda.userId !== userId) return null;
  const { data } = agenda;
  if ((!data.pageStatus || bookingsPlan !== true) && data.upcoming.length === 0 && data.toMark.length === 0) return null;
  return <AgendaTileCard upcoming={data.upcoming} toMark={data.toMark.length} closure={data.closures[0] ?? null} />;
}

function AgendaTileCard({
  upcoming,
  toMark,
  closure,
}: {
  upcoming: ArtistCalendar["bookings"];
  toMark: number;
  closure: ArtistCalendar["closures"][number] | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const titleId = useId();
  const ink = toMark > 0;
  const muted = ink ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]";

  return (
    <DashboardTile icon={CalendarDays} eyebrow={t("booking.dashboard.eyebrow")} to={AGENDA_PATH} cta={t("booking.dashboard.cta")} tone={ink ? "ink" : "paper"} labelledBy={titleId}>
      <h3 id={titleId} className={clsx("m-0 text-[length:var(--text-h4)]", ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
        {upcoming.length > 0 ? t("booking.dashboard.upcoming", { count: upcoming.length }) : t("booking.dashboard.none")}
      </h3>
      {upcoming.length > 0 && (
        <ul className={clsx("m-0 grid list-none gap-1 p-0 text-[length:var(--text-body-sm)]", ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-body)]")}>
          {upcoming.slice(0, SHOWN).map((b) => (
            <li key={b.id} className="min-w-0 truncate">
              <span className="font-semibold">{formatWhen(b.startsAt, b.timezone, lang)}</span>
              {b.clientName ? <span className={muted}> · {b.clientName}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {toMark > 0 && <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--accent-highlight)]">{t("booking.dashboard.toMark", { count: toMark })}</p>}
      {closure && (
        <p className={clsx("m-0 text-[length:var(--text-body-sm)]", muted)}>
          {closure.startsOn === closure.endsOn
            ? t("booking.dashboard.closureDay", { day: formatDay(closure.startsOn, lang) })
            : t("booking.dashboard.closure", { from: formatDay(closure.startsOn, lang), to: formatDay(closure.endsOn, lang) })}
        </p>
      )}
    </DashboardTile>
  );
}
