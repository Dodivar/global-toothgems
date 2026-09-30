import { publicScreen } from "../../../_public/publicPage";
import { LegalDocumentPage } from "../../../../src/components/legal/LegalDocumentPage";
import { SHIPPING } from "../../../../src/data/legal/shipping";

const page = publicScreen("shipping", "fr", <LegalDocumentPage doc={SHIPPING} />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
