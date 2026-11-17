"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarPlus, FileDown, Mail, Smartphone } from "lucide-react";
import { Button } from "../ui/Button";
import { Menu, type MenuItem } from "../ui/Menu";
import { calendarPlatform, googleEventUrl, outlookEventUrl, type CalendarPlatform } from "../../lib/calendarLinks";
import { type AppointmentEvent, appointmentIcs, openIcs } from "../../lib/glowbookIcs";
import { useHydrated } from "../../lib/useHydrated";

/**
 * "Add to my calendar" for one Glowbook appointment, for the client
 * (`/compte/rendez-vous`) and the artist (`/compte/agenda`): one button opening
 * a choice — Apple Calendar (iPhone, iPad, Mac: the `.ics` handed to Calendar),
 * Google Calendar and Outlook (their prefilled "new event" pages, which also
 * work on a phone), or the `.ics` file for any other calendar. The device's own
 * calendar comes first, read once hydrated. The `.ics` keeps the booking
 * e-mails' event id, so a calendar that already has the event replaces it.
 */
export function AddToCalendarMenu({ event, filename }: { event: AppointmentEvent; filename: string }) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const platform: CalendarPlatform = hydrated ? calendarPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0) : "other";

  const items = useMemo<MenuItem[]>(() => {
    const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
    const apple: MenuItem = {
      id: "apple",
      label: t("booking.calendar.apple"),
      icon: Smartphone,
      onSelect: () => openIcs(appointmentIcs(event), filename, platform === "ios"),
    };
    const google: MenuItem = { id: "google", label: t("booking.calendar.google"), icon: CalendarPlus, onSelect: () => open(googleEventUrl(event)) };
    const outlook: MenuItem = { id: "outlook", label: t("booking.calendar.outlook"), icon: Mail, onSelect: () => open(outlookEventUrl(event)) };
    const file: MenuItem = { id: "ics", label: t("booking.calendar.file"), icon: FileDown, onSelect: () => openIcs(appointmentIcs(event), filename, false) };
    const first = platform === "android" ? [google, apple] : [apple, google];
    // On an iPhone the Apple entry already hands the file to Calendar; the file entry is for other apps.
    return [...first, outlook, file];
  }, [event, filename, platform, t]);

  return (
    <Menu
      label={t("booking.calendar.add")}
      align="start"
      width={248}
      items={items}
      trigger={(props) => (
        <Button size="sm" variant="outline" iconLeft={CalendarPlus} {...props}>
          {t("booking.calendar.add")}
        </Button>
      )}
    />
  );
}
