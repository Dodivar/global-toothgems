import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Copy,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "./EmptyState";
import { useLocalized } from "../../lib/localized";
import { formatDateShort } from "../../lib/format";
import type { ActivityEntry, ActivityKind } from "../../data/adminCatalog";

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  created: Plus,
  updated: Pencil,
  archived: Archive,
  restored: ArchiveRestore,
  status: RefreshCcw,
  stock: PackageSearch,
  deleted: Trash2,
  duplicated: Copy,
};

/**
 * Recent changes to the catalogue.
 *
 * Not analytics — a log. It answers "what happened here since I last looked",
 * which on a catalogue managed by more than one person is the question that
 * actually gets asked.
 */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const { t } = useTranslation();
  const L = useLocalized();

  if (entries.length === 0) {
    return (
      <EmptyState icon={RefreshCcw} title={t("admin.activity.emptyTitle")} body={t("admin.activity.emptyBody")} />
    );
  }

  return (
    <ul className="m-0 grid list-none gap-0 p-0">
      {entries.map((item) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]"
            >
              <Icon size={13} strokeWidth={1.9} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                {/* The product name is a link: reading that something changed
                    and being unable to go look at it is a dead end. */}
                <Link
                  to={item.kind === "deleted" ? "/admin/produits" : `/admin/produits/${item.productId}`}
                  className="font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-2 transition-colors hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {L(item.productName)}
                </Link>{" "}
                {t(`admin.activity.kind.${item.kind}`)}
              </span>
              {item.detail && (
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{L(item.detail)}</span>
              )}
            </span>
            <span className="flex-none whitespace-nowrap text-[length:var(--text-caption)] text-[var(--text-subtle)]">
              {formatDateShort(item.at)} · {item.actor}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
