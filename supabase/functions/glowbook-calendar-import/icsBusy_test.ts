import { assert, assertEquals } from "jsr:@std/assert@1";
import { busyHours, busyIntervals, contentLines, floorToLocalHour, zonedToInstant } from "./icsBusy.ts";

const PARIS = "Europe/Paris";
const FROM = Date.parse("2026-11-16T00:00:00Z"); // a Monday
const TO = Date.parse("2026-12-14T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const cal = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", e.trim(), "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

Deno.test("local times: zones, DST and the local hour", () => {
  assertEquals(iso(zonedToInstant(Date.UTC(2026, 10, 20, 14), PARIS)), "2026-11-20T13:00:00.000Z");
  assertEquals(iso(zonedToInstant(Date.UTC(2026, 6, 1, 14), PARIS)), "2026-07-01T12:00:00.000Z");
  assertEquals(iso(floorToLocalHour(Date.parse("2026-11-20T13:45:00Z"), PARIS)), "2026-11-20T13:00:00.000Z");
});

Deno.test("folded lines and quoted parameters are read", () => {
  const lines = contentLines("DESCRIPTION:a long\r\n  line\r\nDTSTART;TZID=\"Europe/Paris\":20261120T140000\r\n");
  assertEquals(lines[0].value, "a long line");
  assertEquals(lines[1].params.TZID, "Europe/Paris");
});

Deno.test("a UTC event and a TZID event become their hours; a 90-minute event takes two hours", () => {
  const text = cal(
    "UID:a\r\nDTSTART:20261120T130000Z\r\nDTEND:20261120T143000Z\r\nSUMMARY:Secret",
    "UID:b\r\nDTSTART;TZID=Europe/Paris:20261121T100000\r\nDTEND;TZID=Europe/Paris:20261121T110000",
  );
  const hours = busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS);
  assertEquals(hours, ["2026-11-20T13:00:00.000Z", "2026-11-20T14:00:00.000Z", "2026-11-21T09:00:00.000Z"]);
});

Deno.test("free, cancelled and out-of-window events are left out; DURATION and Windows zones are read", () => {
  const text = cal(
    "UID:f\r\nDTSTART:20261120T090000Z\r\nDTEND:20261120T100000Z\r\nTRANSP:TRANSPARENT",
    "UID:c\r\nDTSTART:20261120T110000Z\r\nDTEND:20261120T120000Z\r\nSTATUS:CANCELLED",
    "UID:o\r\nDTSTART:20250101T090000Z\r\nDTEND:20250101T100000Z",
    "UID:d\r\nDTSTART;TZID=Romance Standard Time:20261123T150000\r\nDURATION:PT1H",
  );
  assertEquals(busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS), ["2026-11-23T14:00:00.000Z"]);
});

Deno.test("an all-day event fills the artist's local day", () => {
  const text = cal("UID:v\r\nDTSTART;VALUE=DATE:20261125\r\nDTEND;VALUE=DATE:20261126");
  const hours = busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS);
  assertEquals(hours.length, 24);
  assertEquals(hours[0], "2026-11-24T23:00:00.000Z");
});

Deno.test("a weekly recurrence with BYDAY, COUNT and EXDATE", () => {
  const text = cal(
    "UID:w\r\nDTSTART;TZID=Europe/Paris:20261116T180000\r\nDTEND;TZID=Europe/Paris:20261116T190000\r\n" +
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\r\nEXDATE;TZID=Europe/Paris:20261118T180000",
  );
  assertEquals(busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS), [
    "2026-11-16T17:00:00.000Z",
    "2026-11-23T17:00:00.000Z",
    "2026-11-25T17:00:00.000Z",
  ]);
});

Deno.test("a daily recurrence until a date, and a moved occurrence (RECURRENCE-ID)", () => {
  const text = cal(
    "UID:d1\r\nDTSTART:20261116T080000Z\r\nDTEND:20261116T090000Z\r\nRRULE:FREQ=DAILY;UNTIL=20261118T235959Z",
    "UID:d1\r\nRECURRENCE-ID:20261117T080000Z\r\nDTSTART:20261117T150000Z\r\nDTEND:20261117T160000Z",
  );
  assertEquals(busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS), [
    "2026-11-16T08:00:00.000Z",
    "2026-11-17T15:00:00.000Z",
    "2026-11-18T08:00:00.000Z",
  ]);
});

Deno.test("a long-running series started years ago is expanded only into the window", () => {
  const text = cal("UID:old\r\nDTSTART:20200106T090000Z\r\nDTEND:20200106T100000Z\r\nRRULE:FREQ=WEEKLY");
  const hours = busyHours(busyIntervals(text, PARIS, FROM, TO), PARIS);
  assertEquals(hours.length, 4);
  assert(hours.every((h) => new Date(h).getUTCDay() === 1));
});

Deno.test("monthly on the 31st skips short months; a garbage file gives nothing", () => {
  const text = cal("UID:m\r\nDTSTART:20261031T100000Z\r\nDTEND:20261031T110000Z\r\nRRULE:FREQ=MONTHLY;COUNT=3");
  const hours = busyHours(busyIntervals(text, PARIS, Date.parse("2026-10-01T00:00:00Z"), Date.parse("2027-03-01T00:00:00Z")), PARIS);
  assertEquals(hours, ["2026-10-31T10:00:00.000Z", "2026-12-31T10:00:00.000Z", "2027-01-31T10:00:00.000Z"]);
  assertEquals(busyIntervals("hello", PARIS, FROM, TO), []);
});
