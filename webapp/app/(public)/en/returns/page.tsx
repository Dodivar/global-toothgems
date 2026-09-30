import { publicScreen } from "../../../_public/publicPage";
import { ReturnsScreen } from "../../../../src/zones/public";

const page = publicScreen("returns", "en", ReturnsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
