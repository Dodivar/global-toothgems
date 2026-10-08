import { FunctionsHttpError } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "../supabase/env";
import { requireSupabase } from "../supabase/client";

/**
 * The contact form's single persistence boundary (the screen never calls Supabase): one
 * multipart request to the Edge Function `submit-contact-request`, which stores the files,
 * creates the support ticket and sends the e-mails. A signed-in member's session travels with
 * the request; a visitor goes through the same door.
 */

export interface ContactMessage {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  orderReference: string;
  locale: "fr" | "en";
  files: File[];
}

/** Codes the function answers with, plus the client's own. Each has a message under `legal.contact.errors.send`. */
export const CONTACT_ERRORS = [
  "rate_limited",
  "file_type",
  "too_many_files",
  "files_too_large",
  "invalid_request",
  "network",
  "unavailable",
  "server_error",
] as const;
export type ContactError = (typeof CONTACT_ERRORS)[number];

export type ContactResult = { ok: true; ticketNumber: string | null } | { ok: false; error: ContactError };

const asError = (value: unknown): ContactError =>
  (CONTACT_ERRORS as readonly unknown[]).includes(value) ? (value as ContactError) : "server_error";

export function contactFormData(message: ContactMessage): FormData {
  const data = new FormData();
  data.set("name", message.name.trim());
  data.set("email", message.email.trim());
  data.set("category", message.category);
  data.set("subject", message.subject.trim());
  data.set("message", message.message.trim());
  data.set("order_reference", message.orderReference.trim());
  data.set("locale", message.locale);
  for (const file of message.files) data.append("files", file);
  return data;
}

export async function sendContactMessage(message: ContactMessage): Promise<ContactResult> {
  // Never a pretend success: without the backend the message goes nowhere, and the visitor is told.
  if (!isSupabaseConfigured) return { ok: false, error: "unavailable" };
  const { data, error } = await requireSupabase().functions.invoke("submit-contact-request", { body: contactFormData(message) });
  if (!error) {
    const ticket = (data as { ticket_number?: unknown } | null)?.ticket_number;
    return { ok: true, ticketNumber: typeof ticket === "string" ? ticket : null };
  }
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404) return { ok: false, error: "unavailable" };
    try {
      return { ok: false, error: asError(((await response.json()) as { error?: unknown }).error) };
    } catch {
      return { ok: false, error: "server_error" };
    }
  }
  return { ok: false, error: "network" };
}
