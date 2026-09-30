import { publicScreen } from "../../../_public/publicPage";
import { Contact } from "../../../../src/screens/legal/Contact";

const page = publicScreen("contact", "fr", <Contact />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
