import { guardPage, zoneMetadata, type SearchProps } from "../../../../../../_zones/zonePage";
import { LessonPlayerScreen } from "../../../../../../../src/zones/learn";

type Props = SearchProps & { params: Promise<{ courseId: string; nodeKey: string }> };

const pathOf = async ({ params }: Props) => {
  const { courseId, nodeKey } = await params;
  return `/academy/mes-formations/${courseId}/lecon/${nodeKey}`;
};

export async function generateMetadata(props: Props) {
  return zoneMetadata(await pathOf(props));
}

export default async function Page(props: Props) {
  await guardPage(await pathOf(props), props);
  return <LessonPlayerScreen />;
}
