import { publicScreen } from "../../../_public/publicPage";
import { TermsOfUsePage } from "../../../_public/storePages";

const page = publicScreen("termsOfUse", "fr", <TermsOfUsePage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
