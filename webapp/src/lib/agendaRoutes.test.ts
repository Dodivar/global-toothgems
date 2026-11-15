import { describe, expect, it } from "vitest";
import { AGENDA_PATH, agendaPath, agendaTab, legacyAgendaAddress } from "./agendaRoutes";

describe("agenda routes (decision 147)", () => {
  it("reads a tab, the appointments by default", () => {
    expect(agendaTab("closures")).toBe("closures");
    expect(agendaTab("agenda")).toBe("appointments");
    expect(agendaTab(null)).toBe("appointments");
  });

  it("writes a tab's address", () => {
    expect(agendaPath()).toBe(AGENDA_PATH);
    expect(agendaPath("hours")).toBe("/compte/agenda?tab=hours");
  });

  it("moves the former Glowbook calendar tab, and only it", () => {
    expect(legacyAgendaAddress("/studio-3d/atelier/glowbook", "?tab=agenda")).toBe(AGENDA_PATH);
    expect(legacyAgendaAddress("/studio-3d/atelier/glowbook/", "?x=1&tab=agenda")).toBe(AGENDA_PATH);
    expect(legacyAgendaAddress("/studio-3d/atelier/glowbook", "?tab=look")).toBeNull();
    expect(legacyAgendaAddress("/studio-3d/atelier/glowbook", "")).toBeNull();
    expect(legacyAgendaAddress("/studio-3d/atelier", "?tab=agenda")).toBeNull();
  });
});
