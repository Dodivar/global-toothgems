import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { EmailRenderError, type LayoutOptions, renderEmail, type TemplateRow } from "./render.ts";

const layout: LayoutOptions = { brandName: "Global Tooth Gems", siteUrl: "https://globaltoothgems.com" };

const template: TemplateRow = {
  locale: "fr",
  subject: "Votre commande {{order_number}} est confirmée",
  preheader: "Merci {{first_name}}",
  body: "Bonjour {{first_name}},\n\nSuivez-la ici : {{tracking_url}}\n\n{{message}}\n\nÀ bientôt.",
  variables: ["first_name", "order_number", "tracking_url", "message"],
};
const values = {
  first_name: "Camille",
  order_number: "GT-1042",
  tracking_url: "https://carrier.example/track?id=1&lang=fr",
  message: "",
};

Deno.test("subject, preheader, html and text carry the values", () => {
  const out = renderEmail(template, values, layout);
  assertEquals(out.subject, "Votre commande GT-1042 est confirmée");
  assertEquals(out.preheader, "Merci Camille");
  assertStringIncludes(out.html, '<html lang="fr">');
  assertStringIncludes(out.html, "Bonjour Camille,");
  assertStringIncludes(out.text, "Bonjour Camille,");
  assertStringIncludes(out.text, "https://carrier.example/track?id=1&lang=fr");
});

Deno.test("a value that is an https address becomes a link, with the ampersand escaped", () => {
  const out = renderEmail(template, values, layout);
  assertStringIncludes(out.html, 'href="https://carrier.example/track?id=1&amp;lang=fr"');
});

Deno.test("an empty value drops its paragraph instead of leaving a gap", () => {
  const out = renderEmail(template, values, layout);
  assertEquals((out.html.match(/<p /g) ?? []).length, 3);
  assert(!out.text.includes("\n\n\n"));
});

Deno.test("values are escaped and a gift message never becomes a link", () => {
  const out = renderEmail(
    template,
    { ...values, first_name: '<img src=x onerror="alert(1)">', message: "Voir https://evil.example/pay\nBisous" },
    layout,
  );
  assert(!out.html.includes("<img"));
  assertStringIncludes(out.html, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert(!out.html.includes('href="https://evil.example'));
  assertStringIncludes(out.html, "Voir https://evil.example/pay<br>Bisous");
});

Deno.test("the template's own https addresses are linked, without trailing punctuation", () => {
  const out = renderEmail(
    { ...template, body: "Voir https://globaltoothgems.com/aide. Merci {{first_name}}" },
    values,
    layout,
  );
  assertStringIncludes(out.html, 'href="https://globaltoothgems.com/aide"');
  assertStringIncludes(out.html, "</a>. Merci Camille");
});

Deno.test("the subject stays on one line whatever the value contains", () => {
  const out = renderEmail(template, { ...values, order_number: "GT-1\r\nBcc: spy@example.com" }, layout);
  assert(!/[\r\n]/.test(out.subject));
});

Deno.test("a missing value fails instead of sending an empty greeting", () => {
  const { first_name: _omit, ...rest } = values;
  assertThrows(() => renderEmail(template, rest, layout), EmailRenderError, "first_name");
});

Deno.test("a placeholder the template does not declare fails", () => {
  assertThrows(
    () => renderEmail({ ...template, body: "Bonjour {{first_name}} {{secret}}" }, { ...values, secret: "x" }, layout),
    EmailRenderError,
    "secret",
  );
});

Deno.test("the layout carries the brand and the site, and the text twin signs off", () => {
  const out = renderEmail(template, values, layout);
  assertStringIncludes(out.html, "Global Tooth Gems");
  assertStringIncludes(out.html, "globaltoothgems.com");
  assert(out.text.endsWith("— Global Tooth Gems\nhttps://globaltoothgems.com\n"));
});
