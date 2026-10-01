import type { ReactNode } from "react";
import { guardRequest } from "../_zones/guard";
import { ZoneChrome } from "../../src/zones/ZoneChrome";
import { MemberShellLayout } from "../../src/zones/account";

/**
 * The member space and the community: a signed-out visitor is sent to the
 * sign-in page on the server, before anything is rendered
 * (docs/migration-nextjs.md, phase 4); each page checks again with its own
 * address. Rendered in the browser only, in the member space's shell.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/compte");
  return (
    <ZoneChrome>
      <MemberShellLayout>{children}</MemberShellLayout>
    </ZoneChrome>
  );
}
