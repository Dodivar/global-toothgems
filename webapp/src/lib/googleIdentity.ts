/**
 * Google's own sign-in button (Google Identity Services), the alternative to
 * the redirect through `<project>.supabase.co`.
 *
 * With the redirect, Google's consent page names the Supabase domain. Here the
 * browser asks Google for an ID token in a pop-up that names this site, then
 * `supabase.auth.signInWithIdToken` opens the session. Without a client id the
 * app keeps the redirect (`signInWithGoogle`), so nothing breaks while the
 * Google side is being set up.
 *
 * The client id is public by nature (it is in every Google page's URL); the
 * secret stays in the Supabase dashboard.
 */

/** The same OAuth client id as the one registered in Supabase Auth › Google. */
export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

export const isGoogleIdentityConfigured = googleClientId !== "";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export interface GoogleCredentialResponse {
  /** The signed ID token Supabase verifies. */
  credential?: string;
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        nonce?: string;
        use_fedcm_for_prompt?: boolean;
        use_fedcm_for_button?: boolean;
        auto_select?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: "standard" | "icon";
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          text?: "signin_with" | "signup_with" | "continue_with" | "signin";
          shape?: "rectangular" | "pill";
          logo_alignment?: "left" | "center";
          width?: number;
          locale?: string;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

let loading: Promise<GoogleIdentityApi> | null = null;

/** Loads Google's script once; rejects when it cannot be reached (blocker, offline). */
export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise<GoogleIdentityApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("google identity missing")));
    script.onerror = () => {
      loading = null; // a later attempt may succeed
      script.remove();
      reject(new Error("google identity unreachable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A fresh nonce for one sign-in. Google receives its SHA-256 (`hashed`), the
 * ID token carries that hash, and Supabase receives the `raw` value to compare
 * with it: a token captured elsewhere cannot be replayed here.
 */
export async function createGoogleNonce(): Promise<{ raw: string; hashed: string }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const raw = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return { raw, hashed };
}
