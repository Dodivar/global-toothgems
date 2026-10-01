import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gateFor } from "./authRoutes";

/*
 * The private zones' App Router segments (docs/migration-nextjs.md, phases
 * 4–5): every page the proxy gates is also checked where it is rendered — its
 * layout turns signed-out visitors away, and the page checks again with its
 * own address (`app/_zones`). Navigation, not authorization: RLS decides.
 */
const APP = fileURLToPath(new URL("../../app", import.meta.url));

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** The address a page file serves, route groups left out, parameters filled. */
const addressOf = (file: string) =>
  "/" +
  file
    .slice(APP.length + 1, -"/page.tsx".length)
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[+\.*(\w+)\]+$/, "x"))
    .join("/");

describe("private zone segments", () => {
  const all = pages(APP).map((file) => ({ file, address: addressOf(file) }));
  const gated = all.filter(({ address }) => gateFor(address) !== null);

  it("finds the member space, learner pages and back office", () => {
    expect(gated.length).toBeGreaterThan(40);
    for (const prefix of ["/compte", "/academy/lecon", "/academy/mes-formations/x", "/admin"]) {
      expect(gated.some(({ address }) => address === prefix || address.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
  });

  it("checks the session in every gated page", () => {
    for (const { file, address } of gated) expect(readFileSync(file, "utf8"), address).toMatch(/zoneScreen\(/);
  });

  it("checks the session in the layouts above them", () => {
    for (const layout of ["compte/layout.tsx", "academy/(learner)/layout.tsx", "admin/(staff)/layout.tsx"]) {
      expect(readFileSync(join(APP, layout), "utf8"), layout).toMatch(/await guardRequest\(/);
    }
  });
});
