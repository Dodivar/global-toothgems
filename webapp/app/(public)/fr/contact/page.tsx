import { publicScreen } from "../../../_public/publicPage";
import { ContactScreen } from "../../../../src/zones/public";

const page = publicScreen("contact", "fr", ContactScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
