/**
 * Paths of the community, in one place.
 *
 * The forum lives under `/compte` because it is part of the member area, but it
 * carries its own layout rather than nesting inside the account sidebar — two
 * sidebars on one screen is the failure mode that makes forum software feel
 * like software. Every link goes through these helpers, so the shape of the
 * route can change without a search across a dozen files.
 */

export const COMMUNITY_ROOT = "/compte/communaute";

export function channelPath(channelId: string): string {
  return `${COMMUNITY_ROOT}/canal/${channelId}`;
}

export function discussionPath(discussionId: string): string {
  return `${COMMUNITY_ROOT}/discussion/${discussionId}`;
}

/** The three views of "Your activity", keyed by their URL segment. */
export const ACTIVITY_VIEWS = ["discussions", "reponses", "enregistrees"] as const;
export type ActivityView = (typeof ACTIVITY_VIEWS)[number];

export function activityPath(view: ActivityView): string {
  return `${COMMUNITY_ROOT}/activite/${view}`;
}

export const MEMBERS_PATH = `${COMMUNITY_ROOT}/membres`;
export const GUIDELINES_PATH = `${COMMUNITY_ROOT}/charte`;
