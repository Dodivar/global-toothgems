import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { countryName } from "../countryName";
import type { InvoiceFormat } from "./invoiceDocument";

/** How the documents format money, dates, countries and VAT rates: in the page's language. */
export function useDocumentFormat(): InvoiceFormat {
  const { i18n } = useTranslation();
  const { formatDate, formatMoney, locale } = useFormat();
  return useMemo(() => {
    const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 });
    return {
      lang: i18n.language.startsWith("en") ? "en" : "fr",
      money: (minor: number, currency: string) => formatMoney(minor, currency),
      date: (iso: string) => formatDate(iso),
      country: (code: string) => countryName(code, locale),
      percent: (basisPoints: number) => percent.format(basisPoints / 10000),
    };
  }, [i18n.language, formatDate, formatMoney, locale]);
}
