import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

export interface AdminOption {
  value: string;
  label: string;
}

/**
 * Native `<select>` with the admin's field geometry. Native on purpose: it
 * gives keyboard support, type-ahead and the platform's own picker on touch for
 * free, which a custom listbox would have to re-earn.
 */
interface AdminSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: AdminOption[];
}

export function AdminSelect({ options, className, ...rest }: AdminSelectProps) {
  return (
    <span className="relative block">
      <select className={clsx("gt-admin-field appearance-none pr-9", className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
    </span>
  );
}
