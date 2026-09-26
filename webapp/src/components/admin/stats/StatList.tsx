/**
 * The supporting figures of a section, as a definition list.
 *
 * Deliberately not more cards: the KPI row at the top of the page is where the
 * headline numbers live, and repeating that treatment inside every section
 * would leave the page with thirty cards and no hierarchy.
 */
export function StatList({
  items,
  columns = 2,
}: {
  items: { id: string; label: string; value: string; hint?: string }[];
  columns?: 2 | 3;
}) {
  return (
    <dl
      className={`m-0 grid gap-x-5 gap-y-3 ${
        columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
      }`}
    >
      {items.map((item) => (
        <div key={item.id} className="grid gap-0.5">
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{item.label}</dt>
          <dd className="m-0 text-[length:var(--text-h4)] font-semibold leading-tight tabular-nums text-[var(--text-primary)]">
            {item.value}
          </dd>
          {item.hint && <dd className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
