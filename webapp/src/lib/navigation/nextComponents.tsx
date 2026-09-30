"use client";

import NextLink from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { isActivePath } from "./href";
import { useInternalPath, useNavigate, useResolve } from "./nextHooks";
import { handOff } from "./state";
import type { LinkProps, NavigateProps, NavLinkProps } from "./types";

/* The navigation components on the Next.js router (see `nextHooks.ts`). */

export function Link({ to, replace, state, onClick, children, ...rest }: LinkProps) {
  const resolve = useResolve();
  const href = resolve(to);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) handOff(href, state);
  };
  return (
    <NextLink href={href} replace={replace} scroll={false} prefetch={false} onClick={handleClick} {...rest}>
      {children}
    </NextLink>
  );
}

export function NavLink({ to, end, className, style, children, ...rest }: NavLinkProps) {
  const internal = useInternalPath();
  const isActive = isActivePath(internal, to, end);
  const render = { isActive, isPending: false };
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={typeof className === "function" ? className(render) : className}
      style={typeof style === "function" ? style(render) : style}
      {...rest}
    >
      {typeof children === "function" ? children(render) : children}
    </Link>
  );
}

/** Goes to `to` once mounted, like React Router's `<Navigate>`. */
export function Navigate({ to, replace, state }: NavigateProps) {
  const navigate = useNavigate();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    navigate(to, { replace, state });
  }, [navigate, to, replace, state]);
  return null;
}
