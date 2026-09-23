const img = (name: string) => new URL(`../assets/photos/${name}`, import.meta.url).href;

/**
 * Customer reviews and their moderation — types and seed.
 *
 * One model serves the storefront (product and course pages, "My reviews") and
 * the back office (dashboard, moderation queue, reported reviews), so a review
 * approved in the admin appears on the product page in the same session.
 *
 * Mock data, like every file in `data/`. Four decisions shape it rather than
 * the backend, and would carry over to the real schema:
 *
 * - **Verification comes from an order**, never from a checkbox. A review with
 *   an `orderRef` is a verified purchase (product) or a verified student
 *   (course); the storefront only lets a customer write one when the account's
 *   own orders or enrolments allow it (`lib/reviews.tsx`).
 * - **The text is the customer's**, in the language they wrote it in (`lang`).
 *   It is never machine-translated or edited by the team (guideline 08); a
 *   review that cannot be published is sent back or rejected instead.
 * - **Reports never delete anything.** A reported review stays in its current
 *   state with its reports attached until someone on the team decides.
 * - **Every change is recorded** in `history`, which is what the moderation
 *   panel's timeline and the audit trail read.
 *
 * Draft is the first step of the lifecycle but is not a stored status: a draft
 * is the unsent form, kept per subject in the review store until it is sent.
 */

/** The prototype's "today". The seed's dates are laid out around it. */
export const REVIEW_NOW = "2026-09-23T10:00";

export type ReviewSubjectKind = "product" | "course";

export interface ReviewSubject {
  kind: ReviewSubjectKind;
  /** A product id from `data/products.ts` or a course id from `data/courses.ts`. */
  id: string;
}

export function subjectKey(subject: ReviewSubject): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * Stored lifecycle. "Reported" and "edited" are not statuses: a published
 * review can carry open reports, and an edited one is pending again with an
 * `editedAt` date. Keeping them as facts beside the status is what lets a
 * reported review stay published while the team looks at it.
 */
export type ReviewStatus = "pending" | "published" | "needsChanges" | "rejected" | "hidden";

export const REVIEW_STATUSES: ReviewStatus[] = ["pending", "published", "needsChanges", "rejected", "hidden"];

export type ReportReason = "inappropriate" | "spam" | "fake" | "personal" | "offensive" | "irrelevant" | "other";

export const REPORT_REASONS: ReportReason[] = ["inappropriate", "spam", "fake", "personal", "offensive", "irrelevant", "other"];

/** Why a review was not published — the category the customer is told. */
export type RejectReason = "guidelines" | "personal" | "offTopic" | "spam" | "offensive" | "notAuthentic";

export const REJECT_REASONS: RejectReason[] = ["guidelines", "personal", "offTopic", "spam", "offensive", "notAuthentic"];

export const PRODUCT_TAGS = ["quality", "result", "easy", "value", "delivery"] as const;
export const COURSE_TAGS = ["beginner", "followable", "clear", "techniques", "informative", "highQuality", "skills"] as const;
export type ReviewTag = (typeof PRODUCT_TAGS)[number] | (typeof COURSE_TAGS)[number];

export function tagsFor(kind: ReviewSubjectKind): readonly ReviewTag[] {
  return kind === "product" ? PRODUCT_TAGS : COURSE_TAGS;
}

/** Up to four photos; the text alternative is written by the customer. */
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const TITLE_MAX = 80;
export const BODY_MIN = 30;
export const BODY_MAX = 2000;
export const RESPONSE_MAX = 1000;
/** Share of a course's lessons a student must have validated before reviewing it. */
export const COURSE_REVIEW_THRESHOLD = 50;

export interface ReviewPhoto {
  src: string;
  /** Written by the customer; an empty string falls back to a generated description. */
  alt: string;
}

export interface ReviewCustomer {
  firstName: string;
  lastName: string;
  email: string;
  /** ISO country code, as in the back office's customer records. */
  country: string;
}

export interface ReviewReport {
  id: string;
  reason: ReportReason;
  details?: string;
  at: string;
  /** A customer on the storefront, or someone on the team flagging it internally. */
  source: "customer" | "team";
  resolved: boolean;
  resolution?: "kept" | "hidden" | "removed";
}

export interface ReviewResponse {
  body: string;
  at: string;
  /** Who wrote it, for the back office. The storefront signs it "Global Toothgems". */
  by: string;
}

export interface ReviewNote {
  id: string;
  body: string;
  at: string;
  by: string;
}

export type HistoryKind =
  | "submitted"
  | "edited"
  | "resubmitted"
  | "approved"
  | "rejected"
  | "changesRequested"
  | "hidden"
  | "restored"
  | "responded"
  | "responseEdited"
  | "responseRemoved"
  | "reported"
  | "flagged"
  | "kept"
  | "removed";

export interface HistoryEvent {
  kind: HistoryKind;
  at: string;
  /** A customer's privacy name, a team member, or "system". */
  by: string;
  note?: string;
}

export interface CustomerReview {
  id: string;
  subject: ReviewSubject;
  customer: ReviewCustomer;
  /** Written by the demo account. Its name follows whoever is signed in. */
  mine?: boolean;
  /** The order that verifies the review. Null when no matching order exists. */
  orderRef: string | null;
  rating: number;
  title: string;
  body: string;
  /** Language the customer wrote in. The text is never translated. */
  lang: "fr" | "en";
  tags: ReviewTag[];
  photos: ReviewPhoto[];
  status: ReviewStatus;
  submittedAt: string;
  publishedAt?: string;
  /** Set when the customer changes a review after sending it. */
  editedAt?: string;
  /** Course progress when the review was written. Courses only. */
  progressPct?: number;
  helpful: number;
  reports: ReviewReport[];
  response?: ReviewResponse;
  rejection?: { reason: RejectReason; internal?: string };
  /** Message to the customer when the team asks for changes. */
  changesRequest?: string;
  /** Internal flag raised by the team, independent of customer reports. */
  flagged?: boolean;
  notes: ReviewNote[];
  history: HistoryEvent[];
}

export function isVerified(review: CustomerReview): boolean {
  return review.orderRef !== null;
}

export function openReports(review: CustomerReview): ReviewReport[] {
  return review.reports.filter((r) => !r.resolved);
}

/** "Sarah M." — the only form of a name the storefront ever shows. */
export function privacyName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first.trim()} ${initial.toUpperCase()}.` : first.trim();
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

const TEAM = "Camille Dubois";
const TEAM_2 = "Julie Moreau";

/** Fallback identity of the demo account when nobody is signed in. */
export const DEMO_CUSTOMER: ReviewCustomer = {
  firstName: "Camille",
  lastName: "Bernard",
  email: "camille.bernard@example.com",
  country: "fr",
};

const C = {
  sarah: { firstName: "Sarah", lastName: "Martin", email: "sarah.martin@example.com", country: "fr" },
  emma: { firstName: "Emma", lastName: "Rousseau", email: "emma.rousseau@example.com", country: "fr" },
  laura: { firstName: "Laura", lastName: "Petit", email: "laura.petit@example.com", country: "be" },
  sophie: { firstName: "Sophie", lastName: "Dubois", email: "sophie.dubois@example.com", country: "ie" },
  hannah: { firstName: "Hannah", lastName: "Weber", email: "hannah.weber@zahnglanz.de", country: "de" },
  lea: { firstName: "Léa", lastName: "Fabre", email: "lea.fabre@example.com", country: "fr" },
  olivia: { firstName: "Olivia", lastName: "Jensen", email: "olivia.jensen@example.com", country: "ie" },
  priya: { firstName: "Priya", lastName: "Shah", email: "priya.shah@example.com", country: "ie" },
  zoe: { firstName: "Zoé", lastName: "Garnier", email: "zoe.garnier@example.com", country: "fr" },
  yasmine: { firstName: "Yasmine", lastName: "Amrani", email: "yasmine.a@example.com", country: "fr" },
  sofia: { firstName: "Sofia", lastName: "Duarte", email: "sofia.duarte@brightsmile.be", country: "be" },
  marta: { firstName: "Marta", lastName: "Silva", email: "marta.silva@example.com", country: "be" },
  julia: { firstName: "Julia", lastName: "Klein", email: "julia.klein@example.com", country: "de" },
  anais: { firstName: "Anaïs", lastName: "Perrin", email: "anais.perrin@example.com", country: "fr" },
  chloe: { firstName: "Chloé", lastName: "Lefèvre", email: "chloe.lefevre@example.com", country: "fr" },
  mia: { firstName: "Mia", lastName: "Olsen", email: "mia.olsen@example.com", country: "de" },
  camilleR: { firstName: "Camille", lastName: "Reynaud", email: "camille.reynaud@studiolumi.fr", country: "fr" },
  aisling: { firstName: "Aisling", lastName: "O’Connor", email: "aisling.oconnor@gemstudio.ie", country: "ie" },
  clara: { firstName: "Clara", lastName: "Vidal", email: "clara.vidal@studioclara.fr", country: "fr" },
  nora: { firstName: "Nora", lastName: "Benali", email: "nora.benali@gmail.com", country: "fr" },
  ines: { firstName: "Inès", lastName: "Lambert", email: "ines.lambert@icloud.com", country: "fr" },
  elodie: { firstName: "Élodie", lastName: "Marchand", email: "elodie@atelier-perle.fr", country: "fr" },
  theo: { firstName: "Théo", lastName: "Marchal", email: "theo.marchal@gmail.com", country: "fr" },
  elena: { firstName: "Elena", lastName: "Costa", email: "elena.costa@example.com", country: "be" },
  manon: { firstName: "Manon", lastName: "Dupuis", email: "manon.dupuis@example.com", country: "fr" },
  lucie: { firstName: "Lucie", lastName: "Garcia", email: "lucie.garcia@example.com", country: "fr" },
  freya: { firstName: "Freya", lastName: "Lund", email: "freya.lund@example.com", country: "de" },
} satisfies Record<string, ReviewCustomer>;

type Seed = Omit<CustomerReview, "history" | "notes" | "reports" | "tags" | "photos" | "helpful"> &
  Partial<Pick<CustomerReview, "history" | "notes" | "reports" | "tags" | "photos" | "helpful">>;

/**
 * Fills the parts every seed would otherwise repeat, and derives a plausible
 * history from the status when none is given, so the moderation timeline is
 * never empty and never contradicts the status.
 */
function seed(s: Seed): CustomerReview {
  const author = privacyName(s.customer.firstName, s.customer.lastName);
  const history: HistoryEvent[] = s.history ?? [
    { kind: "submitted", at: s.submittedAt, by: author },
    ...(s.publishedAt ? [{ kind: "approved" as const, at: s.publishedAt, by: TEAM }] : []),
    ...(s.response ? [{ kind: "responded" as const, at: s.response.at, by: s.response.by }] : []),
  ];
  return {
    tags: [],
    photos: [],
    helpful: 0,
    reports: [],
    notes: [],
    ...s,
    history,
  };
}

const P = (id: string): ReviewSubject => ({ kind: "product", id });
const K = (id: string): ReviewSubject => ({ kind: "course", id });

export const SEED_REVIEWS: CustomerReview[] = [
  /* ---------------------------- Aurora Heart ---------------------------- */
  seed({
    id: "RV-1001",
    subject: P("aurora-heart"),
    customer: C.sarah,
    orderRef: "GT-10311",
    rating: 5,
    title: "The opal centre catches every light",
    body: "I was worried the heart would look too small on a front incisor, but at 2.0 mm it's exactly right. The opal centre flashes blue and pink depending on the light and my client couldn't stop looking at it. The flat back sat perfectly on the adhesive — no rocking at all.",
    lang: "en",
    tags: ["result", "quality"],
    photos: [{ src: img("mouth-02.jpg"), alt: "Gold heart gem with an opal centre on an upper front tooth" }],
    status: "published",
    submittedAt: "2026-09-01T18:12",
    publishedAt: "2026-09-02T09:40",
    helpful: 18,
    response: {
      body: "Thank you so much, Sarah! That opal flash is exactly why we chose a lab-grown centre. We’re delighted your client loved it. ✨",
      at: "2026-09-02T10:05",
      by: TEAM,
    },
  }),
  seed({
    id: "RV-1002",
    subject: P("aurora-heart"),
    customer: C.hannah,
    orderRef: "GT-10468",
    rating: 5,
    title: "Three clients, three happy smiles",
    body: "Ordered three for a weekend of appointments. Each one came in its own sterile capsule, which my clients noticed and appreciated. The gold is warm rather than brassy, which suits most enamel shades.",
    lang: "en",
    tags: ["quality", "delivery"],
    status: "published",
    submittedAt: "2026-09-18T20:31",
    publishedAt: "2026-09-19T08:55",
    helpful: 7,
  }),
  seed({
    id: "RV-1003",
    subject: P("aurora-heart"),
    customer: C.emma,
    orderRef: "GT-10288",
    rating: 4,
    title: "Superbe, un peu plus petit que prévu",
    body: "La finition est impeccable et le centre en opale est magnifique. Je l’ai trouvé un peu plus petit que sur les photos : pour une première pose sur une incisive centrale, je prendrais la taille au-dessus.",
    lang: "fr",
    tags: ["quality"],
    status: "published",
    submittedAt: "2026-08-24T11:02",
    publishedAt: "2026-08-24T16:20",
    helpful: 5,
  }),
  seed({
    id: "RV-1004",
    subject: P("aurora-heart"),
    customer: C.laura,
    orderRef: "GT-10265",
    rating: 5,
    title: "Mon best-seller en cabine",
    body: "C’est la gem que mes clientes choisissent le plus souvent sur mon présentoir. Pose facile, tenue parfaite après trois mois de contrôle. Je recommande de l’associer au kit de suivi.",
    lang: "fr",
    tags: ["result", "easy"],
    photos: [{ src: img("mouth-05.jpg"), alt: "Sourire avec une gem en forme de cœur posée sur une incisive" }],
    status: "published",
    submittedAt: "2026-08-12T09:47",
    publishedAt: "2026-08-12T14:03",
    helpful: 11,
  }),
  seed({
    id: "RV-1005",
    subject: P("aurora-heart"),
    customer: C.lea,
    orderRef: "GT-10241",
    rating: 3,
    title: "Jolie gem, livraison plus longue qu’annoncé",
    body: "La gem est belle et conforme. En revanche le colis a mis six jours au lieu de deux, et j’ai dû décaler une cliente. Le service client a été réactif, mais c’est dommage pour un produit professionnel.",
    lang: "fr",
    tags: ["quality"],
    status: "published",
    submittedAt: "2026-07-29T19:15",
    publishedAt: "2026-07-30T09:12",
    helpful: 9,
    response: {
      body: "Merci Léa pour ce retour honnête. Le transporteur a connu des retards fin juillet et nous sommes désolés pour votre rendez-vous décalé. Nous proposons désormais l’envoi express à partir de 49 € pour les commandes professionnelles.",
      at: "2026-07-30T11:40",
      by: TEAM_2,
    },
  }),
  seed({
    id: "RV-1006",
    subject: P("aurora-heart"),
    customer: C.olivia,
    orderRef: null,
    rating: 5,
    title: "A gift that started a new hobby",
    body: "A friend who is a toothgem artist gave me one after my first appointment. It has held perfectly for two months and I get compliments every week.",
    lang: "en",
    tags: ["result"],
    status: "published",
    submittedAt: "2026-07-18T13:22",
    publishedAt: "2026-07-19T10:00",
    helpful: 2,
    notes: [
      {
        id: "N-1",
        body: "No matching order: the gem was a gift. Published without the verified label, as our guidelines allow.",
        at: "2026-07-19T09:58",
        by: TEAM,
      },
    ],
  }),
  seed({
    id: "RV-1007",
    subject: P("aurora-heart"),
    customer: C.priya,
    orderRef: "GT-10376",
    rating: 2,
    title: "Didn’t bond well on my first try",
    body: "The gem itself is beautiful, but it came off after four days on my first client. I may have rushed the etching step — the second application held — but I’d love clearer instructions in the box for newer artists.",
    lang: "en",
    tags: [],
    status: "published",
    submittedAt: "2026-09-10T08:30",
    publishedAt: "2026-09-10T15:12",
    helpful: 4,
    response: {
      body: "Thank you for telling us, Priya — this is really useful. Etching time is the most common cause of early lifting. We’ve sent you our step-by-step bonding card, and a printed version will ship in every box from October.",
      at: "2026-09-10T16:02",
      by: TEAM,
    },
  }),
  seed({
    id: "RV-1008",
    subject: P("aurora-heart"),
    customer: C.zoe,
    orderRef: "GT-10392",
    rating: 5,
    title: "Coup de cœur absolu",
    body: "Reçue hier, posée ce matin sur ma sœur. Le rendu est encore plus beau qu’en photo, et l’or ne jaunit pas la dent. Je commande la version en cristal pour la prochaine fois.",
    lang: "fr",
    tags: ["result", "quality"],
    status: "pending",
    submittedAt: "2026-09-22T21:48",
  }),
  seed({
    id: "RV-1009",
    subject: P("aurora-heart"),
    customer: C.yasmine,
    orderRef: "GT-10355",
    rating: 1,
    title: "Trouvez moins cher ailleurs",
    body: "Même gem trouvée trois fois moins chère sur un autre site, lien dans ma bio. Ne vous faites pas avoir.",
    lang: "fr",
    tags: [],
    status: "published",
    submittedAt: "2026-09-19T23:10",
    publishedAt: "2026-09-20T08:31",
    helpful: 0,
    reports: [
      { id: "RP-1", reason: "spam", details: "Redirects to another shop through an Instagram bio.", at: "2026-09-20T12:14", source: "customer", resolved: false },
      { id: "RP-2", reason: "fake", at: "2026-09-21T09:02", source: "customer", resolved: false },
      { id: "RP-3", reason: "spam", at: "2026-09-22T17:45", source: "customer", resolved: false },
    ],
    history: [
      { kind: "submitted", at: "2026-09-19T23:10", by: "Yasmine A." },
      { kind: "approved", at: "2026-09-20T08:31", by: TEAM_2 },
      { kind: "reported", at: "2026-09-20T12:14", by: "customer", note: "spam" },
      { kind: "reported", at: "2026-09-21T09:02", by: "customer", note: "fake" },
      { kind: "reported", at: "2026-09-22T17:45", by: "customer", note: "spam" },
    ],
  }),

  /* ------------------------------ Aftercare ----------------------------- */
  seed({
    id: "RV-1101",
    subject: P("aftercare"),
    customer: DEMO_CUSTOMER,
    mine: true,
    orderRef: "GT-2026-0151",
    rating: 4,
    title: "Mes clientes adorent les cartes",
    body: "Les cartes de suivi sont claires et jolies, mes clientes les gardent. Pour en recommander, écrivez-moi directement au 06 12 34 56 78, je fais aussi des poses à domicile.",
    lang: "fr",
    tags: ["quality", "value"],
    status: "rejected",
    submittedAt: "2026-09-18T10:22",
    rejection: { reason: "personal", internal: "Phone number and a solicitation for her own services." },
    history: [
      { kind: "submitted", at: "2026-09-18T10:22", by: "Camille B." },
      { kind: "rejected", at: "2026-09-18T15:40", by: TEAM, note: "personal" },
    ],
  }),
  seed({
    id: "RV-1102",
    subject: P("aftercare"),
    customer: C.sofia,
    orderRef: "GT-10457",
    rating: 4,
    title: "Nice cards, the kit could be bigger",
    body: "The aftercare cards look professional and save me explaining the same thing ten times a day. I’d buy a larger pack for a busy studio.",
    lang: "en",
    tags: ["quality"],
    status: "published",
    submittedAt: "2026-09-14T12:00",
    publishedAt: "2026-09-14T17:30",
    helpful: 3,
  }),

  /* ------------------------------ Starter kit --------------------------- */
  seed({
    id: "RV-1201",
    subject: P("starter-kit"),
    customer: DEMO_CUSTOMER,
    mine: true,
    orderRef: "GT-2026-0129",
    rating: 5,
    title: "Parfait pour démarrer en cabine",
    body: "Tout est là : adhésif, mordançage, outils de pose et gems. J’ai fait mes six premières poses avec ce kit sans rien racheter. Les instructions correspondent exactement à la formation Fondation.",
    lang: "fr",
    tags: ["easy", "quality", "value"],
    photos: [
      { src: img("img-11.jpg"), alt: "Contenu du kit étalé sur un plan de travail" },
      { src: img("mouth-04.jpg"), alt: "Pose d’une gem en cabine avec les outils du kit" },
    ],
    status: "published",
    submittedAt: "2026-07-10T18:40",
    publishedAt: "2026-07-11T09:15",
    helpful: 14,
    response: {
      body: "Merci Camille ! Six poses avec un seul kit, c’est exactement ce pour quoi nous l’avons conçu. Au plaisir de voir vos prochaines réalisations ✨",
      at: "2026-07-11T10:02",
      by: TEAM,
    },
  }),
  seed({
    id: "RV-1202",
    subject: P("starter-kit"),
    customer: C.sophie,
    orderRef: "GT-10198",
    rating: 5,
    title: "Perfect for beginners",
    body: "I bought this kit alongside the Foundation course and the two fit together perfectly. Every tool has a purpose, nothing is filler, and the adhesive is easy to control even for a first-timer.",
    lang: "en",
    tags: ["easy", "quality"],
    photos: [{ src: img("mouth-01.jpg"), alt: "Small crystal gem placed on a front tooth, close-up" }],
    status: "published",
    submittedAt: "2026-06-22T14:18",
    publishedAt: "2026-06-23T08:40",
    helpful: 22,
  }),
  seed({
    id: "RV-1203",
    subject: P("starter-kit"),
    customer: C.marta,
    orderRef: "GT-10233",
    rating: 4,
    title: "Great kit, I ran out of etchant first",
    body: "Good quality across the board. The etching gel is the first thing I ran out of — around fifteen applications — so budget for a refill if you’re busy.",
    lang: "en",
    tags: ["quality", "value"],
    status: "published",
    submittedAt: "2026-08-02T10:40",
    publishedAt: "2026-08-02T15:02",
    helpful: 8,
  }),
  seed({
    id: "RV-1204",
    subject: P("starter-kit"),
    customer: C.julia,
    orderRef: "GT-10301",
    rating: 5,
    title: "Update after two months",
    body: "Edited after two months of use: still the best investment I made when starting out. The tools have held up well and I have since bought the refills separately.",
    lang: "en",
    tags: ["quality", "value"],
    status: "pending",
    submittedAt: "2026-07-21T09:00",
    publishedAt: "2026-07-21T15:30",
    editedAt: "2026-09-21T19:34",
    helpful: 6,
    history: [
      { kind: "submitted", at: "2026-07-21T09:00", by: "Julia K." },
      { kind: "approved", at: "2026-07-21T15:30", by: TEAM },
      { kind: "edited", at: "2026-09-21T19:34", by: "Julia K." },
    ],
  }),
  seed({
    id: "RV-1205",
    subject: P("starter-kit"),
    customer: C.anais,
    orderRef: "GT-10344",
    rating: 3,
    title: "Bon kit mais…",
    body: "Le kit est correct mais la lampe est moins puissante que celle de [autre marque] que j’utilisais avant. Pour le prix, on pourrait attendre mieux.",
    lang: "fr",
    tags: [],
    status: "needsChanges",
    submittedAt: "2026-09-16T08:05",
    changesRequest: "Merci pour votre avis ! Pourriez-vous retirer le nom de l’autre marque ? Le reste de votre retour est tout à fait publiable.",
    history: [
      { kind: "submitted", at: "2026-09-16T08:05", by: "Anaïs P." },
      { kind: "changesRequested", at: "2026-09-16T14:20", by: TEAM_2 },
    ],
  }),

  /* -------------------------------- Gloves ------------------------------ */
  seed({
    id: "RV-1301",
    subject: P("gants"),
    customer: DEMO_CUSTOMER,
    mine: true,
    orderRef: "GT-2026-0129",
    rating: 4,
    title: "Fins et résistants",
    body: "Très bonne sensibilité au bout des doigts pour manipuler les petites gems. Ils taillent un peu grand, prenez une taille en dessous. Voici ma cliente Léa après sa pose !",
    lang: "fr",
    tags: ["quality"],
    photos: [{ src: img("mouth-03.jpg"), alt: "Cliente souriante après sa pose" }],
    status: "needsChanges",
    submittedAt: "2026-09-12T17:30",
    changesRequest:
      "Merci pour votre avis ! Votre photo montre le visage d’une cliente et la nomme. Pourriez-vous la remplacer par un gros plan de la dent, ou retirer la photo et le prénom ? Nous publierons ensuite votre avis.",
    history: [
      { kind: "submitted", at: "2026-09-12T17:30", by: "Camille B." },
      { kind: "changesRequested", at: "2026-09-13T09:10", by: TEAM },
    ],
  }),

  /* ------------------------------- Solitaire ---------------------------- */
  seed({
    id: "RV-1401",
    subject: P("solitaire"),
    customer: C.chloe,
    orderRef: "GT-10398",
    rating: 5,
    title: "Le classique indémodable",
    body: "Brillance incroyable pour le prix. C’est la gem que je propose aux clientes qui hésitent : discrète, élégante, et elle plaît à tout le monde.",
    lang: "fr",
    tags: ["value", "result"],
    status: "published",
    submittedAt: "2026-09-03T12:44",
    publishedAt: "2026-09-03T17:00",
    helpful: 12,
  }),
  seed({
    id: "RV-1402",
    subject: P("solitaire"),
    customer: C.mia,
    orderRef: "GT-10402",
    rating: 4,
    title: "Great sparkle, sizes run small",
    body: "Lovely sparkle and easy to handle with the placement tool. The SS6 is smaller than I expected — check the size guide before ordering.",
    lang: "en",
    tags: ["quality", "easy"],
    status: "published",
    submittedAt: "2026-09-06T15:20",
    publishedAt: "2026-09-07T08:30",
    helpful: 4,
  }),

  /* --------------------------------- Opale ------------------------------ */
  seed({
    id: "RV-1501",
    subject: P("opale"),
    customer: C.camilleR,
    orderRef: "GT-10455",
    rating: 5,
    title: "Mes clientes me la demandent par son nom",
    body: "J’en ai commandé quatre et elles sont toutes parties en une semaine. Les reflets sont différents selon la lumière du jour, c’est ce qui fait tout son charme.",
    lang: "fr",
    tags: ["result", "quality"],
    status: "published",
    submittedAt: "2026-09-15T18:02",
    publishedAt: "2026-09-16T08:45",
    helpful: 6,
  }),
  seed({
    id: "RV-1502",
    subject: P("opale"),
    customer: C.aisling,
    orderRef: "GT-10465",
    rating: 5,
    title: "The opal is unreal in daylight",
    body: "Photos don’t do it justice. In daylight it shifts from milky white to a soft blue-green. Bonded easily and still perfect three weeks on.",
    lang: "en",
    tags: ["result"],
    photos: [{ src: img("mouth-02.jpg"), alt: "Opal gem on a front tooth in daylight" }],
    status: "published",
    submittedAt: "2026-09-16T10:12",
    publishedAt: "2026-09-16T16:30",
    helpful: 9,
  }),
  seed({
    id: "RV-1503",
    subject: P("opale"),
    customer: C.clara,
    orderRef: "GT-10470",
    rating: 4,
    title: "Très belle, un peu fragile à la pince",
    body: "Magnifique une fois posée. Attention en la manipulant : le serti est délicat et j’en ai rayé une avec une pince métallique. Utilisez l’outil en silicone du kit.",
    lang: "fr",
    tags: ["result"],
    status: "pending",
    submittedAt: "2026-09-21T09:30",
  }),

  /* ----------------------------- Other gems ----------------------------- */
  seed({
    id: "RV-1601",
    subject: P("aquamarine"),
    customer: C.nora,
    orderRef: "GT-10452",
    rating: 4,
    title: "Un bleu très doux",
    body: "Le bleu est plus pâle qu’à l’écran mais c’est justement ce qui la rend facile à porter au quotidien. Pose sans difficulté.",
    lang: "fr",
    tags: ["easy"],
    status: "published",
    submittedAt: "2026-09-13T20:18",
    publishedAt: "2026-09-14T09:05",
    helpful: 2,
  }),
  seed({
    id: "RV-1701",
    subject: P("sunflower"),
    customer: C.ines,
    orderRef: "GT-10459",
    rating: 5,
    title: "Parfait pour l’été",
    body: "Couleur solaire, taille parfaite. Mes clientes l’ont adorée pour les festivals.",
    lang: "fr",
    tags: ["result"],
    status: "hidden",
    submittedAt: "2026-09-14T11:40",
    publishedAt: "2026-09-14T16:00",
    helpful: 1,
    notes: [
      {
        id: "N-2",
        body: "Hidden while we check the order: the customer opened a delivery dispute on GT-10459 the same day. Restore once support closes the ticket.",
        at: "2026-09-17T10:30",
        by: TEAM_2,
      },
    ],
    history: [
      { kind: "submitted", at: "2026-09-14T11:40", by: "Inès L." },
      { kind: "approved", at: "2026-09-14T16:00", by: TEAM },
      { kind: "hidden", at: "2026-09-17T10:28", by: TEAM_2, note: "Delivery dispute open on the order." },
    ],
  }),
  seed({
    id: "RV-1801",
    subject: P("capri"),
    customer: C.elodie,
    orderRef: "GT-10462",
    rating: 4,
    title: "Joli contraste sur émail clair",
    body: "Le bleu Capri ressort vraiment bien sur un émail clair. Un peu moins lumineux sur des dents plus foncées, à savoir pour conseiller vos clientes.",
    lang: "fr",
    tags: ["result"],
    status: "published",
    submittedAt: "2026-09-13T13:02",
    publishedAt: "2026-09-13T18:20",
    helpful: 3,
  }),
  seed({
    id: "RV-1901",
    subject: P("peridot"),
    customer: C.theo,
    orderRef: "GT-10450",
    rating: 5,
    title: "Le vert qui change tout",
    body: "Mes clients hommes hésitaient avec les gems « bijou », le Peridot les a convaincus. Discret et original.",
    lang: "fr",
    tags: ["result", "value"],
    status: "published",
    submittedAt: "2026-09-11T19:50",
    publishedAt: "2026-09-12T08:10",
    helpful: 5,
  }),
  seed({
    id: "RV-2001",
    subject: P("bond"),
    customer: C.elena,
    orderRef: "GT-10287",
    rating: 5,
    title: "The only adhesive I trust now",
    body: "Clean cure, no yellowing and it removes cleanly when a client wants a change. Worth every cent for the peace of mind.",
    lang: "en",
    tags: ["quality", "easy"],
    status: "published",
    submittedAt: "2026-08-20T09:12",
    publishedAt: "2026-08-20T14:40",
    helpful: 10,
  }),
  seed({
    id: "RV-2002",
    subject: P("bond"),
    customer: C.manon,
    orderRef: "GT-10412",
    rating: 1,
    title: "Nul",
    body: "Produit nul, service nul, et la personne au téléphone était une vraie [propos injurieux retiré par le système].",
    lang: "fr",
    tags: [],
    status: "rejected",
    submittedAt: "2026-09-08T22:40",
    rejection: { reason: "offensive", internal: "Insult aimed at a named colleague. Support contacted the customer about the order separately." },
    history: [
      { kind: "submitted", at: "2026-09-08T22:40", by: "Manon D." },
      { kind: "rejected", at: "2026-09-09T08:50", by: TEAM, note: "offensive" },
    ],
  }),
  seed({
    id: "RV-2101",
    subject: P("etoile"),
    customer: C.clara,
    orderRef: "GT-10470",
    rating: 5,
    title: "L’étoile qui fait craquer",
    body: "Finition dorée impeccable, la forme est nette même sur une petite taille. Deux clientes l’ont déjà réservée après l’avoir vue sur moi.",
    lang: "fr",
    tags: ["quality", "result"],
    status: "published",
    submittedAt: "2026-09-16T21:00",
    publishedAt: "2026-09-17T09:20",
    helpful: 4,
  }),
  seed({
    id: "RV-2201",
    subject: P("amethyste"),
    customer: C.sofia,
    orderRef: "GT-10445",
    rating: 5,
    title: "Soft lilac, very flattering",
    body: "A gentle lilac that works on almost everyone. My clients who want something subtle love it.",
    lang: "en",
    tags: ["result"],
    status: "published",
    submittedAt: "2026-09-09T10:30",
    publishedAt: "2026-09-09T15:45",
    helpful: 2,
    reports: [
      { id: "RP-4", reason: "irrelevant", details: "I think this review is about the gloves, not the gem.", at: "2026-09-18T13:20", source: "customer", resolved: false },
    ],
    history: [
      { kind: "submitted", at: "2026-09-09T10:30", by: "Sofia D." },
      { kind: "approved", at: "2026-09-09T15:45", by: TEAM },
      { kind: "reported", at: "2026-09-18T13:20", by: "customer", note: "irrelevant" },
    ],
  }),

  /* ------------------------------- Foundation --------------------------- */
  seed({
    id: "RV-3001",
    subject: K("fondation"),
    customer: C.sarah,
    orderRef: "GT-10102",
    rating: 5,
    title: "Absolutely loved the training!",
    body: "I came in with zero experience and finished feeling confident enough to book my first friends-and-family sessions. The enamel prep module alone was worth it — I finally understand why etching time matters.",
    lang: "en",
    tags: ["beginner", "followable", "skills"],
    photos: [{ src: img("mouth-04.jpg"), alt: "My first application after finishing the course, placed in the chair" }],
    status: "published",
    submittedAt: "2026-06-14T17:25",
    publishedAt: "2026-06-15T09:02",
    progressPct: 100,
    helpful: 31,
    response: {
      body: "Thank you so much, Sarah! We’re delighted that the training helped you improve your technique. ✨",
      at: "2026-06-15T10:30",
      by: TEAM,
    },
  }),
  seed({
    id: "RV-3002",
    subject: K("fondation"),
    customer: C.emma,
    orderRef: "GT-10156",
    rating: 5,
    title: "Enfin une formation claire",
    body: "J’avais regardé des dizaines de vidéos gratuites qui se contredisaient. Ici tout est expliqué dans l’ordre, avec le pourquoi de chaque geste. Les quiz obligent à vraiment retenir.",
    lang: "fr",
    tags: ["clear", "beginner", "followable"],
    status: "published",
    submittedAt: "2026-07-05T20:40",
    publishedAt: "2026-07-06T08:30",
    progressPct: 100,
    helpful: 19,
  }),
  seed({
    id: "RV-3003",
    subject: K("fondation"),
    customer: C.laura,
    orderRef: "GT-10177",
    rating: 5,
    title: "Mes poses ont complètement changé",
    body: "Je posais déjà mais mes gems ne tenaient pas plus de quelques semaines. Depuis le module sur l’isolation et le mordançage, aucune n’a bougé. Voici une pose faite la semaine dernière.",
    lang: "fr",
    tags: ["techniques", "skills"],
    photos: [{ src: img("mouth-01.jpg"), alt: "Gem cristal posée sur une incisive, gros plan" }],
    status: "published",
    submittedAt: "2026-07-22T12:10",
    publishedAt: "2026-07-22T16:48",
    progressPct: 100,
    helpful: 16,
  }),
  seed({
    id: "RV-3004",
    subject: K("fondation"),
    customer: C.aisling,
    orderRef: "GT-10478",
    rating: 4,
    title: "Great so far — very thorough",
    body: "Two thirds through. The lessons are short and focused, which suits my schedule. I’d love downloadable checklists for each module to keep at my station.",
    lang: "en",
    tags: ["informative", "followable"],
    status: "published",
    submittedAt: "2026-09-20T21:15",
    publishedAt: "2026-09-21T09:00",
    progressPct: 67,
    helpful: 3,
  }),
  seed({
    id: "RV-3005",
    subject: K("fondation"),
    customer: C.lucie,
    orderRef: "GT-10214",
    rating: 4,
    title: "Très complet, un peu dense",
    body: "Beaucoup d’informations, parfois un peu dense pour une débutante. J’ai revu certaines leçons deux fois, mais c’est aussi l’avantage d’une formation en ligne.",
    lang: "fr",
    tags: ["informative", "highQuality"],
    status: "published",
    submittedAt: "2026-08-09T15:30",
    publishedAt: "2026-08-10T08:20",
    progressPct: 100,
    helpful: 7,
  }),
  seed({
    id: "RV-3006",
    subject: K("fondation"),
    customer: C.freya,
    orderRef: "GT-10251",
    rating: 5,
    title: "Booked my first paying client",
    body: "Finished the course on a Sunday, booked my first paying client the following Friday. The consent and aftercare sections made me feel professional from day one.",
    lang: "en",
    tags: ["skills", "techniques", "highQuality"],
    photos: [{ src: img("mouth-05.jpg"), alt: "Heart gem on a client’s front tooth, my first paid appointment" }],
    status: "published",
    submittedAt: "2026-08-30T19:02",
    publishedAt: "2026-08-31T08:44",
    progressPct: 100,
    helpful: 12,
  }),
  seed({
    id: "RV-3007",
    subject: K("fondation"),
    customer: C.chloe,
    orderRef: "GT-10236",
    rating: 3,
    title: "Bien, mais j’aurais aimé plus de pratique",
    body: "La théorie est très bien faite. Il manque selon moi plus de démonstrations filmées sur de vraies clientes, avec différents types de dents.",
    lang: "fr",
    tags: ["informative"],
    status: "published",
    submittedAt: "2026-08-18T10:44",
    publishedAt: "2026-08-18T15:10",
    progressPct: 100,
    helpful: 8,
    response: {
      body: "Merci Chloé, c’est un retour précieux. Trois nouvelles démonstrations sur cas réels arrivent dans le module 3 cet automne ; vous y aurez accès automatiquement.",
      at: "2026-08-19T09:30",
      by: TEAM_2,
    },
  }),
  seed({
    id: "RV-3008",
    subject: K("fondation"),
    customer: C.mia,
    orderRef: "GT-10338",
    rating: 5,
    title: "Worth every euro",
    body: "Clear, calm and professional. I appreciated that every lesson explains the why, not just the how. The certificate looks great framed in my studio.",
    lang: "en",
    tags: ["clear", "highQuality"],
    status: "pending",
    submittedAt: "2026-09-22T18:20",
    progressPct: 100,
  }),
  seed({
    id: "RV-3009",
    subject: K("fondation"),
    customer: C.olivia,
    orderRef: "GT-10299",
    rating: 5,
    title: "Amazing — DM me for bookings!",
    body: "Loved it. I now do applications in Dublin city centre, message @olivia.gems or call 087 555 0142 to book!",
    lang: "en",
    tags: ["skills"],
    status: "published",
    submittedAt: "2026-09-17T08:40",
    publishedAt: "2026-09-17T12:02",
    progressPct: 100,
    helpful: 0,
    reports: [
      { id: "RP-5", reason: "personal", details: "Contains a phone number.", at: "2026-09-18T19:30", source: "customer", resolved: false },
    ],
    history: [
      { kind: "submitted", at: "2026-09-17T08:40", by: "Olivia J." },
      { kind: "approved", at: "2026-09-17T12:02", by: TEAM_2 },
      { kind: "reported", at: "2026-09-18T19:30", by: "customer", note: "personal" },
    ],
  }),

  /* -------------------------------- Advanced ---------------------------- */
  seed({
    id: "RV-3101",
    subject: K("avance"),
    customer: C.laura,
    orderRef: "GT-10290",
    rating: 5,
    title: "Les compositions multi-gems, enfin maîtrisées",
    body: "Le module sur l’alignement des compositions m’a fait gagner un temps fou. Je propose maintenant des poses à trois gems en toute confiance.",
    lang: "fr",
    tags: ["techniques", "skills"],
    status: "published",
    submittedAt: "2026-09-05T16:00",
    publishedAt: "2026-09-06T08:30",
    progressPct: 100,
    helpful: 6,
  }),
  seed({
    id: "RV-3102",
    subject: K("avance"),
    customer: C.sophie,
    orderRef: "GT-10319",
    rating: 4,
    title: "Challenging in the best way",
    body: "Definitely not for beginners — do the Foundation first. The difficult-cases lessons are gold.",
    lang: "en",
    tags: ["techniques", "informative"],
    status: "published",
    submittedAt: "2026-09-12T14:22",
    publishedAt: "2026-09-12T18:00",
    progressPct: 78,
    helpful: 4,
  }),
  seed({
    id: "RV-3103",
    subject: K("avance"),
    customer: C.theo,
    orderRef: "GT-10461",
    rating: 5,
    title: "Idéal après la Fondation",
    body: "La suite logique. Les corrections de pose ratées m’ont été très utiles avec une cliente venue d’un autre studio.",
    lang: "fr",
    tags: ["skills", "highQuality"],
    status: "published",
    submittedAt: "2026-09-18T09:14",
    publishedAt: "2026-09-18T14:50",
    progressPct: 56,
    helpful: 1,
  }),

  /* -------------------------------- Business ---------------------------- */
  seed({
    id: "RV-3201",
    subject: K("business"),
    customer: DEMO_CUSTOMER,
    mine: true,
    orderRef: "GT-2026-0061",
    rating: 5,
    title: "Mes tarifs sont enfin justifiés",
    body: "Mise à jour : six mois après, j’applique toujours la grille tarifaire du module 2. Mon chiffre d’affaires a augmenté et je n’ai plus peur d’annoncer mes prix. Les modèles de consentement sont un vrai plus.",
    lang: "fr",
    tags: ["informative", "skills"],
    status: "pending",
    submittedAt: "2026-04-14T19:20",
    publishedAt: "2026-04-15T09:00",
    editedAt: "2026-09-20T21:05",
    progressPct: 100,
    helpful: 9,
    history: [
      { kind: "submitted", at: "2026-04-14T19:20", by: "Camille B." },
      { kind: "approved", at: "2026-04-15T09:00", by: TEAM },
      { kind: "edited", at: "2026-09-20T21:05", by: "Camille B." },
    ],
  }),
  seed({
    id: "RV-3202",
    subject: K("business"),
    customer: C.clara,
    orderRef: "GT-10449",
    rating: 5,
    title: "Indispensable pour se lancer",
    body: "Hygiène, consentement, photos : tout ce qu’on n’apprend pas ailleurs. Les modèles fournis m’ont fait gagner des heures.",
    lang: "fr",
    tags: ["informative", "highQuality"],
    status: "published",
    submittedAt: "2026-09-12T20:10",
    publishedAt: "2026-09-13T08:35",
    progressPct: 100,
    helpful: 5,
  }),
  seed({
    id: "RV-3203",
    subject: K("business"),
    customer: C.elena,
    orderRef: "GT-10266",
    rating: 4,
    title: "Practical and to the point",
    body: "Short lessons with templates you can use the same day. The photography lesson improved my Instagram more than any course I paid three times as much for.",
    lang: "en",
    tags: ["informative", "skills"],
    status: "published",
    submittedAt: "2026-08-27T11:30",
    publishedAt: "2026-08-27T16:15",
    progressPct: 100,
    helpful: 6,
  }),
  seed({
    id: "RV-3204",
    subject: K("business"),
    customer: C.manon,
    orderRef: "GT-10248",
    rating: 2,
    title: "Trop général pour moi",
    body: "J’ai déjà un studio depuis trois ans et j’ai trouvé le contenu trop basique. Probablement très bien pour quelqu’un qui débute.",
    lang: "fr",
    tags: [],
    status: "published",
    submittedAt: "2026-08-05T13:40",
    publishedAt: "2026-08-05T17:22",
    progressPct: 100,
    helpful: 11,
    response: {
      body: "Merci Manon pour votre franchise. Vous avez raison : ce kit vise les artistes qui se lancent. Un module avancé sur la gestion d’équipe est en préparation, nous vous le signalerons.",
      at: "2026-08-06T09:15",
      by: TEAM,
    },
  }),
];
