/**
 * Sends one templated e-mail exactly once per business event.
 *
 *   load template → render → claim the event in `email_log` → Resend → record
 *
 * `eventKey` names the business event ("order_confirmation:<order id>",
 * "gift_card:<card id>"). The claim is atomic in the database, so a Stripe
 * webhook retried, a cron run overlapping another or a double click sends one
 * e-mail; a failed attempt can be claimed again, a delivered one never.
 * Everything external (database, Resend) is injected: the flow is tested without I/O.
 */
import { type EmailContent, EmailRenderError, type LayoutOptions, renderEmail, type TemplateRow } from "./render.ts";
import { type OutgoingEmail, type ResendConfig, ResendError, sendWithResend } from "./resend.ts";

export interface ClaimEntry {
  eventKey: string;
  templateKey: string;
  locale: string;
  /** sha256 of the lower-cased address: the log never holds an address. */
  recipientHash: string;
  orderId?: string;
  giftCardId?: string;
}

export type Claim = { claimed: true; attempt: number } | { claimed: false; status: string };

export interface EmailStore {
  loadTemplate(key: string, locale: string): Promise<TemplateRow | null>;
  claim(entry: ClaimEntry): Promise<Claim>;
  markSent(eventKey: string, providerId: string): Promise<void>;
  markFailed(eventKey: string, error: string): Promise<void>;
}

export interface EmailDeps {
  store: EmailStore;
  resend: ResendConfig;
  /** `Global Tooth Gems <no-reply@globaltoothgems.com>` */
  from: string;
  replyTo?: string;
  layout: LayoutOptions;
}

export interface SendRequest {
  templateKey: string;
  to: string;
  locale: string;
  variables: Record<string, string>;
  eventKey: string;
  orderId?: string;
  giftCardId?: string;
  /** Extra headers, e.g. `List-Unsubscribe` for marketing e-mails. */
  headers?: Record<string, string>;
  /**
   * Layout content around the template body (title, actions, order summary…), built from
   * `components.ts`. A function receives the locale of the template actually found
   * (it may differ from the requested one), so its labels match the body's language.
   */
  content?: EmailContent | ((locale: string) => EmailContent);
}

export type SendResult =
  | { status: "sent"; id: string }
  /** Already sent (or being sent) for this event: nothing was sent now. */
  | { status: "duplicate"; previous: string }
  | { status: "template_missing" }
  | { status: "invalid"; error: string }
  | { status: "failed"; error: string; retryable: boolean };

const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export function isValidAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS.test(value);
}

export async function hashAddress(address: string): Promise<string> {
  const bytes = new TextEncoder().encode(address.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendTemplatedEmail(deps: EmailDeps, request: SendRequest): Promise<SendResult> {
  const to = request.to.trim();
  if (!isValidAddress(to)) return { status: "invalid", error: "invalid recipient address" };
  if (request.eventKey.length === 0 || request.eventKey.length > 200) {
    return { status: "invalid", error: "event key must be 1-200 characters" };
  }
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (/[\r\n]/.test(name + value)) return { status: "invalid", error: "header with a line break" };
  }

  const template = await deps.store.loadTemplate(request.templateKey, request.locale);
  if (!template) return { status: "template_missing" };

  let rendered;
  try {
    const content = typeof request.content === "function" ? request.content(template.locale) : request.content;
    rendered = renderEmail(template, request.variables, deps.layout, content);
  } catch (error) {
    if (error instanceof EmailRenderError) return { status: "invalid", error: error.message };
    throw error;
  }

  const claim = await deps.store.claim({
    eventKey: request.eventKey,
    templateKey: request.templateKey,
    locale: template.locale,
    recipientHash: await hashAddress(to),
    orderId: request.orderId,
    giftCardId: request.giftCardId,
  });
  if (!claim.claimed) return { status: "duplicate", previous: claim.status };

  const mail: OutgoingEmail = {
    from: deps.from,
    to,
    replyTo: deps.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // A new attempt after a failure gets a new key; a retried request of the same attempt cannot double-send.
    idempotencyKey: `${request.eventKey}:${claim.attempt}`,
    headers: request.headers,
    tags: [{ name: "template", value: request.templateKey }],
  };

  try {
    const { id } = await sendWithResend(deps.resend, mail);
    await deps.store.markSent(request.eventKey, id);
    return { status: "sent", id };
  } catch (error) {
    if (!(error instanceof ResendError)) throw error;
    await deps.store.markFailed(request.eventKey, error.message.slice(0, 500));
    return { status: "failed", error: error.message, retryable: error.retryable };
  }
}
