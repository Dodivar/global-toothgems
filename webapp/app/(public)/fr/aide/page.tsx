import { publicScreen } from "../../../_public/publicPage";
import { HelpCentre } from "../../../../src/screens/legal/HelpCentre";

const page = publicScreen("help", "fr", <HelpCentre />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
