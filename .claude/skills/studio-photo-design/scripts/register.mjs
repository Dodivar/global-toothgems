// Lets plain `node` (22.15+, TypeScript type stripping) run the Studio's own
// modules from webapp/src: adds the `.ts` extension the app's imports leave
// out, and finds `three` (and `sharp`, for the photo grid) in webapp/node_modules — the worktree's, else the
// main checkout's (a desktop-app worktree often has none).
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function nodeModulesBase() {
  const local = join(repo, "webapp", "node_modules");
  if (existsSync(join(local, "three"))) return local;
  try {
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", { cwd: repo }).toString().trim();
    const main = join(dirname(common), "webapp", "node_modules");
    if (existsSync(join(main, "three"))) return main;
  } catch {
    /* not a git checkout */
  }
  throw new Error("three.js not found: run `npm ci` in webapp/ (this worktree or the main checkout).");
}

let base = null;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const target = fileURLToPath(new URL(specifier, context.parentURL));
      if (!/\.[cm]?[jt]s$/.test(target)) {
        for (const candidate of [`${target}.ts`, join(target, "index.ts")])
          if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    if (specifier === "three" || specifier.startsWith("three/") || specifier === "sharp") {
      base ??= nodeModulesBase();
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(base, "_resolve.js")).href });
    }
    return nextResolve(specifier, context);
  },
});
