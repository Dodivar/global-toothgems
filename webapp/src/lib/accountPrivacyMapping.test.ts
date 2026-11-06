import { describe, expect, it } from "vitest";
import {
  archiveFileName,
  archiveFiles,
  hasPasswordSignIn,
  readBlockers,
  readDeleteAnswer,
  readExportAnswer,
  withFileLinks,
} from "./accountPrivacyMapping";

describe("readExportAnswer", () => {
  it("reads an archive and a too-soon answer", () => {
    expect(readExportAnswer({ status: "ok", archive: { format: "x" } })).toEqual({ kind: "ok", archive: { format: "x" } });
    expect(readExportAnswer({ status: "too_soon", retry_at: "2026-11-06T20:05:00Z" })).toEqual({
      kind: "tooSoon",
      retryAt: "2026-11-06T20:05:00Z",
    });
  });

  it("treats anything else as an error", () => {
    expect(readExportAnswer(null)).toEqual({ kind: "error" });
    expect(readExportAnswer({ status: "ok", archive: [] })).toEqual({ kind: "error" });
    expect(readExportAnswer({ status: "too_soon", retry_at: "soon" })).toEqual({ kind: "error" });
  });
});

describe("readBlockers", () => {
  it("keeps the known blockers once each, in a stable order", () => {
    expect(readBlockers(["order_payment_pending", "staff", "staff", "unknown", 3])).toEqual(["staff", "order_payment_pending"]);
    expect(readBlockers(["sign_in_required"])).toEqual([]);
    expect(readBlockers("staff")).toEqual([]);
  });
});

describe("readDeleteAnswer", () => {
  it("maps each answer of delete-account", () => {
    expect(readDeleteAnswer(200, { status: "deleted" })).toEqual({ kind: "deleted" });
    expect(readDeleteAnswer(409, { error: "blocked", blockers: ["studio_subscription"] })).toEqual({
      kind: "blocked",
      blockers: ["studio_subscription"],
    });
    expect(readDeleteAnswer(403, { error: "reauthentication_required" })).toEqual({ kind: "reauthenticate" });
    expect(readDeleteAnswer(401, { error: "session_expired" })).toEqual({ kind: "signedOut" });
  });

  it("never reads success from a failed or unknown answer", () => {
    expect(readDeleteAnswer(200, { status: "pending" })).toEqual({ kind: "error" });
    expect(readDeleteAnswer(500, { status: "deleted" })).toEqual({ kind: "error" });
    expect(readDeleteAnswer(409, { error: "blocked", blockers: ["mystery"] })).toEqual({ kind: "error" });
  });
});

describe("archive files", () => {
  const archive = {
    format: "global-toothgems-personal-data/2",
    files: [
      { bucket: "avatars", path: "u/me.png", size: 10 },
      { bucket: "review-photos", path: "u/r.jpg" },
      { bucket: 4 },
    ],
  };

  it("lists the files and adds the links that could be signed", () => {
    expect(archiveFiles(archive)).toEqual([
      { bucket: "avatars", path: "u/me.png" },
      { bucket: "review-photos", path: "u/r.jpg" },
    ]);
    const linked = withFileLinks(archive, new Map([["avatars/u/me.png", "https://signed/me"]]), "2026-11-13T00:00:00Z");
    expect(linked.files).toEqual([
      { bucket: "avatars", path: "u/me.png", size: 10, download_url: "https://signed/me" },
      { bucket: "review-photos", path: "u/r.jpg" },
      { bucket: 4 },
    ]);
    expect(linked.file_links_expire_at).toBe("2026-11-13T00:00:00Z");
    expect(withFileLinks(archive, new Map(), "x").file_links_expire_at).toBeNull();
  });

  it("names the file after the day it was made", () => {
    expect(archiveFileName("2026-11-06T19:00:00Z")).toBe("global-toothgems-mes-donnees-2026-11-06.json");
    expect(archiveFileName("")).toBe("global-toothgems-mes-donnees-export.json");
  });
});

describe("hasPasswordSignIn", () => {
  it("is true only with the e-mail provider", () => {
    expect(hasPasswordSignIn(["email", "google"])).toBe(true);
    expect(hasPasswordSignIn(["google"])).toBe(false);
    expect(hasPasswordSignIn(undefined)).toBe(false);
  });
});
