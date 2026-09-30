import { addressMetadata } from "../../_public/metadata";
import { ServerError } from "../../../src/screens/ServerError";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/erreur");

export default function Page() {
  return (
    <BrowserOnly>
      <ServerError />
    </BrowserOnly>
  );
}
