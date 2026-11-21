"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ImagePlus } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { StudioPageImage } from "../StudioPageImage";
import { TRY_ON_EXAMPLES, type TryOnExample } from "./tryOnExamples";

/** The owner's try-on examples (`tryOnExamples.ts`), compared photo / render; a notice until there are some. */

export function TryOnShowcase({ examples = TRY_ON_EXAMPLES }: { examples?: readonly TryOnExample[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const k = "atelierPage.tryOn";

  if (!examples.length) {
    return (
      <div className="grid aspect-[4/3] w-full place-content-center justify-items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-6 text-center">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
          <ImagePlus size={22} />
        </span>
        <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t(`${k}.pending.title`)}</p>
        <p className="m-0 max-w-[42ch] text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`${k}.pending.body`)}</p>
      </div>
    );
  }

  const current = examples[Math.min(index, examples.length - 1)];
  const name = t(`${k}.compare.example`, { n: index + 1 });

  return (
    <figure className="m-0 grid gap-3">
      <div className="relative">
        <BeforeAfterSlider
          key={current.id}
          before={current.photo}
          after={current.render}
          label={t(`${k}.compare.label`, { name })}
          beforeLabel={t(`${k}.compare.before`)}
          afterLabel={t(`${k}.compare.after`)}
          beforeAlt={t(`${k}.compare.beforeAlt`, { name })}
          afterAlt={t(`${k}.compare.afterAlt`, { name })}
        />
        {current.creation && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 w-[30%] min-w-[96px] max-w-[180px] overflow-hidden rounded-[var(--radius-md)] border-2 border-white bg-white shadow-[var(--shadow-md)]">
            <StudioPageImage still={current.creation} alt={t(`${k}.compare.creationAlt`, { name })} sizes="180px" />
            <span className="block px-2 py-1 text-[10.5px] font-semibold leading-tight text-[var(--text-muted)]">{t(`${k}.compare.creation`)}</span>
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <span>{t(`${k}.compare.hint`)}</span>
        {examples.length > 1 && (
          <span role="group" aria-label={t(`${k}.compare.examples`)} className="inline-flex flex-wrap gap-1.5">
            {examples.map((example, i) => (
              <button
                key={example.id}
                type="button"
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={clsx(
                  "min-h-9 rounded-[var(--radius-pill)] border px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                  i === index
                    ? "border-[var(--surface-inverse)] bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--gt-blue-50)]",
                )}
              >
                {t(`${k}.compare.example`, { n: i + 1 })}
              </button>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
