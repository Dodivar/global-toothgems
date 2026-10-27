import { describe, expect, it } from "vitest";
import fr from "../../i18n/locales/studioWorkspace.fr.json";
import en from "../../i18n/locales/studioWorkspace.en.json";
import {
  HELP_CHAPTERS,
  helpTopicFromHash,
  matchesHelpQuery,
  requestHelpTopic,
  studioHelpPath,
  subscribeHelpRequests,
  takeRequestedHelpTopic,
} from "./helpTopics";

const topicIds = HELP_CHAPTERS.flatMap((chapter) => chapter.topics.map((topic) => topic.id));

describe("help topics", () => {
  it("gives every topic a unique id", () => {
    expect(new Set(topicIds).size).toBe(topicIds.length);
  });

  it.each([
    ["fr", fr],
    ["en", en],
  ])("has the copy of every chapter and topic in %s", (_, locale) => {
    const help = locale.help as unknown as {
      chapters: Record<string, { title: string; sub: string }>;
      topics: Record<string, { title: string; body: string[]; points?: string[] }>;
    };
    for (const chapter of HELP_CHAPTERS) {
      expect(help.chapters[chapter.id]?.title, chapter.id).toBeTruthy();
      expect(help.chapters[chapter.id]?.sub, chapter.id).toBeTruthy();
    }
    for (const id of topicIds) {
      expect(help.topics[id]?.title, id).toBeTruthy();
      expect(help.topics[id]?.body.length, id).toBeGreaterThan(0);
    }
    expect(Object.keys(help.topics).sort()).toEqual([...topicIds].sort());
  });

  it("opens the help page on a known topic only", () => {
    expect(studioHelpPath()).toBe("/studio-3d/atelier/aide");
    expect(studioHelpPath("mirror")).toBe("/studio-3d/atelier/aide#mirror");
    expect(studioHelpPath("nope")).toBe("/studio-3d/atelier/aide");
    expect(helpTopicFromHash("#mirror")).toBe("mirror");
    expect(helpTopicFromHash("#nope")).toBeNull();
    expect(helpTopicFromHash("")).toBeNull();
  });

  it("matches every word of a query, accents and case folded", () => {
    expect(matchesHelpQuery("La distance à l’émail", "EMAIL distance")).toBe(true);
    expect(matchesHelpQuery("La distance à l’émail", "émail miroir")).toBe(false);
    expect(matchesHelpQuery("anything", "  ")).toBe(true);
  });

  it("hands a requested topic over once", () => {
    let calls = 0;
    const unsubscribe = subscribeHelpRequests(() => calls++);
    requestHelpTopic("layout");
    unsubscribe();
    requestHelpTopic("mirror");
    expect(calls).toBe(1);
    expect(takeRequestedHelpTopic()).toBe("mirror");
    expect(takeRequestedHelpTopic()).toBeNull();
  });
});
