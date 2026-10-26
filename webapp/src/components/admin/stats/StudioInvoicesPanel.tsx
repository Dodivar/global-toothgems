import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, Printer } from "lucide-react";
import { Button } from "../../ui/Button";
import { EmptyState } from "../EmptyState";
import { StatsPanel } from "./StatsPanel";
import { RowsSkeleton } from "./StatsStates";
import { useFormat } from "../../../lib/format";
import { SHOP_TIME_ZONE } from "../../../data/adminAnalytics";
import { periodInstants, type Period } from "../../../lib/adminAnalyticsMapping";
import { invoiceDocument, invoiceFileName } from "../../../lib/documents/invoiceDocument";
import type { OrderInvoice } from "../../../lib/documents/invoiceModel";
import { useDocumentDownload } from "../../../lib/documents/useDocumentDownload";
import { useDocumentFormat } from "../../../lib/documents/useDocumentFormat";
import { creditedInvoice, fetchStudioDocumentsIssued } from "../../../lib/studioInvoices";
import { isSupabaseConfigured } from "../../../lib/supabase/client";

/**
 * The 3D Studio's legal documents on the Statistics page (decision 115): every
 * FA- invoice and AV- credit note the database issued for the subscriptions in
 * the period, each downloadable as a PDF, all printable as one file (for the
 * accountant). Read from `invoices` (active staff); nothing is recomputed.
 */

type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "error" } | { kind: "ready"; documents: OrderInvoice[] };

export function StudioInvoicesPanel({ period, reloadKey }: { period: Period | null; reloadKey: unknown }) {
  const { t } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const fmt = useDocumentFormat();
  const { status, download, print } = useDocumentDownload();
  const [loaded, setLoaded] = useState<{ key: string; value: State } | null>(null);
  const k = "admin.stats.studioInvoices";
  const key = period ? `${period.from}/${period.to}` : "";

  useEffect(() => {
    if (!period || !isSupabaseConfigured) return;
    let cancelled = false;
    fetchStudioDocumentsIssued(periodInstants(period, SHOP_TIME_ZONE)).then(
      (documents) => {
        if (!cancelled) setLoaded({ key, value: { kind: "ready", documents } });
      },
      () => {
        if (!cancelled) setLoaded({ key, value: { kind: "error" } });
      },
    );
    return () => {
      cancelled = true;
    };
    // `period` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey]);

  const state: State = !isSupabaseConfigured ? { kind: "unavailable" } : loaded && loaded.key === key ? loaded.value : { kind: "loading" };
  const documents = state.kind === "ready" ? state.documents : [];
  const draw = (doc: OrderInvoice) => invoiceDocument(doc, t, fmt, creditedInvoice(documents, doc));

  return (
    <StatsPanel
      title={t(`${k}.title`)}
      description={t(`${k}.description`)}
      icon={FileText}
      collapsible
      defaultOpen={false}
      actions={
        documents.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            iconLeft={Printer}
            disabled={status === "working"}
            onClick={() =>
              void print(async () => ({
                documents: [...documents].reverse().map(draw),
                fileName: `${t(`${k}.fileName`)}-${period?.from ?? ""}-${period?.to ?? ""}.pdf`,
              }))}
          >
            {t(`${k}.printAll`, { count: documents.length })}
          </Button>
        ) : undefined
      }
    >
      {state.kind === "loading" ? (
        <RowsSkeleton rows={3} label={t("admin.stats.loading")} />
      ) : state.kind === "unavailable" ? (
        <EmptyState icon={FileText} title={t(`${k}.unavailableTitle`)} body={t(`${k}.unavailableBody`)} />
      ) : state.kind === "error" ? (
        <EmptyState icon={FileText} title={t(`${k}.errorTitle`)} body={t(`${k}.errorBody`)} />
      ) : documents.length === 0 ? (
        <EmptyState icon={FileText} title={t(`${k}.emptyTitle`)} body={t(`${k}.emptyBody`)} />
      ) : (
        <div className="grid gap-3">
          {status === "error" && (
            <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">{t(`${k}.pdfError`)}</p>
          )}
          <ul className="m-0 grid list-none gap-0 p-0">
            {documents.map((doc) => {
              const kind = t(doc.kind === "creditNote" ? `${k}.creditNote` : `${k}.invoice`);
              return (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
                  <span className="grid gap-0.5">
                    <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      {kind} {doc.number}
                    </span>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {formatDate(doc.issuedAt)} · {doc.buyer.email}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                      {doc.kind === "creditNote" ? "− " : ""}
                      {formatMoney(doc.totalIncl, doc.currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={Download}
                      disabled={status === "working"}
                      aria-label={t(`${k}.downloadLabel`, { kind: kind.toLowerCase(), number: doc.number })}
                      onClick={() => void download(async () => ({ document: draw(doc), fileName: invoiceFileName(doc, t) }))}
                    >
                      PDF
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </StatsPanel>
  );
}
