import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { useCatalog } from "../../lib/catalog/CatalogProvider";

/**
 * Shown when the catalogue could not be loaded. Says what happened in the
 * customer's words — no provider error, no status code — and offers a retry.
 */
export function CatalogError() {
  const { t } = useTranslation();
  const { reload } = useCatalog();

  return (
    <div role="alert" className="grid justify-items-center gap-4 py-16 text-center">
      <h2 className="m-0 text-[length:var(--text-h4)]">{t("catalog.errorTitle")}</h2>
      <p className="m-0 max-w-[48ch] text-sm text-[var(--text-muted)]">{t("catalog.errorBody")}</p>
      <Button variant="outline" iconLeft={RefreshCw} onClick={reload}>
        {t("catalog.retry")}
      </Button>
    </div>
  );
}
