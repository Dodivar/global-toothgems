/**
 * The name printed on a member's certificates: the first and last name of
 * their profile, never the e-mail fallback the rest of the account shows
 * (decided by the owner, 2026-10-07). A certificate can be downloaded or
 * shared only once both are filled in; until then the preview shows what is
 * there, or a placeholder.
 *
 * Pure: unit-tested in `certificate.test.ts`.
 */
export interface CertificateHolder {
  /** "First Last" as typed, trimmed; "" when neither is set. */
  name: string;
  /** Both names are present: the certificate may leave the screen. */
  complete: boolean;
}

export function certificateHolder(profile: { firstName?: string | null; lastName?: string | null } | null): CertificateHolder {
  const first = (profile?.firstName ?? "").trim().replace(/\s+/g, " ");
  const last = (profile?.lastName ?? "").trim().replace(/\s+/g, " ");
  return { name: `${first} ${last}`.trim(), complete: first.length > 0 && last.length > 0 };
}
