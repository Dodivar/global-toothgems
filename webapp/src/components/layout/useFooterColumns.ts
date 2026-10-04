import { useTranslation } from "react-i18next";
import { pick } from "../../data/types";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { courseSlug } from "../../lib/academy/publicCourse";
import { courseHref } from "../../lib/academyUrl";
import { useToast } from "../../lib/toast";
import { useCookieConsent } from "../../lib/cookieConsent";
import { contactHref, LEGAL_PATHS } from "../../data/legal/routes";
import { shopHref } from "../../data/taxonomy";

/**
 * The footer's link columns, used by `Footer`.
 *
 * An item either navigates (`to`) or acts (`action`): "Cookie settings" opens
 * the preferences dialog rather than a page, and the one entry this
 * prototype has no screen for (the artist directory) still says so instead
 * of pretending to be a link.
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
  shopHref("gems"),
  shopHref("materiel"),
  shopHref("kits"),
  shopHref("lip-gloss"),
  "/carte-cadeau",
  "/fidelite",
];
/** How many published courses the Academy column names before "all courses". */
const FOOTER_COURSES = 3;

export function useFooterColumns(): FooterColumn[] {
  const { t, i18n } = useTranslation();
  const { courses } = useAcademy();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en" : "fr";
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
    {
      id: "academy",
      heading: t("footer.colAcademy"),
      // The first published courses, each to its own page, then the catalogue.
      items: [
        ...courses.slice(0, FOOTER_COURSES).map((course) => ({ label: pick(course.title, lang), to: courseHref(courseSlug(course, locale)) })),
        { label: t("footer.academyAll"), to: "/academy" },
      ],
    },
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
        { label: t("legal.pages.termsOfUse"), to: LEGAL_PATHS.termsOfUse },
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
