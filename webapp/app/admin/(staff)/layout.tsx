import type { ReactNode } from "react";
import { guardRequest } from "../../_zones/guard";
import { AdminStaffLayout } from "../../../src/zones/admin";

/**
 * The back office (not its access screen): a signed-out visitor, or a
 * signed-in account that is not an active staff member (decided 2026-10-01),
 * is sent to the access screen on the server (docs/migration-nextjs.md,
 * phases 4–5); each page checks again with its own address. `RequireAdmin`
 * repeats it in the browser; RLS enforces it.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await guardRequest("/admin");
  return <AdminStaffLayout>{children}</AdminStaffLayout>;
}
