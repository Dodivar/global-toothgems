import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

/** A link target written with the app's internal path: `/boutique/x?type=y#z`. */
export type To = string;

export interface NavigateOptions {
  replace?: boolean;
  /** Handed to the page opened (`state.ts`). */
  state?: unknown;
}

export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

export interface AppLocation {
  /** The internal path (French paths for public pages). */
  pathname: string;
  /** `?a=b`, or "". */
  search: string;
  /** `#x`, or "": known once hydrated only (the server never sees it). */
  hash: string;
  /** What the navigation that opened the page carried, or null. */
  state: unknown;
}

export type SetSearchParams = (
  next: URLSearchParams | Record<string, string> | string | ((previous: URLSearchParams) => URLSearchParams),
  options?: { replace?: boolean },
) => void;

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: To;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export interface NavLinkRenderProps {
  isActive: boolean;
  isPending: boolean;
}

export type NavLinkProps = Omit<LinkProps, "className" | "style" | "children"> & {
  /** Active only on this exact path, not on the pages under it. */
  end?: boolean;
  className?: string | ((props: NavLinkRenderProps) => string | undefined);
  style?: CSSProperties | ((props: NavLinkRenderProps) => CSSProperties | undefined);
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode);
};

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: unknown;
}
