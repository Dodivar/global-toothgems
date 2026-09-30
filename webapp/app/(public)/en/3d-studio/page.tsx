import { publicScreen } from "../../../_public/publicPage";
import { Studio } from "../../../../src/screens/Studio";

const page = publicScreen("studio", "en", <Studio />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
