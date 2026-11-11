import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { legalNotice } from "../../src/data/legal/legalNotice";
import { PRIVACY } from "../../src/data/legal/privacy";
import { RETURNS } from "../../src/data/legal/returns";
import { SHIPPING } from "../../src/data/legal/shipping";
import { withShippingGrid } from "../../src/data/legal/shippingGrid";
import { withStoreDetails } from "../../src/data/legal/storeFill";
import { STUDIO_TERMS } from "../../src/data/legal/studioTerms";
import { TERMS } from "../../src/data/legal/terms";
import { TERMS_OF_USE } from "../../src/data/legal/termsOfUse";
import { loadShippingGrid } from "../../src/lib/shippingGridServer";
import { loadStoreDetails } from "../../src/lib/storeDetailsServer";
import { Contact } from "../../src/screens/legal/Contact";

/*
 * The public pages that publish the store's details (Settings › Store): the
 * server reads them (`storeDetailsServer.ts`, cached) and hands them to the
 * screen, so the page is rendered with them and hydrates without a second
 * read. Without them (mock mode, failed read) the screens show what is still
 * to be supplied.
 */

export async function LegalNoticePage() {
  return <LegalDocumentPage doc={legalNotice(await loadStoreDetails())} />;
}

export async function ContactPage() {
  return <Contact store={await loadStoreDetails()} />;
}

export async function TermsPage() {
  return <LegalDocumentPage doc={withStoreDetails(TERMS, await loadStoreDetails())} />;
}

export async function StudioTermsPage() {
  return <LegalDocumentPage doc={withStoreDetails(STUDIO_TERMS, await loadStoreDetails())} />;
}

export async function TermsOfUsePage() {
  return <LegalDocumentPage doc={withStoreDetails(TERMS_OF_USE, await loadStoreDetails())} />;
}

export async function PrivacyPage() {
  return <LegalDocumentPage doc={withStoreDetails(PRIVACY, await loadStoreDetails())} />;
}

export async function ShippingPage() {
  return <LegalDocumentPage doc={withShippingGrid(SHIPPING, await loadShippingGrid())} />;
}

export async function ReturnsPage() {
  return <LegalDocumentPage doc={withStoreDetails(RETURNS, await loadStoreDetails())} />;
}
