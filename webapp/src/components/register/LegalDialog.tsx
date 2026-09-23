import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";

export type LegalDoc = "terms" | "privacy";

/**
 * The terms and the privacy policy, summarised in a dialog.
 *
 * Opening them in place keeps everything typed in the form, which a new page
 * would not. The full legal texts do not exist in this prototype; the dialog
 * says so rather than inventing clauses — legal wording is not ours to draft.
 */
export function LegalDialog({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const { t } = useTranslation();
  const key = doc ?? "terms";
  const points = t(`register.legal.${key}.points`, { returnObjects: true }) as string[];

  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title={t(`register.legal.${key}.title`)}
      description={t("register.legal.summaryNote")}
      icon={key === "terms" ? <FileText size={17} /> : <ShieldCheck size={17} />}
      closeLabel={t("common.close")}
      footer={
        <Button variant="dark" onClick={onClose} className="ml-auto">
          {t("register.legal.back")}
        </Button>
      }
    >
      <ul className="m-0 grid gap-2.5 pl-5 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)]">
        {Array.isArray(points) && points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </Dialog>
  );
}
