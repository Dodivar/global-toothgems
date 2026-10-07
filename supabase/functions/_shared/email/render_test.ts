import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { paragraph } from "./components.ts";
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
  assertStringIncludes(out.html, '<html lang="fr"');
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
  const card = out.html.slice(out.html.indexOf("<h1"), out.html.indexOf("</table>", out.html.indexOf("<h1")));
  assertEquals((card.match(/<p /g) ?? []).length, 3);
  assert(!out.text.includes("\n\n\n"));
});

Deno.test("values are escaped and a gift message never becomes a link", () => {
  const out = renderEmail(
    template,
    { ...values, first_name: '<img src=x onerror="alert(1)">', message: "Voir https://evil.example/pay\nBisous" },
    layout,
  );
  assert(!out.html.includes("<img src=x"));
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

Deno.test("the subject is the default title, and the caller can replace or drop it", () => {
  assertStringIncludes(renderEmail(template, values, layout).html, ">Votre commande GT-1042 est confirmée</h1>");
  assertStringIncludes(renderEmail(template, values, layout, { title: "Merci !" }).html, ">Merci !</h1>");
  assert(!renderEmail(template, values, layout, { title: null }).html.includes("<h1"));
});

Deno.test("caller content wraps the body: eyebrow, intro, actions and blocks, in the html and the text", () => {
  const out = renderEmail(template, values, layout, {
    eyebrow: "Commande",
    intro: "Votre colis se prépare.",
    primaryAction: { label: "Suivre ma commande", url: "https://globaltoothgems.com/compte/commandes" },
    blocks: [paragraph("Bloc ajouté")],
  });
  const order = ["Commande", "Votre colis se prépare.", "Bonjour Camille,", "Suivre ma commande", "Bloc ajouté"];
  const positions = order.map((needle) => out.html.indexOf(needle));
  assertEquals([...positions].sort((a, b) => a - b), positions);
  assertStringIncludes(out.text, "Suivre ma commande: https://globaltoothgems.com/compte/commandes");
});

Deno.test("the layout carries the logo, the localized legal links and no unsubscribe link by default", () => {
  const fr = renderEmail(template, values, layout).html;
  assertStringIncludes(fr, 'src="https://globaltoothgems.com/email/logo-wordmark.png"');
  assertStringIncludes(fr, 'href="https://globaltoothgems.com/fr/confidentialite"');
  assertStringIncludes(fr, 'href="https://globaltoothgems.com/fr/conditions-generales"');
  assert(!fr.includes("Se désinscrire"));
  const en = renderEmail({ ...template, locale: "en" }, values, layout).html;
  assertStringIncludes(en, 'href="https://globaltoothgems.com/en/privacy-policy"');
  assertStringIncludes(en, 'href="https://globaltoothgems.com/en/terms-of-sale"');
});

Deno.test("a marketing e-mail carries its unsubscribe link in the html and the text", () => {
  const out = renderEmail(template, values, layout, { unsubscribeUrl: "https://globaltoothgems.com/u/abc" });
  assertStringIncludes(out.html, 'href="https://globaltoothgems.com/u/abc"');
  assertStringIncludes(out.text, "https://globaltoothgems.com/u/abc");
});

Deno.test("a caller action that is not https fails the render", () => {
  assertThrows(
    () => renderEmail(template, values, layout, { primaryAction: { label: "Go", url: "javascript:alert(1)" } }),
    EmailRenderError,
  );
});
