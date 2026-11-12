import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { AUTH_TEMPLATES, renderAuthTemplate } from "./authTemplates.ts";

for (const template of AUTH_TEMPLATES) {
  Deno.test(`${template.file} is the shared layout and matches the committed file`, async () => {
    const rendered = renderAuthTemplate(template);
    assertStringIncludes(rendered, "/email/logo-wordmark.png");
    assertStringIncludes(rendered, "{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}");
    assertStringIncludes(rendered, "{{ .Email }}");
    assertEquals(rendered.includes("@@"), false);
    // A Windows checkout (core.autocrlf) turns the committed file's line ends into CRLF.
    const committed = (await Deno.readTextFile(new URL(`../../../templates/${template.file}`, import.meta.url))).replace(/\r\n/g, "\n");
    assertEquals(committed, rendered, "run: node --experimental-strip-types supabase/functions/_shared/email/authTemplates.ts");
  });
}
