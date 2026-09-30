"use client";

import type { ReactNode } from "react";
import { RequireAdmin } from "../lib/adminAuth";
import { AdminLayout } from "../screens/admin/AdminLayout";

/* The admin zone's layout (`app/admin/(staff)`). Each page imports its own screen. */

/**
 * The back office's shell (rail, drawer and the stores of its sections), for a
 * staff session: `RequireAdmin` checks the role (navigation; RLS is the
 * authority, and the server layout only turned signed-out visitors away).
 */
export function AdminStaffLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <AdminLayout>{children}</AdminLayout>
    </RequireAdmin>
  );
}
