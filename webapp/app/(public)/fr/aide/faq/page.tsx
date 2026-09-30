import { publicScreen } from "../../../../_public/publicPage";
import { FaqScreen } from "../../../../../src/zones/public";

const page = publicScreen("faq", "fr", FaqScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
