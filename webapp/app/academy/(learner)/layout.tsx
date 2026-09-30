import type { ReactNode } from "react";
import { guardRequest } from "../../_zones/guard";
import { ZoneChrome } from "../../../src/zones/ZoneChrome";

/**
 * The learner pages: a signed-out visitor is sent to the sign-in page on the
 * server, before anything is rendered (docs/migration-nextjs.md, phase 4).
 * Each page checks again with its own address. Rendered in the browser only.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/academy/lecon");
  return <ZoneChrome zone="learn">{children}</ZoneChrome>;
}
