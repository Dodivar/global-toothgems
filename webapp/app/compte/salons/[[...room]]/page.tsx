import { zoneScreen } from "../../../_zones/zonePage";

/**
 * One address per room of the Members' Lounge (`src/lib/communityChat/loungeRoutes.ts`).
 * The lounge itself is the section's layout, so moving between channels keeps
 * it on screen; this page only checks the session with its own address.
 */
const page = zoneScreen(({ room }) => (room ? `/compte/salons/${room}` : "/compte/salons"), null);
export const generateMetadata = page.generateMetadata;
export default page.Page;
