import { publicScreen } from "../../../_public/publicPage";
import { PrivacyScreen } from "../../../../src/zones/public";

const page = publicScreen("privacy", "en", PrivacyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
