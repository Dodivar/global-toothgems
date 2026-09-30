import { publicScreen } from "../../../_public/publicPage";
import { About } from "../../../../src/screens/legal/About";

const page = publicScreen("about", "en", <About />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
