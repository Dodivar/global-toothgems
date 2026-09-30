import type { ReactNode } from "react";
import { CommunitySectionLayout } from "../../../src/zones/account";

/** The Artist Community's layout: its channels, and the door for an account without access. */
export default function Layout({ children }: { children: ReactNode }) {
  return <CommunitySectionLayout>{children}</CommunitySectionLayout>;
}
