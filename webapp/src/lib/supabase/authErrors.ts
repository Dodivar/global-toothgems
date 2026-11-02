import type { AuthError } from "@supabase/supabase-js";

/** Supabase Auth refused the request because too many were sent (e-mails or calls). */
export const isAuthRateLimit = (error: AuthError) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";
