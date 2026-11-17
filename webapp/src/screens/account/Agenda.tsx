"use client";

import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import { SectionHeader } from "../../components/account/SectionHeader";
import { ArtistAgenda } from "../../components/agenda/ArtistAgenda";
import { useBookingsPlanKnown } from "../../components/layout/useGlowbookPlanKnown";

/**
 * `/compte/agenda` (decision 147): the artist's calendar in the member space —
 * appointments, week, hours, time off and sync — reachable in one click from
 * the member menu, the Studio rail, the header's Studio menu and the
 * dashboard, and on a phone. Before, it was a tab of "My Glowbook" inside the
 * Studio's full-screen workspace.
 */
export function Agenda() {
  const { t } = useTranslation();
  const plan = useBookingsPlanKnown();
  return (
    <section className="grid gap-[var(--space-5)]">
      <SectionHeader icon={CalendarDays} eyebrow={t("booking.page.eyebrow")} title={t("booking.page.title")} description={t("booking.page.description")} />
      <ArtistAgenda plan={plan} />
    </section>
  );
}
