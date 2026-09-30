import { publicScreen } from "../../../_public/publicPage";
import { ShapesScreen } from "../../../../src/zones/public";

const page = publicScreen("shapes", "en", ShapesScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
