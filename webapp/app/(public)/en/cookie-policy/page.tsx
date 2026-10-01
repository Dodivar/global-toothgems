import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { COOKIE_POLICY } from "../../../../src/data/legal/cookies";

const page = publicScreen("cookies", "en", <LegalDocumentPage doc={COOKIE_POLICY} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
