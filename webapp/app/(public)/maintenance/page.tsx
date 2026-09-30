import { addressMetadata } from "../../_public/metadata";
import { MaintenanceScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/maintenance");

export default function Page() {
  return <MaintenanceScreen />;
}
