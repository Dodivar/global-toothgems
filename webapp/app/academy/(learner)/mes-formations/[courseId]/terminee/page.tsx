import { guardPage, zoneMetadata, type SearchProps } from "../../../../../_zones/zonePage";
import { CourseCompletedScreen } from "../../../../../../src/zones/learn";

type Props = SearchProps & { params: Promise<{ courseId: string }> };

const pathOf = async ({ params }: Props) => `/academy/mes-formations/${(await params).courseId}/terminee`;

export async function generateMetadata(props: Props) {
  return zoneMetadata(await pathOf(props));
}

export default async function Page(props: Props) {
  await guardPage(await pathOf(props), props);
  return <CourseCompletedScreen />;
}
