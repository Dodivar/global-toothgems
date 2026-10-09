// `npm run sync:documents`: copies the portable part of the PDF documents
// (src/lib/documents/) to supabase/functions/_shared/documents/, where the
// Edge Functions that e-mail invoices and credit notes import it, plus the
// documents' French and English strings. The webapp is the source; the copies
// are generated, and `src/lib/documents/sync.test.ts` fails when they are
// stale. `--check` only reports the difference.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEBAPP = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(WEBAPP, "src/lib/documents");
export const TARGET = join(WEBAPP, "../supabase/functions/_shared/documents");

/** Modules with no import outside this list but the money helper (Edge: `_shared/money.ts`). */
export const PORTABLE = [
  "assets.generated.ts",
  "text.ts",
  "pdfWriter.ts",
  "template.ts",
  "legal.ts",
  "invoiceModel.ts",
  "invoiceDocument.ts",
];

const header = (from) =>
  `// Generated from webapp/src/lib/documents/${from} by webapp/scripts/sync-documents.mjs — edit the source, then run \`npm run sync:documents\`.\n`;

function messages() {
  const pick = (lang) => JSON.parse(readFileSync(join(WEBAPP, `src/i18n/locales/${lang}.json`), "utf8")).documents;
  const body = JSON.stringify({ fr: { documents: pick("fr") }, en: { documents: pick("en") } }, null, 2);
  return (
    "// Generated from webapp/src/i18n/locales/{fr,en}.json (`documents`) by webapp/scripts/sync-documents.mjs.\n\n" +
    "/** The documents' strings, by language, keyed like the webapp's i18n (`documents.invoice.title`…). */\n" +
    `export const DOCUMENT_MESSAGES = ${body} as const;\n`
  );
}

/** Every generated file: name in the target folder → content. */
export function expectedFiles() {
  const files = {};
  for (const name of PORTABLE) {
    const source = readFileSync(join(SOURCE, name), "utf8").replaceAll('"../catalog/money.ts"', '"../money.ts"');
    if (/from "\.\.\/(?!money\.ts")/.test(source)) throw new Error(`${name} imports outside the documents folder`);
    files[name] = header(name) + source;
  }
  files["messages.generated.ts"] = messages();
  return files;
}

/** Names of the generated files whose copy is missing or differs. */
export function staleFiles() {
  return Object.entries(expectedFiles())
    .filter(([name, content]) => !existsSync(join(TARGET, name)) || readFileSync(join(TARGET, name), "utf8") !== content)
    .map(([name]) => name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const stale = staleFiles();
    if (stale.length) {
      console.error(`Stale copies in supabase/functions/_shared/documents: ${stale.join(", ")}. Run npm run sync:documents.`);
      process.exit(1);
    }
    console.log("Documents copies are up to date.");
  } else {
    mkdirSync(TARGET, { recursive: true });
    for (const [name, content] of Object.entries(expectedFiles())) writeFileSync(join(TARGET, name), content);
    console.log(`Wrote ${Object.keys(expectedFiles()).length} files to supabase/functions/_shared/documents.`);
  }
}
