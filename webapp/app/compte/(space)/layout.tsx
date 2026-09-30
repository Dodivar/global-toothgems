import type { ReactNode } from "react";
import { AccountSectionLayout } from "../../../src/zones/account";

/** The member space's content column (`AccountLayout`); the community has its own. */
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountSectionLayout>{children}</AccountSectionLayout>;
}
