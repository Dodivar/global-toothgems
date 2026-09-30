import { publicScreen } from "../../../_public/publicPage";
import { TermsScreen } from "../../../../src/zones/public";

const page = publicScreen("terms", "fr", TermsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
