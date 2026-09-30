import { addressMetadata } from "../../_public/metadata";
import { ConfirmAccountScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/confirmation-compte");

export default function Page() {
  return <ConfirmAccountScreen />;
}
