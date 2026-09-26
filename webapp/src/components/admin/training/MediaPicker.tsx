import { useTranslation } from "react-i18next";
import { Check, ImagePlus } from "lucide-react";
import clsx from "clsx";
import { MEDIA_LIBRARY } from "../../../data/adminTraining";
import { useLocalized } from "../../../lib/localized";

/**
 * Picks an image from the studio library.
 *
 * A grid of real photographs rather than an upload field: the prototype has no
 * storage behind it, and a file input that silently discards the chosen file
 * would be a worse lie than a library that plainly is one. The upload path
 * replaces this component rather than being faked inside it.
 *
 * Radios, not buttons: exactly one image is selected at a time, which is what
 * the radio role says and what arrow-key navigation then gives for free.
 */
export function MediaPicker({
  value,
  onChange,
  label,
  hint,
  columns = 4,
}: {
  value: string;
  onChange: (src: string) => void;
  label: string;
  hint?: string;
  columns?: 3 | 4;
}) {
  const { t } = useTranslation();
  const L = useLocalized();

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </legend>
      {hint && <p className="m-0 -mt-1 mb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}

      <div
        className={clsx(
          "grid gap-2",
          columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
        )}
      >
        {MEDIA_LIBRARY.map((item) => {
          const selected = item.src === value;
          return (
            <label
              key={item.id}
              className={clsx(
                "group relative block cursor-pointer overflow-hidden rounded-[var(--admin-radius-sm)] border-2 transition-colors",
                "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
                selected ? "border-[var(--gt-emerald-500)]" : "border-transparent hover:border-[var(--gt-ink-400)]",
              )}
            >
              <input
                type="radio"
                name={`media-${label}`}
                checked={selected}
                onChange={() => onChange(item.src)}
                className="sr-only"
              />
              <img
                src={item.src}
                alt={L(item.label)}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--gt-emerald-500)] text-[var(--gt-white)] shadow-[var(--shadow-xs)]"
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              {/* The name is what a screen reader reads; sighted users get it on
                  hover, where it would otherwise crowd a 12-image grid. */}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-[rgba(17,17,17,.72)] px-2 py-1 text-[10px] font-medium text-[var(--gt-white)] opacity-0 transition-opacity group-hover:opacity-100">
                {L(item.label)}
              </span>
            </label>
          );
        })}
      </div>

      <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
        <ImagePlus size={12} strokeWidth={2} aria-hidden="true" />
        {t("admin.training.blocks.imageLibrary")}
      </p>
    </fieldset>
  );
}
