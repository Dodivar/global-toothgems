import { publicScreen } from "../../_public/publicPage";
import { HomeAlt } from "../../../src/screens/HomeAlt";

const page = publicScreen("home", "fr", <HomeAlt />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
