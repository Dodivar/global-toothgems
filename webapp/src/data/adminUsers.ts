import type { Localized } from "./types";

/**
 * Administration users — the people who work *in* the back office.
 *
 * Kept apart from `adminCustomers.ts` on purpose. A customer buys and studies; a
 * user operates the platform. They are different identities with different
 * lifetimes, and `lib/adminAuth.tsx` already makes the same separation for the
 * signed-in administrator. Merging the two lists here would let the prototype
 * suggest that granting a role to a customer account is a normal thing to do.
 *
 * Everything in this file is fictional mock data. Roles here are a UX
 * vocabulary, not authorization: the real product resolves a user's role on the
 * server and enforces it with RBAC and PostgreSQL RLS (`AGENTS.md` sections 7
 * and 12). Nothing in this file may ever be read as a permission check.
 */

/* -------------------------------------------------------------------------- */
/* Roles and permissions                                                      */
/* -------------------------------------------------------------------------- */

/** Ordered from least to most access — the order the role picker shows. */
export const USER_ROLES = ["readOnly", "manager", "administrator"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "invited", "suspended"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * The permissions the comparison table lists, in reading order: the three
 * "view" rows that every role shares come first, so the difference between
 * roles is concentrated at the bottom where the eye lands last.
 */
export const PERMISSIONS = [
  "viewDashboard",
  "viewUsers",
  "viewStatistics",
  "manageUsers",
  "manageProducts",
  "manageTraining",
  "manageSettings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Which role grants what.
 *
 * One table, read by the matrix, the role picker, the permission summary on a
 * user's profile and the role-change confirmation — so the consequences the
 * confirmation spells out can never disagree with the table on the same page.
 */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  readOnly: new Set<Permission>(["viewDashboard", "viewUsers", "viewStatistics"]),
  manager: new Set<Permission>([
    "viewDashboard",
    "viewUsers",
    "viewStatistics",
    "manageUsers",
    "manageProducts",
    "manageTraining",
  ]),
  administrator: new Set<Permission>(PERMISSIONS),
};

export function roleRank(role: UserRole): number {
  return USER_ROLES.indexOf(role);
}

/** What moving from one role to another adds and removes. */
export function permissionDiff(from: UserRole, to: UserRole): { gained: Permission[]; lost: Permission[] } {
  const before = ROLE_PERMISSIONS[from];
  const after = ROLE_PERMISSIONS[to];
  return {
    gained: PERMISSIONS.filter((p) => after.has(p) && !before.has(p)),
    lost: PERMISSIONS.filter((p) => before.has(p) && !after.has(p)),
  };
}

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

export const USER_TEAMS = ["leadership", "operations", "academy", "customerCare", "marketing", "finance"] as const;
export type UserTeam = (typeof USER_TEAMS)[number];

/**
 * One entry in a user's recent activity.
 *
 * Stored as a translation key plus parameters rather than a sentence, so the
 * history reads in whichever language the administrator is using — including
 * the entries this session writes when a role or status changes.
 */
export interface UserActivity {
  id: string;
  at: string;
  kind: UserActivityKind;
  params?: Record<string, string>;
}

export type UserActivityKind =
  | "signedIn"
  | "viewedDashboard"
  | "viewedStatistics"
  | "viewedOrders"
  | "viewedCustomers"
  | "updatedOrder"
  | "updatedStock"
  | "updatedProduct"
  | "publishedLesson"
  | "updatedCourse"
  | "repliedCustomer"
  | "exportedOrders"
  | "changedSettings"
  | "invitedUser"
  | "uploadedMedia"
  /* Written by this session. */
  | "accountCreated"
  | "invitationSent"
  | "invitationResent"
  | "profileUpdated"
  | "roleChanged"
  | "activated"
  | "suspended"
  | "reactivated";

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  jobTitle: Localized;
  team: UserTeam;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp, or null for an invitation that has never been accepted. */
  lastActiveAt: string | null;
  invitedBy: string | null;
  twoFactor: boolean;
  /** Recent activity, newest first. */
  activity: UserActivity[];
}

/**
 * The seeded users.
 *
 * Dates are offsets from the moment the page loads rather than fixed calendar
 * dates. "Last active 2 h ago" is only honest if it is measured against the same
 * clock the activity filter uses, and a fixed date would leave every account
 * looking dormant a fortnight after this file was written.
 */
interface Seed {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  jobTitle: Localized;
  team: UserTeam;
  createdDaysAgo: number;
  /** Minutes since the last activity; null when the invitation is pending. */
  activeMinutesAgo: number | null;
  invitedBy: string | null;
  twoFactor: boolean;
}

const H = 60;
const D = 24 * H;

const SEEDS: Seed[] = [
  { id: "u-camille", firstName: "Camille", lastName: "Dubois", role: "administrator", status: "active", jobTitle: { fr: "Fondatrice & directrice", en: "Founder & Director" }, team: "leadership", createdDaysAgo: 912, activeMinutesAgo: 4, invitedBy: null, twoFactor: true },
  { id: "u-hugo", firstName: "Hugo", lastName: "Marchand", role: "administrator", status: "active", jobTitle: { fr: "Directeur des opérations", en: "Head of Operations" }, team: "operations", createdDaysAgo: 834, activeMinutesAgo: 52, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-ines", firstName: "Inès", lastName: "Benali", role: "manager", status: "active", jobTitle: { fr: "Responsable Academy", en: "Academy Lead" }, team: "academy", createdDaysAgo: 730, activeMinutesAgo: 6 * H + 15, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-lea", firstName: "Léa", lastName: "Fontaine", role: "manager", status: "active", jobTitle: { fr: "Responsable e-commerce", en: "E-commerce Manager" }, team: "operations", createdDaysAgo: 652, activeMinutesAgo: D - 90, invitedBy: "Hugo Marchand", twoFactor: true },
  { id: "u-thomas", firstName: "Thomas", lastName: "Girard", role: "readOnly", status: "active", jobTitle: { fr: "Expert-comptable", en: "Accountant" }, team: "finance", createdDaysAgo: 596, activeMinutesAgo: 4 * D + 8 * H, invitedBy: "Camille Dubois", twoFactor: false },
  { id: "u-sofia", firstName: "Sofia", lastName: "Moreau", role: "manager", status: "active", jobTitle: { fr: "Responsable service client", en: "Customer Care Lead" }, team: "customerCare", createdDaysAgo: 575, activeMinutesAgo: 78, invitedBy: "Hugo Marchand", twoFactor: true },
  { id: "u-nathan", firstName: "Nathan", lastName: "Rousseau", role: "readOnly", status: "invited", jobTitle: { fr: "Stagiaire marketing", en: "Marketing Intern" }, team: "marketing", createdDaysAgo: 2, activeMinutesAgo: null, invitedBy: "Mia Schmitt", twoFactor: false },
  { id: "u-amelie", firstName: "Amélie", lastName: "Laurent", role: "manager", status: "active", jobTitle: { fr: "Formatrice principale", en: "Head Trainer" }, team: "academy", createdDaysAgo: 540, activeMinutesAgo: 2 * D + 3 * H, invitedBy: "Inès Benali", twoFactor: true },
  { id: "u-yanis", firstName: "Yanis", lastName: "Haddad", role: "readOnly", status: "active", jobTitle: { fr: "Analyste de données", en: "Data Analyst" }, team: "finance", createdDaysAgo: 497, activeMinutesAgo: 7 * H, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-chloe", firstName: "Chloé", lastName: "Petit", role: "manager", status: "suspended", jobTitle: { fr: "Productrice de contenu", en: "Content Producer" }, team: "marketing", createdDaysAgo: 582, activeMinutesAgo: 76 * D, invitedBy: "Camille Dubois", twoFactor: false },
  { id: "u-maxime", firstName: "Maxime", lastName: "Lefèvre", role: "readOnly", status: "active", jobTitle: { fr: "Coordinateur entrepôt", en: "Warehouse Coordinator" }, team: "operations", createdDaysAgo: 449, activeMinutesAgo: 6 * D + 9 * H, invitedBy: "Hugo Marchand", twoFactor: false },
  { id: "u-zoe", firstName: "Zoé", lastName: "Mercier", role: "manager", status: "active", jobTitle: { fr: "Responsable réseaux sociaux", en: "Social Media Manager" }, team: "marketing", createdDaysAgo: 470, activeMinutesAgo: 3 * H + 40, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-julien", firstName: "Julien", lastName: "Faure", role: "administrator", status: "active", jobTitle: { fr: "Responsable technique", en: "Technical Lead" }, team: "leadership", createdDaysAgo: 870, activeMinutesAgo: 3 * D - 4 * H, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-manon", firstName: "Manon", lastName: "Garnier", role: "readOnly", status: "active", jobTitle: { fr: "Conseillère service client", en: "Customer Care Agent" }, team: "customerCare", createdDaysAgo: 408, activeMinutesAgo: 8 * H + 10, invitedBy: "Sofia Moreau", twoFactor: false },
  { id: "u-lucas", firstName: "Lucas", lastName: "Bonnet", role: "readOnly", status: "suspended", jobTitle: { fr: "Préparateur saisonnier", en: "Seasonal Packer" }, team: "operations", createdDaysAgo: 317, activeMinutesAgo: 250 * D, invitedBy: "Gabriel Roux", twoFactor: false },
  { id: "u-emma", firstName: "Emma", lastName: "Chevalier", role: "manager", status: "active", jobTitle: { fr: "Formatrice", en: "Trainer" }, team: "academy", createdDaysAgo: 429, activeMinutesAgo: 5 * D + 2 * H, invitedBy: "Inès Benali", twoFactor: true },
  { id: "u-adam", firstName: "Adam", lastName: "Mansouri", role: "readOnly", status: "invited", jobTitle: { fr: "Photographe indépendant", en: "Freelance Photographer" }, team: "marketing", createdDaysAgo: 6, activeMinutesAgo: null, invitedBy: "Zoé Mercier", twoFactor: false },
  { id: "u-clara", firstName: "Clara", lastName: "Nguyen", role: "manager", status: "active", jobTitle: { fr: "Responsable partenariats", en: "Partnerships Manager" }, team: "leadership", createdDaysAgo: 380, activeMinutesAgo: 8 * D + 5 * H, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-louis", firstName: "Louis", lastName: "Perrin", role: "readOnly", status: "active", jobTitle: { fr: "Aide-comptable", en: "Bookkeeper" }, team: "finance", createdDaysAgo: 352, activeMinutesAgo: 26 * D, invitedBy: "Thomas Girard", twoFactor: false },
  { id: "u-jade", firstName: "Jade", lastName: "Robin", role: "readOnly", status: "active", jobTitle: { fr: "Conseillère service client", en: "Customer Care Agent" }, team: "customerCare", createdDaysAgo: 233, activeMinutesAgo: D + 4 * H, invitedBy: "Sofia Moreau", twoFactor: true },
  { id: "u-noah", firstName: "Noah", lastName: "Lambert", role: "manager", status: "invited", jobTitle: { fr: "Formateur", en: "Trainer" }, team: "academy", createdDaysAgo: 1, activeMinutesAgo: null, invitedBy: "Inès Benali", twoFactor: false },
  { id: "u-alice", firstName: "Alice", lastName: "Barbier", role: "readOnly", status: "active", jobTitle: { fr: "Contrôleuse qualité", en: "Quality Inspector" }, team: "operations", createdDaysAgo: 191, activeMinutesAgo: 48 * D, invitedBy: "Gabriel Roux", twoFactor: false },
  { id: "u-gabriel", firstName: "Gabriel", lastName: "Roux", role: "manager", status: "active", jobTitle: { fr: "Responsable logistique", en: "Logistics Manager" }, team: "operations", createdDaysAgo: 296, activeMinutesAgo: 9 * H, invitedBy: "Hugo Marchand", twoFactor: true },
  { id: "u-lina", firstName: "Lina", lastName: "Dupuis", role: "readOnly", status: "active", jobTitle: { fr: "Formatrice junior", en: "Junior Trainer" }, team: "academy", createdDaysAgo: 163, activeMinutesAgo: 7 * D - 2 * H, invitedBy: "Amélie Laurent", twoFactor: false },
  { id: "u-raphael", firstName: "Raphaël", lastName: "Colin", role: "readOnly", status: "suspended", jobTitle: { fr: "Ancien prestataire", en: "Former Contractor" }, team: "marketing", createdDaysAgo: 546, activeMinutesAgo: 128 * D, invitedBy: "Zoé Mercier", twoFactor: false },
  { id: "u-mia", firstName: "Mia", lastName: "Schmitt", role: "manager", status: "active", jobTitle: { fr: "Designer de marque", en: "Brand Designer" }, team: "marketing", createdDaysAgo: 247, activeMinutesAgo: 2 * H + 25, invitedBy: "Camille Dubois", twoFactor: true },
  { id: "u-arthur", firstName: "Arthur", lastName: "Henry", role: "readOnly", status: "invited", jobTitle: { fr: "Assistant financier", en: "Finance Assistant" }, team: "finance", createdDaysAgo: 14, activeMinutesAgo: null, invitedBy: "Thomas Girard", twoFactor: false },
  { id: "u-sarah", firstName: "Sarah", lastName: "Klein", role: "readOnly", status: "active", jobTitle: { fr: "Conseillère service client (EN)", en: "Customer Care Agent (EN)" }, team: "customerCare", createdDaysAgo: 135, activeMinutesAgo: 2 * D + 8 * H, invitedBy: "Sofia Moreau", twoFactor: true },
];

/** The signed-in administrator's own record. Guards in the UI refer to it. */
export const CURRENT_USER_ID = "u-camille";

/* -------------------------------------------------------------------------- */
/* Seeded activity                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What each team's work looks like in the log.
 *
 * Read-only accounts only ever get "viewed" entries: a history that shows a
 * read-only user editing a product would contradict the permission summary
 * printed right above it.
 */
const TEAM_ACTIONS: Record<UserTeam, { kind: UserActivityKind; params?: Record<string, string> }[]> = {
  leadership: [
    { kind: "changedSettings", params: { area: "shipping" } },
    { kind: "viewedStatistics" },
    { kind: "invitedUser", params: { name: "Noah Lambert" } },
  ],
  operations: [
    { kind: "updatedOrder", params: { reference: "GT-10482" } },
    { kind: "updatedStock", params: { product: "Crystal Round 2 mm" } },
    { kind: "exportedOrders" },
  ],
  academy: [
    { kind: "publishedLesson", params: { lesson: "Placement & curing" } },
    { kind: "updatedCourse", params: { course: "Tooth Gem Masterclass" } },
    { kind: "viewedCustomers" },
  ],
  customerCare: [
    { kind: "repliedCustomer", params: { name: "Clara Vidal" } },
    { kind: "updatedOrder", params: { reference: "GT-10477" } },
    { kind: "viewedOrders" },
  ],
  marketing: [
    { kind: "updatedProduct", params: { product: "Heart Opal Gem" } },
    { kind: "uploadedMedia", params: { count: "6" } },
    { kind: "viewedStatistics" },
  ],
  finance: [
    { kind: "exportedOrders" },
    { kind: "viewedStatistics" },
    { kind: "viewedOrders" },
  ],
};

const READ_ONLY_ACTIONS: UserActivityKind[] = ["viewedDashboard", "viewedStatistics", "viewedOrders", "viewedCustomers"];

function minutesAgo(loadedAt: number, minutes: number): string {
  return new Date(loadedAt - minutes * 60_000).toISOString();
}

function seededActivity(seed: Seed, loadedAt: number): UserActivity[] {
  const createdMinutes = seed.createdDaysAgo * D;
  const entries: UserActivity[] = [];

  if (seed.activeMinutesAgo !== null) {
    const actions = seed.role === "readOnly"
      ? READ_ONLY_ACTIONS.map((kind) => ({ kind, params: undefined }))
      : TEAM_ACTIONS[seed.team];
    // Spacing grows with each step back so the log reads like a working week
    // rather than a burst: minutes apart at the top, days apart at the bottom.
    let cursor = seed.activeMinutesAgo;
    for (let i = 0; i < 5; i += 1) {
      if (cursor >= createdMinutes) break;
      const action = i % 2 === 1 ? { kind: "signedIn" as const, params: undefined } : actions[(i / 2) % actions.length];
      entries.push({ id: `${seed.id}-a${i}`, at: minutesAgo(loadedAt, cursor), kind: action.kind, params: action.params });
      cursor += (i + 1) * 7 * H + (seed.id.length * 37) % 180;
    }
  }

  entries.push({
    id: `${seed.id}-created`,
    at: minutesAgo(loadedAt, createdMinutes),
    kind: seed.invitedBy ? "invitationSent" : "accountCreated",
    params: seed.invitedBy ? { by: seed.invitedBy } : undefined,
  });

  return entries;
}

function buildUsers(): AdminUser[] {
  const loadedAt = Date.now();
  return SEEDS.map((seed) => ({
    id: seed.id,
    firstName: seed.firstName,
    lastName: seed.lastName,
    email: emailFor(seed.firstName, seed.lastName),
    role: seed.role,
    status: seed.status,
    jobTitle: seed.jobTitle,
    team: seed.team,
    createdAt: minutesAgo(loadedAt, seed.createdDaysAgo * D),
    lastActiveAt: seed.activeMinutesAgo === null ? null : minutesAgo(loadedAt, seed.activeMinutesAgo),
    invitedBy: seed.invitedBy,
    twoFactor: seed.twoFactor,
    activity: seededActivity(seed, loadedAt),
  }));
}

export const ADMIN_USERS: AdminUser[] = buildUsers();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** `prenom.nom@globaltoothgems.com`, accents stripped. */
export function emailFor(firstName: string, lastName: string): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${slug(firstName)}.${slug(lastName)}@globaltoothgems.com`;
}

export function userName(user: Pick<AdminUser, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function userInitials(user: Pick<AdminUser, "firstName" | "lastName">): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() || "?";
}

/**
 * A stable pastel for the avatar, chosen from the id — the same rule as the
 * customer avatars, so a person keeps one colour across the table, the card,
 * the drawer and a reload. Fuchsia is left out: on this page it is kept for
 * the "you" marker, and a fuchsia avatar beside it would blur the one accent
 * the page spends on purpose.
 */
const AVATAR_TINTS = [
  "var(--gt-blue-200)",
  "var(--gt-emerald-300)",
  "var(--gt-blue-300)",
  "var(--gt-amber-400)",
  "var(--gt-ink-200)",
  "var(--gt-blue-100)",
];

export function userAvatarTint(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i) * (i + 1);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

/** Plausible email check — the real one is the server's, and a sent invitation. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
