/**
 * The member space — the account and the Artist Community under `/compte` —
 * wears its own chrome: a full-height sidebar that carries both its sections
 * and the way out to the shop, the Academy and the Studio. The storefront
 * header and footer are left out on these routes, as they are on the Studio.
 */
export const MEMBER_SPACE_PATH = "/compte";

/** True on `/compte` and every screen under it, never on a mere prefix match such as `/comptes`. */
export function isMemberSpacePath(pathname: string): boolean {
  return pathname === MEMBER_SPACE_PATH || pathname.startsWith(`${MEMBER_SPACE_PATH}/`);
}

/** Address of one order's detail page in the member space. */
export function orderHref(reference: string): string {
  return `${MEMBER_SPACE_PATH}/commandes/${encodeURIComponent(reference)}`;
}
