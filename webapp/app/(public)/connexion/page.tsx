import { addressMetadata } from "../../_public/metadata";
import { Login } from "../../../src/screens/Login";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/connexion");

export default function Page() {
  return (
    <BrowserOnly>
      <Login />
    </BrowserOnly>
  );
}
