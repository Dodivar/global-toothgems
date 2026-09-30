// `npm run dev`: the Next.js dev server on port 5173, the port the app used
// under Vite and the one the Supabase Auth redirect allow-list knows for local
// development. `PORT` still wins, so a second checkout can be served beside
// the first. `--mock` (npm run dev:mock) empties the Supabase variables, which
// take precedence over `.env.local`, so the app runs on its mock data.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const mock = args.includes("--mock");
const env = { ...process.env, PORT: process.env.PORT || "5173" };
if (mock) {
  env.NEXT_PUBLIC_SUPABASE_URL = "";
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
}

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...args.filter((a) => a !== "--mock")], { stdio: "inherit", env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
