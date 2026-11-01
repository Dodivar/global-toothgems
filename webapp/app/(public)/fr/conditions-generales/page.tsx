import { publicScreen } from "../../../_public/publicPage";
import { TermsPage } from "../../../_public/storePages";

const page = publicScreen("terms", "fr", <TermsPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
