"use client";

import type { ReactNode } from "react";
import { BackendContext, useBackend } from "./context";
import type { LinkProps, NavigateProps, NavigationBackend, NavLinkProps } from "./types";

export function NavigationBackendProvider({ backend, children }: { backend: NavigationBackend; children: ReactNode }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function Link(props: LinkProps) {
  const { Link: Implementation } = useBackend();
  return <Implementation {...props} />;
}

export function NavLink(props: NavLinkProps) {
  const { NavLink: Implementation } = useBackend();
  return <Implementation {...props} />;
}

export function Navigate(props: NavigateProps) {
  const { Navigate: Implementation } = useBackend();
  return <Implementation {...props} />;
}
