import { publicScreen } from "../../../_public/publicPage";
import { TermsOfUsePage } from "../../../_public/storePages";

const page = publicScreen("termsOfUse", "en", <TermsOfUsePage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
