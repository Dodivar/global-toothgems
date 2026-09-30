import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { TERMS } from "../../../../src/data/legal/terms";

const page = publicScreen("terms", "fr", <LegalDocumentPage doc={TERMS} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
