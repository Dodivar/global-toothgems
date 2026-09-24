/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://<ref>.supabase.co. Empty = mock catalogue. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (anon) key. Public by design: RLS enforces every read and write. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
