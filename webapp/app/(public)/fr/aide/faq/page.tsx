import { publicScreen } from "../../../../_public/publicPage";
import { Faq } from "../../../../../src/screens/legal/Faq";

const page = publicScreen("faq", "fr", <Faq />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
