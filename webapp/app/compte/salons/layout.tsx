import type { ReactNode } from "react";
import { LoungeSectionLayout } from "../../../src/zones/account";

/** The Members' Lounge: one screen whose room follows the address. */
export default function Layout({ children }: { children: ReactNode }) {
  return <LoungeSectionLayout>{children}</LoungeSectionLayout>;
}
