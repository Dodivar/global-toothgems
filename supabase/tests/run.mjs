#!/usr/bin/env node
// Runs the `*_validation.sql` suites against a LOCAL Supabase database (the
// stack `supabase start` brings up: every migration + seed.sql) and fails
// unless each one ends on its own success marker.
//
//   node supabase/tests/run.mjs                 every suite
//   node supabase/tests/run.mjs mvp lounge      the named ones (file name without `_validation.sql`)
//
// Each suite is ONE transaction that always rolls back by raising an
// exception: `ALL … TESTS PASSED` on success, `FAIL: …` on the first broken
// assertion. psql therefore exits non-zero either way, so the verdict is read
// from its output: a suite passes only when the error psql reports is that
// marker. A suite with no marker (syntax error, missing function, a migration
// that did not apply) fails. The file is also sent after an explicit `begin;`
// and the session closes without a commit, so nothing it does can persist.
//
// Where psql runs:
//   - default: inside the stack's database container (`docker exec`), so no
//     local psql is needed. SUPABASE_DB_CONTAINER overrides the name.
//   - DATABASE_URL: a local psql against that URL. Only localhost/127.0.0.1
//     are accepted: these suites create users and orders, never on a real project.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CONTAINER = process.env.SUPABASE_DB_CONTAINER || "supabase_db_global-toothgems";
const DATABASE_URL = process.env.DATABASE_URL;
const PASSED = /ERROR:\s+(ALL [^\n]*TESTS PASSED[^\n]*)/;

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

if (DATABASE_URL) {
  const host = new URL(DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    fail(`DATABASE_URL points at ${host}: the validation suites only run against a local database.`);
  }
}

const wanted = process.argv.slice(2);
const all = readdirSync(DIR)
  .filter((name) => name.endsWith("_validation.sql"))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const suites = wanted.length ? wanted.map((name) => `${name.replace(/_validation\.sql$/, "")}_validation.sql`) : all;
const unknown = suites.filter((name) => !all.includes(name));
if (unknown.length) fail(`Unknown suite(s): ${unknown.join(", ")}`);
if (suites.length === 0) fail("No *_validation.sql suite found.");

const psqlArgs = ["-X", "-q", "-v", "ON_ERROR_STOP=1"];
const command = DATABASE_URL
  ? ["psql", [...psqlArgs, DATABASE_URL]]
  : ["docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", ...psqlArgs]];

// Fail fast, with a hint, when the database cannot be reached at all.
const probe = spawnSync(command[0], command[1], { input: "select 1;", encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  fail(
    `Cannot reach the local database (${DATABASE_URL ? "DATABASE_URL" : `container ${CONTAINER}`}).\n` +
      "Start it with `supabase start` (from the repository root) and try again.\n" +
      (probe.error?.message ?? probe.stderr ?? ""),
  );
}

const results = [];
for (const suite of suites) {
  const started = Date.now();
  const sql = `begin;\n${readFileSync(join(DIR, suite), "utf8")}\n`;
  const run = spawnSync(command[0], command[1], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const errors = output.split("\n").filter((line) => /\bERROR:/.test(line));
  // Exactly one error, and it is the success marker.
  const ok = !run.error && errors.length === 1 && PASSED.test(errors[0]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ suite, ok });
  if (ok) {
    console.log(`PASS  ${suite} (${seconds}s)`);
  } else {
    console.log(`FAIL  ${suite} (${seconds}s)`);
    console.log(
      output
        .trim()
        .split("\n")
        .slice(-15)
        .map((line) => `      ${line}`)
        .join("\n"),
    );
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} suites passed.`);
if (failed.length) fail(`Failed: ${failed.map((r) => r.suite).join(", ")}`);
