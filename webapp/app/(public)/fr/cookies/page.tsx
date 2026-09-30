import { publicScreen } from "../../../_public/publicPage";
import { CookiesScreen } from "../../../../src/zones/public";

const page = publicScreen("cookies", "fr", CookiesScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
