import { publicScreen } from "../../../_public/publicPage";
import { Loyalty } from "../../../../src/screens/Loyalty";

const page = publicScreen("loyalty", "en", <Loyalty />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
