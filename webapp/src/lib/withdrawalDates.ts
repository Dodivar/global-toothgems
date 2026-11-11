/** Dates of the withdrawal function, in Paris time (decision 131). Pure. */

export function dateTimeLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang.startsWith("en") ? "en-GB" : "fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function dateLabel(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // The period ends at midnight Paris time: the last day is the day before.
  return new Intl.DateTimeFormat(lang.startsWith("en") ? "en-GB" : "fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(
    new Date(date.getTime() - 1000),
  );
}
