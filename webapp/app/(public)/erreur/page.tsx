import { addressMetadata } from "../../_public/metadata";
import { ServerErrorScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/erreur");

export default function Page() {
  return <ServerErrorScreen />;
}
