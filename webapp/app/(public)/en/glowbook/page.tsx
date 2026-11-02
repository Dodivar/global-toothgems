import { publicScreen } from "../../../_public/publicPage";
import { GlowbookIntro } from "../../../../src/screens/GlowbookIntro";

const page = publicScreen("glowbookIntro", "en", <GlowbookIntro />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
