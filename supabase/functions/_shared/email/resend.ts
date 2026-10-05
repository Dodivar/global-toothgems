/**
 * Resend REST client (https://resend.com/docs/api-reference/emails/send-email).
 * A plain `fetch`, injectable for tests: no SDK, no dependency.
 *
 * Failures are classified: `retryable` (network, 429, 5xx, concurrent request
 * with the same idempotency key) versus permanent (validation, domain not
 * verified, bad key…), so the caller knows whether trying again can help.
 */

export interface ResendConfig {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Resend keeps keys for 24 h: the same key never sends twice in that window. */
  idempotencyKey: string;
  headers?: Record<string, string>;
  /** Resend tags: names and values are ASCII letters, digits, `_` or `-`. */
  tags?: { name: string; value: string }[];
}

export class ResendError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ResendError";
    this.status = status;
    this.retryable = retryable;
  }
}

export async function sendWithResend(config: ResendConfig, mail: OutgoingEmail): Promise<{ id: string }> {
  if (mail.idempotencyKey.length === 0 || mail.idempotencyKey.length > 256) {
    throw new ResendError("idempotency key must be 1-256 characters", 0, false);
  }
  const doFetch = config.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.idempotencyKey,
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
        ...(mail.tags ? { tags: mail.tags } : {}),
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });
  } catch (error) {
    throw new ResendError(`network error: ${error instanceof Error ? error.message : String(error)}`, 0, true);
  }

  let payload: { id?: unknown; message?: unknown } = {};
  try {
    payload = await response.json();
  } catch {
    // Non-JSON answer: classified by its status below.
  }

  if (response.ok && typeof payload.id === "string") return { id: payload.id };

  const retryable = response.status === 429 || response.status >= 500 || response.status === 409 || response.ok;
  const detail = typeof payload.message === "string" ? payload.message : "no detail";
  throw new ResendError(`Resend ${response.status}: ${detail}`, response.status, retryable);
}
