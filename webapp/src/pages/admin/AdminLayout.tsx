import { useCallback, useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AdminSidebar } from "../../components/admin/AdminSidebar";
import { AdminCatalogProvider } from "../../lib/adminCatalog";
import { AdminOrdersProvider } from "../../lib/adminOrders";
import { AdminCustomersProvider } from "../../lib/adminCustomers";
import { useAdminAuth } from "../../lib/adminAuth";
import { useFocusTrap } from "../../lib/useFocusTrap";

/**
 * The administration shell: a fixed rail on the left, the section on the right.
 *
 * The rail is `position: fixed` rather than a grid column so the content column
 * owns the whole scroll — a sticky page header inside a scrolling grid cell
 * sticks to the cell, not to the viewport, and the header is what keeps the
 * page title and its actions reachable.
 *
 * Each page renders its own `AdminHeader`: the title, breadcrumbs and
 * contextual actions belong to the page that knows them, and passing them up
 * through the layout would put every page's copy in one file.
 */

interface AdminShellContext {
  /** Opens the navigation drawer on screens too narrow for the rail. */
  openNav: () => void;
}

export function useAdminShell(): AdminShellContext {
  return useOutletContext<AdminShellContext>();
}

export function AdminLayout() {
  const { t } = useTranslation();
  const { admin } = useAdminAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const drawerRef = useFocusTrap<HTMLDivElement>(navOpen, closeNav);

  const railWidth = collapsed ? "var(--admin-sidebar-collapsed)" : "var(--admin-sidebar)";

  return (
    <AdminCatalogProvider actor={admin?.name ?? "Administrateur"}>
      <AdminOrdersProvider>
      {/* Customers sit inside Orders: a customer record reads the order
          book for their order history, never the other way round. */}
      <AdminCustomersProvider>
      <div
        className="gt-admin min-h-screen"
        // Read by the product form's pinned action bar, which is fixed to the
        // viewport and has to clear the rail.
        style={{ "--admin-rail-offset": railWidth } as React.CSSProperties}
      >
        {/* Desktop rail */}
        <aside
          aria-label={t("admin.nav.primary")}
          className="fixed inset-y-0 left-0 z-[90] hidden lg:block"
          style={{ width: railWidth }}
        >
          <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        </aside>

        {/* Small screens: the same rail as a drawer. Administration is a desktop
            job, so this is a courtesy path, not a second design. */}
        {navOpen && (
          <div className="fixed inset-0 z-[200] lg:hidden">
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={closeNav}
              className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
            />
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("admin.nav.primary")}
              tabIndex={-1}
              className="gt-admin-drawer absolute inset-y-0 left-0 w-[var(--admin-sidebar)]"
            >
              <AdminSidebar collapsed={false} onToggle={closeNav} onNavigate={closeNav} />
            </div>
          </div>
        )}

        <div className="min-h-screen lg:pl-[var(--admin-rail-offset)]">
          <Outlet context={{ openNav: () => setNavOpen(true) } satisfies AdminShellContext} />
        </div>
      </div>
      </AdminCustomersProvider>
      </AdminOrdersProvider>
    </AdminCatalogProvider>
  );
}
