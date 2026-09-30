import { publicScreen } from "../../../_public/publicPage";
import { LegalNoticeScreen } from "../../../../src/zones/public";

const page = publicScreen("legalNotice", "en", LegalNoticeScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
