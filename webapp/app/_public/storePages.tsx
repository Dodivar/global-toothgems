import { LegalDocumentPage } from "../../src/components/legal/LegalDocumentPage";
import { legalNotice } from "../../src/data/legal/legalNotice";
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
