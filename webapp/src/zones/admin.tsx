"use client";

import type { ReactNode } from "react";
import { useAdminAuth } from "../lib/adminAuth";
import { AdminLayout } from "../screens/admin/AdminLayout";
import { NotFound } from "../screens/NotFound";
import { StaffSecondFactor } from "../components/admin/StaffSecondFactor";

/* The admin zone's layout (`app/admin/(staff)`). Each page imports its own screen. */

/**
 * The back office's shell (rail, drawer and the stores of its sections), for a
 * staff session that has passed its second factor. Navigation only: RLS is
 * the authority, and the proxy and the server layout already answered 404 to
 * anyone who is not staff.
 */
export function AdminStaffLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <AdminLayout>{children}</AdminLayout>
    </RequireAdmin>
  );
}

/**
 * Anyone without a staff session gets the ordinary 404 (there is no back-office
 * sign-in page: staff sign in on `/connexion`); a staff session without its
 * second factor gets the second-factor screen.
 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { signedIn, restoring, secondFactor } = useAdminAuth();
  // Wait for a kept session before deciding, or a refresh would show a
  // signed-in administrator the 404.
  if (restoring) return <div aria-busy="true" className="min-h-screen" />;
  if (!signedIn) return <NotFound />;
  if (!secondFactor) return <StaffSecondFactor />;
  return <>{children}</>;
}
