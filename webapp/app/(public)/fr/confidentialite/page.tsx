import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { PRIVACY } from "../../../../src/data/legal/privacy";

const page = publicScreen("privacy", "fr", <LegalDocumentPage doc={PRIVACY} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
