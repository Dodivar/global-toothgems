/**
 * The two public values every Supabase client of the app is built from —
 * browser, route handlers and the proxy alike. Written out in full: Next.js
 * inlines `process.env.NEXT_PUBLIC_*` into the browser bundle only for literal
 * references. Only the PUBLISHABLE key ever belongs here.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

/** Without both, the app runs on its mock data and no server code touches Supabase. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
