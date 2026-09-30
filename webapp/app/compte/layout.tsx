import type { ReactNode } from "react";
import { guardRequest } from "../_zones/guard";

/**
 * The member space: a signed-out visitor is sent to the sign-in page on the server,
 * before anything is rendered (docs/migration-nextjs.md, phase 4). The page
 * checks again with its own address.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/compte");
  return children;
}
