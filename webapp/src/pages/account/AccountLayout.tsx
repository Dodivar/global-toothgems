import { Outlet } from "react-router-dom";

/**
 * Content column of the member area: the active section, one route each.
 *
 * The navigation — the sections, the way out to the shop, the Academy and the
 * Studio, signing out — belongs to `MemberShell`, which frames this layout and
 * the Artist Community alike, so both share one sidebar.
 */
export function AccountLayout() {
  return (
    <div className="mx-auto grid w-full max-w-[var(--max-width-account)] min-w-0 gap-[clamp(28px,4vw,44px)] px-[clamp(14px,4vw,48px)] py-[clamp(24px,4vw,44px)]">
      <Outlet />
    </div>
  );
}
