/** Request header the proxy sets with the page's language, read by the root layout for `<html lang>`. */
export const LOCALE_HEADER = "x-gt-locale";

/**
 * Request header the proxy sets with the address asked for (path and query),
 * read by the server layouts of the private zones to send a signed-out visitor
 * back there after sign-in. Always overwritten by the proxy.
 */
export const PATH_HEADER = "x-gt-path";
