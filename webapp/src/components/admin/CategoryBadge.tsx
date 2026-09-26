import { useLocalized } from "../../lib/localized";
import type { CategoryId } from "../../data/adminCatalog";
import { useAdminCatalog } from "../../lib/adminCatalog";

/**
 * Category of a product. Neutral by design: the status colours in the same row
 * are the ones that must be noticed, and five coloured category chips would
 * drown them out.
 */
export function CategoryBadge({ id }: { id: CategoryId }) {
  const L = useLocalized();
  const { categoryById } = useAdminCatalog();
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-body)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--gt-blue-400)]" />
      {L(categoryById(id).name)}
    </span>
  );
}
