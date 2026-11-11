import type { AuthError } from "@supabase/supabase-js";

/** Supabase Auth refused the request because too many were sent (e-mails or calls). */
export const isAuthRateLimit = (error: AuthError) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";

/** Supabase Auth's captcha protection refused the request (no token, an expired or a reused one). */
export const isAuthCaptchaRefusal = (error: AuthError) => error.code === "captcha_failed";
