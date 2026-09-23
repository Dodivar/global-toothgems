import { useTranslation } from "react-i18next";
import { pick } from "../../data/types";
import type { LegalDocument } from "../../data/legal/types";
import { ContentBlocks } from "./ContentBlocks";
import { LegalLayout, LegalSectionFrame } from "./LegalLayout";
import { RichText } from "./RichText";

/** Renders a `LegalDocument` from `data/legal/` inside the shared layout. */
export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  const { i18n } = useTranslation();
  const L = (v: Parameters<typeof pick>[0]) => pick(v, i18n.language);

  // A group label is shown where a group starts, not on every section in it.
  const partAt = (i: number) => {
    const part = doc.sections[i].part;
    return part && (i === 0 || doc.sections[i - 1].part !== part) ? L(part) : undefined;
  };
  const toc = doc.sections.map((s, i) => ({ id: s.id, label: L(s.title), part: partAt(i) }));

  return (
    <LegalLayout
      eyebrow={L(doc.eyebrow)}
      title={L(doc.title)}
      intro={<RichText text={L(doc.intro)} />}
      updated={doc.updated}
      toc={toc}
      numbered={doc.numbered}
      showKey={doc.showKey}
      contactCategory={doc.contactCategory}
    >
      {doc.lead && (
        <div className="gt-legal-prose grid gap-4">
          <ContentBlocks blocks={doc.lead} />
        </div>
      )}
      <div className="grid gap-10">
        {doc.sections.map((section, i) => (
          <LegalSectionFrame
            key={section.id}
            id={section.id}
            number={doc.numbered ? i + 1 : undefined}
            title={L(section.title)}
            part={partAt(i)}
          >
            <ContentBlocks blocks={section.blocks} />
          </LegalSectionFrame>
        ))}
      </div>
    </LegalLayout>
  );
}
