import { publicScreen } from "../../../_public/publicPage";
import { HelpCentre } from "../../../../src/screens/legal/HelpCentre";

const page = publicScreen("help", "en", <HelpCentre />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
