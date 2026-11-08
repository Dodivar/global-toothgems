import { publicScreen } from "../../../_public/publicPage";
import { PrivacyPage } from "../../../_public/storePages";

const page = publicScreen("privacy", "fr", <PrivacyPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
