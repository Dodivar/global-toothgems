import { addressMetadata } from "../../_public/metadata";
import { Register } from "../../../src/screens/Register";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/inscription");

export default function Page() {
  return (
    <BrowserOnly>
      <Register />
    </BrowserOnly>
  );
}
