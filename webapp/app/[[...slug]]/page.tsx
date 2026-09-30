import { ClientOnly } from "./client";

/**
 * Every address of the site, during the migration: the React Router app
 * decides what to show (docs/migration-nextjs.md, phase 1). Only `/` is
 * prerendered; the other paths are rendered on demand by this same page.
 */
export function generateStaticParams() {
  return [{ slug: [""] }];
}

export default function Page() {
  return <ClientOnly />;
}
