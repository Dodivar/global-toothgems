import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Props that turn the shared `Button` into a real link with client-side
 * navigation.
 *
 * The recovery actions on the system pages are destinations, so they are
 * rendered as `<a href>`: a screen reader announces them as links, and a
 * middle-click or Cmd-click still opens a new tab. A plain click is then
 * handed to the router, so the app never reloads to leave an error page.
 */
export function useRouterLink() {
  const navigate = useNavigate();
  return (to: string) => ({
    as: "a" as const,
    href: to,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
    },
  });
}
