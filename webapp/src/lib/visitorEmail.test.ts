import { describe, expect, it, vi } from "vitest";
import { buildSendEmailBody, sendVisitorEmail, type VisitorEmail } from "./visitorEmail";

const config = { functionsUrl: "https://abc.supabase.co/functions/v1/", secret: "s3cret" };
const contact: VisitorEmail = {
  kind: "contact_acknowledgement",
  to: "lea@example.com",
  locale: "fr",
  name: "Léa",
  subject: "Question",
  ticketNumber: "SUP-100001",
};
const newsletter: VisitorEmail = {
  kind: "newsletter_confirmation",
  to: "lea@example.com",
  locale: "en",
  confirmUrl: "https://globaltoothgems.com/en/newsletter/confirm?token=abc",
  confirmToken: "a".repeat(48),
};

const answer = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("buildSendEmailBody", () => {
  it("keys the contact e-mail on the ticket", async () => {
    expect(await buildSendEmailBody(contact)).toEqual({
      template_key: "contact_acknowledgement",
      to: "lea@example.com",
      locale: "fr",
      variables: { name: "Léa", subject: "Question", ticket_number: "SUP-100001" },
      event_key: "contact_acknowledgement:SUP-100001",
    });
  });

  it("keys the newsletter e-mail on a hash of the token, never the token itself", async () => {
    const body = await buildSendEmailBody(newsletter);
    expect(body.event_key).toMatch(/^newsletter_confirmation:[0-9a-f]{32}$/);
    expect(JSON.stringify(body.event_key)).not.toContain("a".repeat(48));
    expect(await buildSendEmailBody({ ...newsletter, confirmToken: "b".repeat(48) })).not.toEqual(body);
    expect(await buildSendEmailBody(newsletter)).toEqual(body);
  });
});

describe("sendVisitorEmail", () => {
  it("posts to send-email with the secret header and reports sent / duplicate", async () => {
    const fetchImpl = answer(200, { ok: true, status: "sent" });
    expect(await sendVisitorEmail(config, contact, fetchImpl)).toBe("sent");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/functions/v1/send-email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-internal-secret"]).toBe("s3cret");
    expect(await sendVisitorEmail(config, contact, answer(200, { ok: true, status: "duplicate" }))).toBe("duplicate");
  });

  it("never throws: refusals and failures become outcomes", async () => {
    expect(await sendVisitorEmail(config, contact, answer(400))).toBe("rejected");
    expect(await sendVisitorEmail(config, contact, answer(401))).toBe("unavailable");
    expect(await sendVisitorEmail(config, contact, answer(503))).toBe("unavailable");
    const down = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await sendVisitorEmail(config, contact, down)).toBe("unavailable");
  });
});
