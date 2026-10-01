import { publicScreen } from "../../../_public/publicPage";
import { GiftCard } from "../../../../src/screens/GiftCard";

const page = publicScreen("giftCard", "en", <GiftCard />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
