import { Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { rememberPhoneNotice } from "../../../lib/studioWorkspace/phoneNotice";

/**
 * Opening the 3D Studio on a phone: the experience is degraded there, a tablet
 * or a computer is strongly advised. Informative only — it never blocks, and
 * the work is kept in the account either way. Shown once per browser session
 * (`lib/studioWorkspace/phoneNotice.ts`), before the first-visit welcome.
 */
export function PhoneNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const done = () => {
    rememberPhoneNotice();
    onClose();
  };
  return (
    <Dialog
      open
      onClose={done}
      title={t("studio.workspace.phoneNotice.title")}
      icon={<Smartphone size={17} />}
      closeLabel={t("studio.workspace.phoneNotice.close")}
      footer={
        <Button variant="primary" size="sm" className="ml-auto" onClick={done}>
          {t("studio.workspace.phoneNotice.continue")}
        </Button>
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">{t("studio.workspace.phoneNotice.body")}</p>
        <p className="m-0 text-[12.5px] leading-snug text-[var(--text-muted)]">{t("studio.workspace.phoneNotice.hint")}</p>
      </div>
    </Dialog>
  );
}
