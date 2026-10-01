import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { RETURNS } from "../../../../src/data/legal/returns";

const page = publicScreen("returns", "en", <LegalDocumentPage doc={RETURNS} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
