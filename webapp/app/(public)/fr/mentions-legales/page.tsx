import { publicScreen } from "../../../_public/publicPage";
import { LegalNoticePage } from "../../../_public/storePages";

const page = publicScreen("legalNotice", "fr", <LegalNoticePage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
