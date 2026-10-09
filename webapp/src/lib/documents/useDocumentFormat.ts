import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import type { InvoiceFormat } from "./invoiceDocument";

/** A country's name in a locale, else its ISO code. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

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
