import { pick, type Localized } from "../../data/types";
import type { TableColumn } from "../../data/legal/types";
import { RichText } from "./RichText";

/**
 * A real `<table>` from the tablet up, a stack of labelled cards below it.
 *
 * A four-column table squeezed into 360px is either unreadable or scrolls
 * sideways under the reader's thumb. Both renderings come from the same rows;
 * the hidden one is `display: none`, so assistive technology meets exactly one.
 */
export function ResponsiveTable({
  caption,
  columns,
  rows,
  lang,
}: {
  caption: string;
  columns: TableColumn[];
  rows: Record<string, Localized>[];
  lang: string;
}) {
  const [first, ...rest] = columns;
  return (
    <figure className="m-0 grid gap-2">
      <table className="hidden w-full border-separate border-spacing-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-left text-[length:var(--text-body-sm)] md:table">
        <caption className="pb-2 text-left text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="border-b border-[var(--border-subtle)] bg-[var(--surface-brand-wash)] px-4 py-3 text-[length:var(--text-caption)] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]"
              >
                {pick(col.label, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {columns.map((col, c) => {
                const Cell = c === 0 ? "th" : "td";
                return (
                  <Cell
                    key={col.key}
                    scope={c === 0 ? "row" : undefined}
                    className={`px-4 py-3.5 leading-[1.6] ${i < rows.length - 1 ? "border-b border-[var(--border-subtle)]" : ""} ${c === 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-body)]"}`}
                  >
                    {row[col.key] ? <RichText text={pick(row[col.key], lang)} /> : "—"}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-3 md:hidden">
        <p className="m-0 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {caption}
        </p>
        <ul className="m-0 grid list-none gap-3 p-0">
          {rows.map((row, i) => (
            <li key={i} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <strong className="block text-[length:var(--text-body-md)] text-[var(--text-primary)]">
                <RichText text={pick(row[first.key], lang)} />
              </strong>
              <dl className="m-0 mt-2 grid gap-2 text-[length:var(--text-body-sm)]">
                {rest.map((col) => (
                  <div key={col.key} className="grid gap-0.5">
                    <dt className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                      {pick(col.label, lang)}
                    </dt>
                    <dd className="m-0 leading-[1.6] text-[var(--text-body)]">
                      {row[col.key] ? <RichText text={pick(row[col.key], lang)} /> : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
