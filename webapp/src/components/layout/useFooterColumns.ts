import { useTranslation } from "react-i18next";
import { courseHref } from "../../lib/academyUrl";
import { useToast } from "../../lib/toast";
import { useCookieConsent } from "../../lib/cookieConsent";
import { contactHref, LEGAL_PATHS } from "../../data/legal/routes";

/**
 * The footer's link columns, shared by `Footer` and `FooterEditorial` so the
 * two art directions can never disagree on where a link goes.
 *
 * An item either navigates (`to`) or acts (`action`): "Cookie settings" opens
 * the preferences dialog rather than a page, and the two entries this
 * prototype has no screen for (gift cards, the artist directory) still say so
 * instead of pretending to be links.
 */
export interface FooterItem {
  label: string;
  to?: string;
  action?: () => void;
}

export interface FooterColumn {
  id: string;
  heading: string;
  items: FooterItem[];
}

/* Destinations, positionally matched to the translated label lists so the
   routes stay correct in both languages. `null` marks an item this prototype
   does not have a screen for. */
const SHOP_TARGETS: (string | null)[] = [
  "/boutique?categorie=Gems",
  "/boutique?categorie=Outils",
  "/boutique?categorie=Kits",
  "/boutique?categorie=Suivi",
  null,
  "/fidelite",
];
/* The first three entries name the three courses, so they lead to each
   training's own page; "Certification" is a theme, not a course, and stays on
   the catalogue. */
const ACADEMY_TARGETS: (string | null)[] = [courseHref("fondation"), courseHref("avance"), courseHref("business"), "/academy"];

export function useFooterColumns(): FooterColumn[] {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { openSettings } = useCookieConsent();

  const notIncluded = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");
  const fromList = (key: string, targets: (string | null)[]): FooterItem[] =>
    (t(key, { returnObjects: true }) as string[]).map((label, i) => {
      const to = targets[i];
      return to ? { label, to } : { label, action: notIncluded };
    });

  return [
    { id: "shop", heading: t("footer.colShop"), items: fromList("footer.shopItems", SHOP_TARGETS) },
    { id: "academy", heading: t("footer.colAcademy"), items: fromList("footer.academyItems", ACADEMY_TARGETS) },
    {
      id: "service",
      heading: t("footer.colService"),
      items: [
        { label: t("legal.pages.faq"), to: LEGAL_PATHS.faq },
        { label: t("legal.pages.shipping"), to: LEGAL_PATHS.shipping },
        { label: t("legal.pages.returns"), to: LEGAL_PATHS.returns },
        { label: t("legal.pages.contact"), to: LEGAL_PATHS.contact },
      ],
    },
    {
      id: "legal",
      heading: t("footer.colLegal"),
      items: [
        { label: t("legal.pages.legalNotice"), to: LEGAL_PATHS.legalNotice },
        { label: t("legal.pages.terms"), to: LEGAL_PATHS.terms },
        { label: t("legal.pages.privacy"), to: LEGAL_PATHS.privacy },
        { label: t("legal.pages.cookies"), to: LEGAL_PATHS.cookies },
        { label: t("legal.cookies.settingsLink"), action: openSettings },
      ],
    },
    {
      id: "company",
      heading: t("footer.colCompany"),
      items: [
        { label: t("footer.company.about"), to: LEGAL_PATHS.about },
        { label: t("footer.company.training"), to: "/academy" },
        { label: t("footer.company.pro"), to: contactHref("professional") },
        { label: t("footer.company.findArtist"), action: notIncluded },
      ],
    },
  ];
}
