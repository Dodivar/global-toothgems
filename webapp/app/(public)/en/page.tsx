import { publicScreen } from "../../_public/publicPage";
import { HomeScreen } from "../../../src/zones/public";

const page = publicScreen("home", "en", HomeScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
