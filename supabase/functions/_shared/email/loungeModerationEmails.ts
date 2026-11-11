/**
 * Members' Lounge moderation e-mails (decision 132):
 *
 *   lounge_moderation_decision   the statement of reasons (DSA art. 17) to the member
 *                                a decision affects: what was decided, the content
 *                                concerned, the reason, the ground (terms of use or
 *                                unlawful content), that no automated means decided,
 *                                and how to contest within 6 months (art. 20).
 *                                Event `lounge_decision:<decision id>`.
 *   lounge_report_outcome        to each member who reported the message (art. 16(5)).
 *                                Event `lounge_report:<report id>`.
 *   lounge_appeal_outcome        the team's answer to a complaint. Event `lounge_appeal:<appeal id>`.
 *
 * All three are driven by `pending_lounge_moderation_emails()` and sent by the
 * `send-pending-emails` sweep. The decision's facts are laid out by the code from
 * the database rows; the staff-editable template only carries the greeting.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type Block, type DetailRow, details, notice } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";
import { type EmailDeps, sendTemplatedEmail, type SendResult } from "./send.ts";

export type ModerationMailKind = "decision" | "report" | "appeal";

export interface PendingModerationMail {
  eventKey: string;
  kind: ModerationMailKind;
  email: string;
  locale: string;
  payload: Record<string, unknown>;
}

export interface ModerationMailSource {
  pending(limit: number): Promise<PendingModerationMail[]>;
}

const TEMPLATES: Record<ModerationMailKind, string> = {
  decision: "lounge_moderation_decision",
  report: "lounge_report_outcome",
  appeal: "lounge_appeal_outcome",
};

type Lang = "fr" | "en";

const LABELS = {
  fr: {
    eyebrow: "Salons des membres",
    decisionTitle: "La décision",
    decision: "Décision",
    actions: {
      hide: "Message masqué aux autres membres",
      delete: "Message supprimé",
      mute: "Écriture suspendue dans les salons",
      ban: "Exclusion des salons",
      dismiss: "Signalement classé sans suite",
      restore: "Message rétabli",
      lift: "Restriction levée",
    } as Record<string, string>,
    until: "Jusqu’au",
    date: "Date",
    content: "Contenu concerné",
    images: (n: number) => (n === 1 ? "1 image" : `${n} images`),
    reason: "Motif",
    reasons: {
      illegal: "Contenu illicite",
      harassment: "Harcèlement ou propos injurieux",
      spam: "Spam ou publicité",
      personal_data: "Données personnelles d’autrui",
      other: "Autre manquement",
    } as Record<string, string>,
    categories: {
      hate_speech: "incitation à la haine ou discrimination",
      violence_threats: "violence ou menaces",
      terrorism: "contenu terroriste",
      child_safety: "atteinte à la protection des mineurs",
      scam_fraud: "escroquerie ou fraude",
      counterfeit_ip: "contrefaçon ou atteinte à la propriété intellectuelle",
      privacy_image: "atteinte à la vie privée ou au droit à l’image",
      defamation: "diffamation ou injure",
      illegal_products: "produits ou pratiques illicites",
      other_illegal: "autre contenu illicite",
    } as Record<string, string>,
    ground: "Base de la décision",
    grounds: {
      terms: "Contraire aux conditions générales d’utilisation (Modération et signalement)",
      illegal: "Contenu considéré comme illicite",
    } as Record<string, string>,
    automated: "Décision automatisée",
    automatedNo: "Non : prise par un membre de l’équipe",
    statement: "Explication de l’équipe",
    contestTitle: "Contester cette décision",
    contestBody: (until: string) =>
      `Vous pouvez contester cette décision jusqu’au ${until} depuis votre espace, rubrique « Modération des salons ». ` +
      "Un membre de l’équipe la réexaminera et vous répondra par e-mail. Vous pouvez aussi saisir un organisme de " +
      "règlement extrajudiciaire des litiges certifié ou les juridictions compétentes.",
    contestAction: "Voir ou contester la décision",
    reportTitle: "Votre signalement",
    reportedAt: "Signalé le",
    outcome: "Suite donnée",
    outcomes: {
      actioned: "Nous avons pris une mesure à l’égard de ce contenu.",
      dismissed: "Nous n’avons pas retenu de manquement : le contenu reste en ligne.",
    } as Record<string, string>,
    appealTitle: "Votre contestation",
    submittedAt: "Envoyée le",
    appealOutcomes: {
      upheld: "Décision maintenue",
      reversed: "Décision annulée",
    } as Record<string, string>,
    reversedDelete: "Le message supprimé ne peut pas être rétabli ; vous pouvez le publier à nouveau.",
    response: "Réponse de l’équipe",
    contestedDecision: "Décision contestée",
  },
  en: {
    eyebrow: "Members’ lounges",
    decisionTitle: "The decision",
    decision: "Decision",
    actions: {
      hide: "Message hidden from other members",
      delete: "Message deleted",
      mute: "Writing suspended in the lounges",
      ban: "Excluded from the lounges",
      dismiss: "Report dismissed",
      restore: "Message restored",
      lift: "Restriction lifted",
    } as Record<string, string>,
    until: "Until",
    date: "Date",
    content: "Content concerned",
    images: (n: number) => (n === 1 ? "1 image" : `${n} images`),
    reason: "Reason",
    reasons: {
      illegal: "Unlawful content",
      harassment: "Harassment or abuse",
      spam: "Spam or advertising",
      personal_data: "Someone else’s personal data",
      other: "Other breach",
    } as Record<string, string>,
    categories: {
      hate_speech: "incitement to hatred or discrimination",
      violence_threats: "violence or threats",
      terrorism: "terrorist content",
      child_safety: "harm to the protection of minors",
      scam_fraud: "scam or fraud",
      counterfeit_ip: "counterfeiting or intellectual property infringement",
      privacy_image: "invasion of privacy or image rights",
      defamation: "defamation or insult",
      illegal_products: "unlawful products or practices",
      other_illegal: "other unlawful content",
    } as Record<string, string>,
    ground: "Ground of the decision",
    grounds: {
      terms: "Contrary to the terms of use (Moderation and reporting)",
      illegal: "Content considered unlawful",
    } as Record<string, string>,
    automated: "Automated decision",
    automatedNo: "No: taken by a member of the team",
    statement: "The team’s explanation",
    contestTitle: "Contesting this decision",
    contestBody: (until: string) =>
      `You can contest this decision until ${until} from your account, under “Lounge moderation”. ` +
      "A member of the team will review it and answer you by e-mail. You can also turn to a certified out-of-court " +
      "dispute settlement body or to the competent courts.",
    contestAction: "View or contest the decision",
    reportTitle: "Your report",
    reportedAt: "Reported on",
    outcome: "Outcome",
    outcomes: {
      actioned: "We took action on this content.",
      dismissed: "We found no breach: the content stays online.",
    } as Record<string, string>,
    appealTitle: "Your complaint",
    submittedAt: "Sent on",
    appealOutcomes: {
      upheld: "Decision upheld",
      reversed: "Decision reversed",
    } as Record<string, string>,
    reversedDelete: "The deleted message cannot be restored; you can post it again.",
    response: "The team’s answer",
    contestedDecision: "Decision contested",
  },
} as const;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function day(iso: string | null, lang: Lang, withTime = false): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Europe/Paris",
  }).format(date);
}

function contentValue(payload: Record<string, unknown>, lang: Lang): string | null {
  const excerpt = str(payload.excerpt);
  const images = Number(payload.attachment_count ?? 0);
  const parts = [excerpt ? (lang === "fr" ? `« ${excerpt} »` : `“${excerpt}”`) : null, images > 0 ? LABELS[lang].images(images) : null].filter(Boolean);
  return parts.length ? parts.join(" + ") : null;
}

function reasonValue(payload: Record<string, unknown>, lang: Lang): string | null {
  const l = LABELS[lang];
  const reason = str(payload.reason);
  if (!reason) return null;
  const category = str(payload.illegal_category);
  return category ? `${l.reasons[reason] ?? reason} (${l.categories[category] ?? category})` : (l.reasons[reason] ?? reason);
}

function moderationUrl(siteUrl: string, decisionId: unknown): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/compte/moderation`;
  return typeof decisionId === "string" && /^[0-9a-f-]{36}$/.test(decisionId) ? `${base}?decision=${decisionId}` : base;
}

/** The statement of reasons (art. 17). */
export function decisionContent(payload: Record<string, unknown>, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const action = String(payload.action ?? "");
  const rows: DetailRow[] = [
    { label: l.decision, value: l.actions[action] ?? action },
    ...(action === "mute" && str(payload.ends_at) ? [{ label: l.until, value: day(str(payload.ends_at), lang, true) }] : []),
    { label: l.date, value: day(str(payload.created_at), lang, true) },
  ];
  const content = contentValue(payload, lang);
  if (content) rows.push({ label: l.content, value: content });
  const reason = reasonValue(payload, lang);
  if (reason) rows.push({ label: l.reason, value: reason });
  const ground = str(payload.ground);
  if (ground) rows.push({ label: l.ground, value: l.grounds[ground] ?? ground });
  rows.push({ label: l.automated, value: l.automatedNo });
  const blocks: Block[] = [
    details({ title: l.decisionTitle, rows }),
    notice({ tone: "info", title: l.statement, body: String(payload.statement ?? "") }),
    notice({ tone: "info", title: l.contestTitle, body: l.contestBody(day(str(payload.appeal_until), lang)) }),
  ];
  return { eyebrow: l.eyebrow, primaryAction: { label: l.contestAction, url: moderationUrl(siteUrl, payload.decision_id) }, blocks };
}

/** What became of a report (art. 16(5)). */
export function reportContent(payload: Record<string, unknown>, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const outcome = String(payload.outcome ?? "");
  const rows: DetailRow[] = [{ label: l.reportedAt, value: day(str(payload.reported_at), lang, true) }];
  const content = contentValue(payload, lang);
  if (content) rows.push({ label: l.content, value: content });
  const reason = reasonValue(payload, lang);
  if (reason) rows.push({ label: l.reason, value: reason });
  rows.push({ label: l.outcome, value: l.outcomes[outcome] ?? outcome });
  rows.push({ label: l.automated, value: l.automatedNo });
  const blocks: Block[] = [details({ title: l.reportTitle, rows })];
  const statement = str(payload.statement);
  if (statement) blocks.push(notice({ tone: "info", title: l.statement, body: statement }));
  blocks.push(notice({ tone: "info", title: l.contestTitle, body: l.contestBody(day(str(payload.appeal_until), lang)) }));
  return { eyebrow: l.eyebrow, primaryAction: { label: l.contestAction, url: moderationUrl(siteUrl, payload.decision_id) }, blocks };
}

/** The answer to a complaint (art. 20). */
export function appealContent(payload: Record<string, unknown>, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const outcome = String(payload.outcome ?? "");
  const action = String(payload.action ?? "");
  const rows: DetailRow[] = [
    { label: l.contestedDecision, value: l.actions[action] ?? action },
    { label: l.submittedAt, value: day(str(payload.submitted_at), lang, true) },
    { label: l.outcome, value: l.appealOutcomes[outcome] ?? outcome },
  ];
  const content = contentValue(payload, lang);
  if (content) rows.splice(1, 0, { label: l.content, value: content });
  const blocks: Block[] = [
    details({ title: l.appealTitle, rows }),
    notice({ tone: outcome === "reversed" ? "success" : "info", title: l.response, body: String(payload.response ?? "") }),
  ];
  if (outcome === "reversed" && action === "delete" && payload.appellant_role === "target") {
    blocks.push(notice({ tone: "info", title: l.reversedDelete }));
  }
  return { eyebrow: l.eyebrow, primaryAction: { label: l.contestAction, url: moderationUrl(siteUrl, payload.decision_id) }, blocks };
}

export function moderationContent(mail: PendingModerationMail, locale: string, siteUrl: string): EmailContent {
  if (mail.kind === "decision") return decisionContent(mail.payload, locale, siteUrl);
  if (mail.kind === "report") return reportContent(mail.payload, locale, siteUrl);
  return appealContent(mail.payload, locale, siteUrl);
}

type Log = (message: string, detail?: unknown) => void;

export interface ModerationMailReport {
  examined: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendLoungeModerationEmails(
  deps: EmailDeps,
  source: ModerationMailSource,
  options: { limit?: number; log?: Log } = {},
): Promise<ModerationMailReport> {
  const log = options.log ?? (() => {});
  const report: ModerationMailReport = { examined: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of await source.pending(options.limit ?? 25)) {
    report.examined++;
    let result: SendResult;
    try {
      result = await sendTemplatedEmail(deps, {
        templateKey: TEMPLATES[row.kind],
        to: row.email,
        locale: row.locale,
        variables: {},
        eventKey: row.eventKey,
        content: (locale) => moderationContent(row, locale, deps.layout.siteUrl),
      });
    } catch (error) {
      log("lounge moderation e-mail crashed", { event: row.eventKey, error: error instanceof Error ? error.message : error });
      report.failed++;
      continue;
    }
    if (result.status === "sent") report.sent++;
    else if (result.status === "failed") {
      log("lounge moderation e-mail failed", { event: row.eventKey, error: result.error });
      report.failed++;
    } else report.skipped++;
  }
  return report;
}

const KINDS: ReadonlySet<string> = new Set(["decision", "report", "appeal"]);

export function supabaseModerationMailSource(db: SupabaseClient): ModerationMailSource {
  return {
    async pending(limit) {
      const { data, error } = await db.rpc("pending_lounge_moderation_emails", { p_limit: limit });
      if (error) throw new Error(`pending_lounge_moderation_emails: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[])
        .filter((row) => KINDS.has(String(row.kind)))
        .map((row) => ({
          eventKey: String(row.event_key),
          kind: String(row.kind) as ModerationMailKind,
          email: String(row.email),
          locale: String(row.locale),
          payload: row.payload !== null && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
        }));
    },
  };
}
