"use client";

import type { ReactNode } from "react";
import { RequireAccount } from "../lib/auth";

/**
 * The learner's own pages (`app/academy/(learner)`): every one needs the
 * account (navigation; the server layout turned signed-out visitors away
 * already), and each checks the enrolment itself (`lib/learning/access.ts`).
 */
export function LearnerLayout({ children }: { children: ReactNode }) {
  return <RequireAccount>{children}</RequireAccount>;
}
