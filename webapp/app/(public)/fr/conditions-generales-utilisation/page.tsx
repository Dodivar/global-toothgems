import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { TERMS_OF_USE } from "../../../../src/data/legal/termsOfUse";

const page = publicScreen("termsOfUse", "fr", <LegalDocumentPage doc={TERMS_OF_USE} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
