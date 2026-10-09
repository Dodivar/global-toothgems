import { describe, expect, it } from "vitest";
import { staleFiles } from "../../../scripts/sync-documents.mjs";

describe("documents shared with the Edge Functions", () => {
  it("are copied to supabase/functions/_shared/documents (run `npm run sync:documents`)", () => {
    expect(staleFiles()).toEqual([]);
  });
});
