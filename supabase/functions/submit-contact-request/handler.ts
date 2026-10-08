import { corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress, isValidAddress, type SendRequest, type SendResult } from "../_shared/email/send.ts";

/**
 * POST /functions/v1/submit-contact-request — the contact form's only way in.
 *
 *   browser ──(multipart: fields + up to 5 files)──▶ this function
 *     1. validates every field and file (type by content, 5 files, 20 MB in all)
 *     2. throttles by caller address (the database throttles by account / e-mail on top)
 *     3. stores the files in the private bucket `contact-attachments`
 *        (`<user id>/…` for a signed-in member, `guest/…` for a visitor; names are ours)
 *     4. submit_contact_request(): as the member with their JWT, as the service role for a visitor
 *     5. e-mails the customer an acknowledgement and the support inbox the message with its files
 *
 * Why a function and not a Next.js route: visitors cannot call the RPC and the Next.js server
 * must not hold the service-role key (AGENTS.md §4). No captcha yet — a provider is still to be
 * chosen; the honeypot field `website` and the two throttles stand in until then.
 *
 * Both e-mails are best effort: the ticket is the record, so a provider outage never fails the
 * form. The answer is `{ status: "sent", ticket_number }` or `{ error }` with a short code.
 */

export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
/** Fields and multipart framing on top of the files. */
const MAX_REQUEST_BYTES = MAX_TOTAL_BYTES + 512 * 1024;

const CATEGORIES = [
  "order", "delivery", "returns", "product", "training", "technical", "privacy", "professional", "other",
] as const;
type Category = (typeof CATEGORIES)[number];

/** The team reads French. */
const CATEGORY_LABELS: Record<Category, string> = {
  order: "Commande",
  delivery: "Livraison",
  returns: "Retour / remboursement",
  product: "Question produit",
  training: "Formation",
  technical: "Problème technique",
  privacy: "Demande de confidentialité",
  professional: "Demande professionnelle",
  other: "Autre",
};

type FileKind = { mime: string; ext: string };
const JPEG: FileKind = { mime: "image/jpeg", ext: "jpg" };
const PNG: FileKind = { mime: "image/png", ext: "png" };
const PDF: FileKind = { mime: "application/pdf", ext: "pdf" };

/** What the file really is, from its first bytes — the declared type and name are not trusted. */
export function sniffFile(head: Uint8Array): FileKind | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return JPEG;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return PNG;
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return PDF; // %PDF
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export interface ContactSubmission {
  name: string;
  email: string;
  category: Category;
  subject: string;
  message: string;
  orderReference: string | null;
  locale: "fr" | "en";
}

export type DbError = { code?: string; message?: string };

export interface ContactDeps {
  origins: SiteOrigins;
  /** The user id behind a Supabase access token, or null (a visitor's publishable key is not one). */
  userFromToken(token: string): Promise<string | null>;
  /** False when this caller address has used up its attempts. */
  ipAllowed(ipHash: string): Promise<boolean>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** The RPC, as the member (their JWT) or, without `token`, as the service role. */
  submit(
    caller: { userId: string | null; token: string | null },
    submission: ContactSubmission,
    paths: string[],
  ): Promise<{ ticket: string } | { error: DbError }>;
  /** Support inbox: the saved support e-mail, else EMAIL_REPLY_TO. */
  supportEmail(): Promise<string | null>;
  sendEmail(request: SendRequest): Promise<SendResult>;
  log(message: string, detail?: unknown): void;
}

interface Upload {
  bytes: Uint8Array;
  kind: FileKind;
  filename: string;
}

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function parseFields(form: FormData): ContactSubmission | null {
  const name = text(form, "name");
  const email = text(form, "email").toLowerCase();
  const category = text(form, "category");
  const subject = text(form, "subject");
  const message = text(form, "message");
  const order = text(form, "order_reference");
  const locale = text(form, "locale") === "en" ? "en" : "fr";
  if (!name || name.length > 120) return null;
  if (!isValidAddress(email)) return null;
  if (!(CATEGORIES as readonly string[]).includes(category)) return null;
  if (!subject || subject.length > 200) return null;
  if (message.length < 20 || message.length > 5000) return null;
  if (order.length > 40) return null;
  return { name, email, category: category as Category, subject, message, orderReference: order || null, locale };
}

/** Only the headers the platform sets itself: `x-forwarded-for` can be written by the caller. */
const clientAddress = (req: Request): string | null =>
  req.headers.get("sb-forwarded-for")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || null;

/** A file name safe to show in an e-mail: no path, no control characters, bounded. */
function displayName(original: string, ext: string, index: number): string {
  const base = original.replace(/^.*[\\/]/, "").replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 80);
  const named = base && base !== "." ? base : `piece-jointe-${index + 1}`;
  return named.toLowerCase().endsWith(`.${ext}`) || (ext === "jpg" && /\.jpe?g$/i.test(named)) ? named : `${named}.${ext}`;
}

export async function handleContact(req: Request, deps: ContactDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("Origin"));
  const reply = (body: unknown, status: number) => json(body, status, cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  if (Number(req.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) return reply({ error: "too_large" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }

  // Honeypot: a field no person sees. A bot that fills it is told all went well.
  if (text(form, "website") !== "") return reply({ status: "sent" }, 200);

  const fields = parseFields(form);
  if (!fields) return reply({ error: "invalid_request" }, 400);

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_FILES) return reply({ error: "too_many_files" }, 400);
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return reply({ error: "files_too_large" }, 413);

  const uploads: Upload[] = [];
  for (const [index, file] of files.entries()) {
    const kind = sniffFile(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (!kind) return reply({ error: "file_type" }, 400);
    uploads.push({ bytes: new Uint8Array(await file.arrayBuffer()), kind, filename: displayName(file.name, kind.ext, index) });
  }

  const auth = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const userId = auth ? await deps.userFromToken(auth) : null;

  const ip = clientAddress(req);
  if (ip && !(await deps.ipAllowed(await hashAddress(ip)))) return reply({ error: "rate_limited" }, 429);

  const folder = userId ?? "guest";
  const paths: string[] = [];
  try {
    for (const upload of uploads) {
      const path = `${folder}/${crypto.randomUUID()}.${upload.kind.ext}`;
      await deps.upload(path, upload.bytes, upload.kind.mime);
      paths.push(path);
    }
  } catch (error) {
    deps.log("submit-contact-request: upload failed", error instanceof Error ? error.message : error);
    await deps.remove(paths).catch(() => undefined);
    return reply({ error: "server_error" }, 500);
  }

  const result = await deps.submit({ userId, token: userId ? auth : null }, fields, paths).catch((error) => ({
    error: { message: error instanceof Error ? error.message : String(error) } as DbError,
  }));
  if ("error" in result) {
    if (paths.length > 0) await deps.remove(paths).catch(() => undefined);
    const { code, message } = result.error;
    if (code === "PT429") return reply({ error: "rate_limited" }, 429);
    if (code === "22023" || code === "23514") return reply({ error: "invalid_request" }, 400);
    deps.log("submit-contact-request: submit_contact_request failed", { code, message });
    return reply({ error: code === "42501" ? "forbidden" : "server_error" }, code === "42501" ? 403 : 500);
  }

  await notify(deps, result.ticket, fields, uploads);
  return reply({ status: "sent", ticket_number: result.ticket }, 200);
}

/** The two e-mails. Neither throws: the ticket exists, a provider outage is only logged. */
async function notify(deps: ContactDeps, ticket: string, fields: ContactSubmission, uploads: Upload[]): Promise<void> {
  const attempt = async (label: string, request: SendRequest) => {
    try {
      const result = await deps.sendEmail(request);
      if (result.status === "failed" || result.status === "invalid" || result.status === "template_missing") {
        deps.log(`submit-contact-request: ${label} e-mail not sent`, { ticket, status: result.status });
      }
    } catch (error) {
      deps.log(`submit-contact-request: ${label} e-mail crashed`, { ticket, error: error instanceof Error ? error.message : error });
    }
  };

  await attempt("acknowledgement", {
    templateKey: "contact_acknowledgement",
    to: fields.email,
    locale: fields.locale,
    variables: { name: fields.name, subject: fields.subject, ticket_number: ticket },
    eventKey: `contact_acknowledgement:${ticket}`,
  });

  const support = await deps.supportEmail().catch(() => null);
  if (!support) {
    deps.log("submit-contact-request: no support address configured, the team was not e-mailed", { ticket });
    return;
  }
  await attempt("support", {
    templateKey: "contact_request_received",
    to: support,
    locale: "fr",
    variables: {
      ticket_number: ticket,
      category: CATEGORY_LABELS[fields.category],
      subject: fields.subject,
      name: fields.name,
      email: fields.email,
      order_reference: fields.orderReference ?? "—",
      attachments: uploads.length > 0 ? uploads.map((u) => u.filename).join(", ") : "—",
      message: fields.message,
    },
    eventKey: `contact_request_received:${ticket}`,
    replyTo: fields.email,
    attachments: uploads.map((u) => ({ filename: u.filename, content: toBase64(u.bytes) })),
  });
}
