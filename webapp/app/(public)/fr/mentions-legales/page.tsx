import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { LEGAL_NOTICE } from "../../../../src/data/legal/legalNotice";

const page = publicScreen("legalNotice", "fr", <LegalDocumentPage doc={LEGAL_NOTICE} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
