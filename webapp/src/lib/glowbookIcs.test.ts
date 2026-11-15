import { describe, expect, it } from "vitest";
import { appointmentIcs, appointmentUid } from "./glowbookIcs";

describe("appointment .ics (decision 147 (d))", () => {
  const event = {
    bookingId: "b1",
    startsAt: "2026-12-20T13:00:00.000Z",
    endsAt: "2026-12-20T14:00:00.000Z",
    summary: "Rendez-vous Glowbook — Léa",
    description: "Création : Aurora; commentaire, avec virgule",
    location: "12 rue de la Paix, Paris",
    url: "https://example.com/compte/rendez-vous",
  };

  it("writes one event with the e-mails' UID, UTC times and escaped text", () => {
    const ics = appointmentIcs(event, new Date("2026-11-15T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain(`UID:${appointmentUid("b1")}`);
    expect(appointmentUid("b1")).toBe("b1@glowbook.globaltoothgems");
    expect(ics).toContain("DTSTART:20261220T130000Z");
    expect(ics).toContain("DTEND:20261220T140000Z");
    expect(ics).toContain("LOCATION:12 rue de la Paix\\, Paris");
    expect(ics).toContain("DESCRIPTION:Création : Aurora\\; commentaire\\, avec virgule");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("leaves out an unknown place and folds long lines", () => {
    const ics = appointmentIcs({ ...event, location: null, description: "x".repeat(200) });
    expect(ics).not.toContain("LOCATION:");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});
