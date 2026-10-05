/*
 * Visitor-form e-mails (contact acknowledgement, newsletter confirmation): the
 * server routes ask the Edge Function `send-email` to send them. The function
 * owns the Resend key, the templates and the once-per-event rule; this module
 * only builds the request it accepts and reads its answer.
 *
 * Pure with injected configuration and `fetch`, so it is unit-tested without
 * I/O; the server-only wrapper that reads the environment is
 * `visitorEmailServer.ts`. Never imported by browser code: the shared secret
 * must not reach a bundle.
 */

export interface VisitorEmailConfig {
  /** `https://<project-ref>.supabase.co/functions/v1` */
  functionsUrl: string;
  /** EMAIL_INTERNAL_SECRET: the same value as in the Edge Function secrets. */
  secret: string;
}

export type VisitorEmail =
  | { kind: "contact_acknowledgement"; to: string; locale: string; name: string; subject: string; ticketNumber: string }
  /** `confirmToken` is the one `newsletter_subscribe()` returned; only a hash of it names the event. */
  | { kind: "newsletter_confirmation"; to: string; locale: string; confirmUrl: string; confirmToken: string };

export type VisitorEmailOutcome = "sent" | "duplicate" | "rejected" | "unavailable";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The body `send-email` accepts for this e-mail (see supabase/functions/send-email/handler.ts). */
export async function buildSendEmailBody(email: VisitorEmail): Promise<Record<string, unknown>> {
  if (email.kind === "contact_acknowledgement") {
    return {
      template_key: "contact_acknowledgement",
      to: email.to,
      locale: email.locale,
      variables: { name: email.name, subject: email.subject, ticket_number: email.ticketNumber },
      event_key: `contact_acknowledgement:${email.ticketNumber}`,
    };
  }
  // A new subscription attempt has a new token, so it gets its own event; a
  // retry of the same attempt (same token) cannot send the link twice.
  return {
    template_key: "newsletter_confirmation",
    to: email.to,
    locale: email.locale,
    variables: { confirm_url: email.confirmUrl },
    event_key: `newsletter_confirmation:${(await sha256Hex(email.confirmToken)).slice(0, 32)}`,
  };
}

/**
 * Sends one visitor e-mail. Never throws: a visitor's form must not fail
 * because the e-mail did (the ticket or the subscription is already recorded).
 * "unavailable" covers a network error, a timeout and any server-side failure.
 */
export async function sendVisitorEmail(
  config: VisitorEmailConfig,
  email: VisitorEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<VisitorEmailOutcome> {
  try {
    const response = await fetchImpl(`${config.functionsUrl.replace(/\/+$/, "")}/send-email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": config.secret },
      body: JSON.stringify(await buildSendEmailBody(email)),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const answer = (await response.json().catch(() => null)) as { status?: unknown } | null;
      return answer?.status === "duplicate" ? "duplicate" : "sent";
    }
    return response.status === 400 ? "rejected" : "unavailable";
  } catch {
    return "unavailable";
  }
}
