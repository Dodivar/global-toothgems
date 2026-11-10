import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { renderEmail } from "./render.ts";
import {
  appealContent,
  decisionContent,
  type PendingModerationMail,
  reportContent,
  sendLoungeModerationEmails,
} from "./loungeModerationEmails.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const LAYOUT = { brandName: "Global Toothgems", siteUrl: "https://site.example" };
const DECISION = "6f1c1f0e-3b7a-4c55-9a51-1d2b3c4d5e6f";

const TEMPLATE = {
  key: "lounge_moderation_decision",
  locale: "fr",
  subject: "Une décision de modération vous concerne dans les salons des membres",
  preheader: "Ce que nous avons décidé.",
  body: "Bonjour,\n\nNotre équipe de modération a pris une décision qui vous concerne.",
  variables: [],
};

function text(content: ReturnType<typeof decisionContent>, locale = "fr"): string {
  return renderEmail({ ...TEMPLATE, locale }, {}, LAYOUT, content).text;
}

Deno.test("the statement of reasons says what, which content, why, on which ground, not automated, and how to contest", () => {
  const content = decisionContent({
    decision_id: DECISION,
    action: "hide",
    reason: "illegal",
    illegal_category: "privacy_image",
    ground: "illegal",
    statement: "Une photo d'une personne publiée sans son accord.",
    created_at: "2026-11-10T13:00:00Z",
    appeal_until: "2027-05-10T13:00:00Z",
    excerpt: "Regardez cette cliente",
    attachment_count: 1,
  }, "fr", "https://site.example/");
  const body = text(content);
  assertStringIncludes(body, "Message masqué aux autres membres");
  assertStringIncludes(body, "« Regardez cette cliente » + 1 image");
  assertStringIncludes(body, "Contenu illicite (atteinte à la vie privée ou au droit à l’image)");
  assertStringIncludes(body, "Contenu considéré comme illicite");
  assertStringIncludes(body, "Non : prise par un membre de l’équipe");
  assertStringIncludes(body, "Une photo d'une personne publiée sans son accord.");
  assertStringIncludes(body, "10 mai 2027");
  assertEquals(content.primaryAction?.url, `https://site.example/compte/moderation?decision=${DECISION}`);
});

Deno.test("a mute names its end; English labels; an unknown id links to the page itself", () => {
  const content = decisionContent({
    decision_id: "not-an-id",
    action: "mute",
    reason: "spam",
    ground: "terms",
    statement: "Repeated advertising.",
    ends_at: "2026-11-11T13:00:00Z",
    created_at: "2026-11-10T13:00:00Z",
    appeal_until: "2027-05-10T13:00:00Z",
  }, "en", "https://site.example");
  const body = text(content, "en");
  assertStringIncludes(body, "Writing suspended in the lounges");
  assertStringIncludes(body, "Until: 11 November 2026");
  assertStringIncludes(body, "Contrary to the terms of use");
  assertEquals(content.primaryAction?.url, "https://site.example/compte/moderation");
});

Deno.test("a reporter learns the outcome; a dismissal carries its explanation", () => {
  const dismissed = text(reportContent({
    decision_id: DECISION, outcome: "dismissed", action: "dismiss", statement: "Un salut n'est pas du harcèlement.",
    reason: "harassment", reported_at: "2026-11-10T10:00:00Z", appeal_until: "2027-05-10T13:00:00Z", excerpt: "Bonjour",
  }, "fr", "https://site.example"));
  assertStringIncludes(dismissed, "le contenu reste en ligne");
  assertStringIncludes(dismissed, "Un salut n'est pas du harcèlement.");
  const actioned = reportContent({ decision_id: DECISION, outcome: "actioned", action: "hide", reported_at: "2026-11-10T10:00:00Z" }, "fr", "https://site.example");
  assertStringIncludes(text(actioned), "Nous avons pris une mesure");
  assert(!actioned.blocks?.some((b) => b.text.includes("Explication")));
});

Deno.test("the answer to a complaint; a reversed deletion says it cannot come back", () => {
  const content = appealContent({
    decision_id: DECISION, outcome: "reversed", action: "delete", appellant_role: "target",
    response: "Vous aviez raison, nous nous sommes trompés.", submitted_at: "2026-11-10T14:00:00Z",
  }, "fr", "https://site.example");
  const body = text(content);
  assertStringIncludes(body, "Décision annulée");
  assertStringIncludes(body, "Vous aviez raison");
  assertStringIncludes(body, "ne peut pas être rétabli");
});

Deno.test("the sweep sends each event once, with its own template", async () => {
  const claimed: string[] = [];
  const templates: string[] = [];
  const store: EmailStore = {
    loadTemplate: (key) => (templates.push(key), Promise.resolve({ ...TEMPLATE, key })),
    claim: (entry) => {
      claimed.push(entry.eventKey);
      return Promise.resolve(claimed.filter((k) => k === entry.eventKey).length > 1 ? { claimed: false, status: "sent" } : { claimed: true, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps = {
    store,
    resend: { apiKey: "re_test", fetch: () => Promise.resolve(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })) },
    from: "Global Toothgems <no-reply@example.com>",
    layout: LAYOUT,
  } as unknown as EmailDeps;
  const mail = (eventKey: string, kind: PendingModerationMail["kind"]): PendingModerationMail => ({
    eventKey, kind, email: "member@example.com", locale: "fr",
    payload: { decision_id: DECISION, action: "hide", outcome: "upheld", statement: "Une explication.", response: "Une réponse." },
  });
  const report = await sendLoungeModerationEmails(deps, {
    pending: () => Promise.resolve([mail("lounge_decision:1", "decision"), mail("lounge_report:2", "report"), mail("lounge_appeal:3", "appeal"), mail("lounge_decision:1", "decision")]),
  });
  assertEquals(report, { examined: 4, sent: 3, skipped: 1, failed: 0 });
  assertEquals(templates.slice(0, 3), ["lounge_moderation_decision", "lounge_report_outcome", "lounge_appeal_outcome"]);
});
