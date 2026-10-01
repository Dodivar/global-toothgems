import type { TFunction } from "i18next";
import { TrainingError } from "../../../lib/adminTrainingBackend";

/**
 * A failed course write → the toast the back office shows. Database details
 * never reach the screen; a refused publication lists what is missing.
 */
export function trainingErrorMessage(t: TFunction, error: unknown): { title: string; body: string } {
  const kind = error instanceof TrainingError ? error.kind : "network";
  const codes = error instanceof TrainingError ? error.codes : [];
  const body =
    kind === "notReady" && codes.length > 0
      ? codes.map((code) => t(`admin.training.errors.ready.${code}`, { defaultValue: code })).join(" · ")
      : t(`admin.training.errors.${kind}`);
  return { title: t("admin.training.errors.title"), body };
}
