import { guardPage, zoneMetadata, type SearchProps } from "../../../_zones/zonePage";
import { ResumeTrainingScreen } from "../../../../src/zones/learn";

const PATH = "/academy/lecon";

export const metadata = zoneMetadata(PATH);

export default async function Page(props: SearchProps) {
  await guardPage(PATH, props);
  return <ResumeTrainingScreen />;
}
