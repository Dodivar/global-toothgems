import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import clsx from "clsx";
import { pick } from "../../data/types";
import type { Block, CalloutTone } from "../../data/legal/types";
import { ICONS, TONES } from "./tones";
import { Placeholder, RichText } from "./RichText";
import { ReviewNote } from "./ReviewNote";
import { ResponsiveTable } from "./ResponsiveTable";
import { StepFlow } from "./StepFlow";
import { CookieChoicesPanel } from "./CookieChoicesPanel";

export function ToneLabel({ tone, className }: { tone: CalloutTone; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, fg } = TONES[tone];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.12em]", fg, className)}>
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {t(`legal.tone.${tone}`)}
    </span>
  );
}

function BlockView({ block, lang }: { block: Block; lang: string }) {
  const { t } = useTranslation();
  const L = (v: Parameters<typeof pick>[0]) => pick(v, lang);

  switch (block.kind) {
    case "p":
      return (
        <p className="m-0">
          <RichText text={L(block.text)} />
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={clsx("m-0 grid gap-2 pl-5", block.ordered ? "list-decimal" : "list-disc marker:text-[var(--gt-blue-500)]")}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <RichText text={L(item)} />
            </li>
          ))}
        </Tag>
      );
    }

    case "callout": {
      const tone = TONES[block.tone];
      return (
        <aside
          aria-label={t(`legal.tone.${block.tone}`)}
          className={clsx(
            "relative grid gap-2 overflow-hidden rounded-[var(--radius-md)] border py-4 pl-5 pr-4 text-[length:var(--text-body-sm)] leading-[1.65] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
            tone.box,
          )}
        >
          <ToneLabel tone={block.tone} />
          {block.title && <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{L(block.title)}</strong>}
          <p className="m-0 text-[var(--text-body)]">
            <RichText text={L(block.text)} />
          </p>
          {block.items && (
            <ul className="m-0 grid gap-1.5 pl-5 text-[var(--text-body)]">
              {block.items.map((item, i) => (
                <li key={i}>
                  <RichText text={L(item)} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      );
    }

    case "fields":
      return (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-brand-wash)] px-5 py-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.12em] text-[var(--gt-blue-700)]">
              <Building2 size={14} aria-hidden="true" />
              {t("legal.fields.heading")}
            </span>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("legal.fields.editable")}</span>
          </div>
          <dl className="m-0 divide-y divide-[var(--border-subtle)]">
            {block.fields.map((field, i) => (
              <div key={i} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-6">
                <dt className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{L(field.label)}</dt>
                <dd className="m-0 grid gap-1 text-[length:var(--text-body-sm)]">
                  <span>
                    {field.value ? (
                      <RichText text={L(field.value)} />
                    ) : (
                      <Placeholder business label={field.placeholder ? L(field.placeholder) : L(field.label)} />
                    )}
                  </span>
                  {field.hint && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{L(field.hint)}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "table":
      return <ResponsiveTable caption={L(block.caption)} columns={block.columns} rows={block.rows} lang={lang} />;

    case "cards":
      return (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {block.items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={i} className="grid content-start gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                    <Icon size={17} />
                  </span>
                  <strong className="text-[length:var(--text-body-md)] leading-[1.3] text-[var(--text-primary)]">{L(item.title)}</strong>
                </span>
                <p className="m-0 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)]">
                  <RichText text={L(item.text)} />
                </p>
              </li>
            );
          })}
        </ul>
      );

    case "steps":
      return <StepFlow label={L(block.label)} steps={block.items.map((s) => ({ icon: ICONS[s.icon], title: L(s.title), text: L(s.text) }))} />;

    case "internal":
      return (
        <ReviewNote>
          <RichText text={L(block.text)} />
        </ReviewNote>
      );

    case "widget":
      return <CookieChoicesPanel />;
  }
}

export function ContentBlocks({ blocks }: { blocks: Block[] }) {
  const { i18n } = useTranslation();
  return (
    <div className="grid gap-5">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} lang={i18n.language} />
      ))}
    </div>
  );
}
