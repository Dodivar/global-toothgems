import type { ReactNode } from "react";
import { guardRequest } from "../../_zones/guard";
import { AdminStaffLayout } from "../../../src/zones/admin";

/**
 * The back office: a signed-out visitor, or a signed-in account that is not
 * an active staff member (decided 2026-10-01), gets the site's 404 on the
 * server (since 2026-11-11; docs/migration-nextjs.md, phases 4–5); each page
 * checks again with its own address. `RequireAdmin` repeats it in the
 * browser and asks staff for their second factor; RLS enforces it.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/admin");
  return <AdminStaffLayout>{children}</AdminStaffLayout>;
}
