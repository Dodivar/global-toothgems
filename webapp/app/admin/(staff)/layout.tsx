import type { ReactNode } from "react";
import { guardRequest } from "../../_zones/guard";
import { AdminStaffLayout } from "../../../src/zones/admin";

/**
 * The back office (not its access screen): a signed-out visitor is sent to the
 * sign-in page on the server, before anything is rendered
 * (docs/migration-nextjs.md, phase 4); each page checks again with its own
 * address. The staff role is not checked on the server: `RequireAdmin` and
 * the back office do it, RLS enforces it.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/admin");
  return <AdminStaffLayout>{children}</AdminStaffLayout>;
}
