import { addressMetadata } from "../../../_public/metadata";
import { RemindersUnsubscribe } from "../../../../src/screens/RemindersUnsubscribe";
import { BrowserOnly } from "../../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/rappels/desinscription");

export default function Page() {
  return (
    <BrowserOnly>
      <RemindersUnsubscribe />
    </BrowserOnly>
  );
}
