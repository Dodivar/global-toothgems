"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WithdrawalPanel } from "../withdrawal/WithdrawalPanel";
import { declareAsMember, fetchWithdrawalOptions, findOrderId, withdrawalAvailable } from "../../lib/orderWithdrawal";
import type { WithdrawalOptions } from "../../lib/orderWithdrawalMapping";

/**
 * The withdrawal function on the member's order page (decision 131): shown
 * for the whole period while goods can still be withdrawn, and afterwards as
 * long as a withdrawal was declared (its state). Orders with nothing to
 * withdraw (a course, a gift card) show nothing.
 */
export function OrderWithdrawal({ reference, defaultName }: { reference: string; defaultName?: string }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<WithdrawalOptions | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const id = await findOrderId(reference);
      setOptions(id ? await fetchWithdrawalOptions(id) : null);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [reference]);

  useEffect(() => {
    if (!withdrawalAvailable()) return;
    void load();
  }, [load]);

  if (failed) {
    return (
      <p role="alert" className="gt-no-print m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
        {t("withdrawal.loadError")}
      </p>
    );
  }
  if (!options) return null;
  const relevant =
    options.withdrawals.length > 0 || options.lines.some((l) => !l.excluded) || options.open;
  if (!relevant) return null;

  return (
    <WithdrawalPanel
      options={options}
      defaultName={defaultName}
      onDeclare={(declaration) => declareAsMember(options.orderId, declaration)}
      onDeclared={() => void load()}
    />
  );
}
