import { studioSectionPath } from "../studioUrl";

/**
 * The Studio's help guide (`/studio-3d/atelier/aide`): every feature that is
 * not obvious at first sight, explained in a folded topic, grouped in
 * chapters. The copy lives under `studio.workspace.help.chapters.<id>` and
 * `studio.workspace.help.topics.<id>` (`title`, `body` paragraphs, optional
 * `points`).
 *
 * The page is where every explanation button leads (`HelpHint`, the editor's
 * info bubbles): they open it on their topic with `#<topic id>`.
 */

/** The plan a topic's feature needs, shown as a tag (decision 113); none = every plan. */
export type HelpPlan = "artist" | "atelier";

export interface HelpTopic {
  id: string;
  plan?: HelpPlan;
  /** A staff-only tool: the topic is shown to active staff only. */
  staffOnly?: boolean;
}

export interface HelpChapter {
  id: string;
  topics: HelpTopic[];
}

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    id: "stage",
    topics: [{ id: "dentition" }, { id: "camera" }, { id: "importModel", staffOnly: true }],
  },
  {
    id: "placing",
    topics: [{ id: "library" }, { id: "noOverlap" }, { id: "sizes" }, { id: "colors" }, { id: "rotation" }, { id: "standoff" }],
  },
  {
    id: "compose",
    topics: [{ id: "multiSelect" }, { id: "quickActions" }, { id: "mirror" }, { id: "layout" }, { id: "undo" }],
  },
  {
    id: "organize",
    topics: [{ id: "saving" }, { id: "gemGroups" }, { id: "collections", plan: "artist" }, { id: "templates", plan: "artist" }],
  },
  {
    id: "prepare",
    topics: [{ id: "frontView" }, { id: "placementSheet" }, { id: "estimate" }, { id: "shoppingList" }, { id: "exports" }],
  },
  {
    id: "share",
    topics: [{ id: "shareLink" }, { id: "socialPost" }, { id: "tryOn", plan: "atelier" }],
  },
  {
    id: "glowbook",
    topics: [
      { id: "glowbookBasics", plan: "atelier" },
      { id: "glowbookLook", plan: "atelier" },
      { id: "glowbookSections", plan: "atelier" },
      { id: "glowbookPlace", plan: "atelier" },
      { id: "glowbookShare", plan: "atelier" },
    ],
  },
  {
    id: "account",
    topics: [{ id: "trial" }, { id: "plans" }, { id: "subscription" }],
  },
];

export type HelpTopicId = string;

const TOPIC_IDS = new Set(HELP_CHAPTERS.flatMap((c) => c.topics.map((t) => t.id)));

export function isHelpTopic(id: string | null | undefined): id is HelpTopicId {
  return !!id && TOPIC_IDS.has(id);
}

/** The help page, opened on `topic` when given. */
export function studioHelpPath(topic?: HelpTopicId): string {
  const path = studioSectionPath("help");
  return topic && isHelpTopic(topic) ? `${path}#${topic}` : path;
}

/** The topic an address fragment (`#mirror`) names, or null. */
export function helpTopicFromHash(hash: string): HelpTopicId | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return isHelpTopic(id) ? id : null;
}

/** Lower case, accents and punctuation folded: "Écart à l’émail" ~ "ecart a l email". */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether `text` holds every word of `query` (in any order); an empty query matches everything. */
export function matchesHelpQuery(text: string, query: string): boolean {
  const words = foldForSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = foldForSearch(text);
  return words.every((word) => haystack.includes(word));
}

/*
 * A topic asked for by a button elsewhere in the workspace. The address
 * fragment says it too, but a client-side navigation may not have written it
 * yet when the help page mounts, so the request is also held here.
 */
let requested: HelpTopicId | null = null;
const listeners = new Set<() => void>();

export function requestHelpTopic(id: HelpTopicId) {
  requested = id;
  listeners.forEach((listener) => listener());
}

/** The pending request, cleared once read. */
export function takeRequestedHelpTopic(): HelpTopicId | null {
  const id = requested;
  requested = null;
  return id;
}

export function subscribeHelpRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
