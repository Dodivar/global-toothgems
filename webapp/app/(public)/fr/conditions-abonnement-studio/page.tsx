import { publicScreen } from "../../../_public/publicPage";
import { StudioTermsPage } from "../../../_public/storePages";

const page = publicScreen("studioTerms", "fr", <StudioTermsPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
