/**
 * The artist's calendar page (decision 147): `/compte/agenda`, in the member
 * space, so it works on a phone and stays reachable after the Atelier plan
 * ends (the appointments already booked are still handled there). Its parts
 * are tabs addressed by `?tab=` so a link — an e-mail, the dashboard — can
 * open one directly.
 */
export const AGENDA_PATH = "/compte/agenda";

export const AGENDA_TABS = ["appointments", "week", "hours", "closures", "sync"] as const;
export type AgendaTab = (typeof AGENDA_TABS)[number];

/** The tab a `?tab=` value names; the appointments for anything else. */
export function agendaTab(value: string | null | undefined): AgendaTab {
  return AGENDA_TABS.includes(value as AgendaTab) ? (value as AgendaTab) : "appointments";
}

/** The address of a tab of the calendar page. */
export function agendaPath(tab: AgendaTab = "appointments"): string {
  return tab === "appointments" ? AGENDA_PATH : `${AGENDA_PATH}?tab=${tab}`;
}

/**
 * The calendar lived in the Glowbook's "Calendar" tab until decision 147:
 * `/studio-3d/atelier/glowbook?tab=agenda`, an address still in booking
 * e-mails already sent and in the calendar feeds artists subscribed to. The
 * proxy moves it here before the Studio's access check, so an artist whose
 * plan ended still reaches the appointments booked.
 */
export function legacyAgendaAddress(pathname: string, search: string): string | null {
  if (pathname.replace(/\/+$/, "") !== "/studio-3d/atelier/glowbook") return null;
  return new URLSearchParams(search).get("tab") === "agenda" ? AGENDA_PATH : null;
}
