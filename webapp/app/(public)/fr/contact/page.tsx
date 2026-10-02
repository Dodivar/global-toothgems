import { publicScreen } from "../../../_public/publicPage";
import { ContactPage } from "../../../_public/storePages";

const page = publicScreen("contact", "fr", <ContactPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
