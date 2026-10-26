import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import type { SmileTryOnService, TryOnStatus } from "./tryOn";
import { smileTryOnService } from "./tryOnService";

/**
 * The visitor's daily allowance of AI renders, read from the function's
 * status call (`studio-try-on`): what a signed-in member has left over the
 * last 24 hours, or, signed out, that an account is needed and how many
 * renders it gives. Asked whenever `enabled` turns true (the caller turns it
 * off while the try-on dialog is open, so the count follows the renders just
 * made). Display only: the function counts again on every render.
 */
export function useTryOnStatus(enabled: boolean, service: SmileTryOnService = smileTryOnService): TryOnStatus | null {
  const { signedIn, restoring } = useAuth();
  const [status, setStatus] = useState<TryOnStatus | null>(null);
  useEffect(() => {
    if (!enabled || restoring) return;
    let live = true;
    service
      .status()
      .then((next) => live && setStatus(next))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [service, signedIn, restoring, enabled]);
  return status;
}

/** Whether the member has no render left: the call to try is then turned off. */
export function tryOnExhausted(status: TryOnStatus | null, signedIn: boolean): boolean {
  return !!(signedIn && status?.available && status.quota && !status.quota.unlimited && status.quota.remaining === 0);
}
