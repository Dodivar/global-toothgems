import { describe, expect, it } from "vitest";
import { attachmentProblem, MAX_ATTACHMENTS_BYTES, mergeAttachments } from "./attachments";

const file = (name: string, size = 1000) => ({ name, size, lastModified: 1 });

describe("attachmentProblem", () => {
  it("accepts nothing, or up to 5 JPG/PNG/PDF files within 20 MB in all", () => {
    expect(attachmentProblem([])).toBeNull();
    expect(attachmentProblem([file("a.jpg"), file("b.JPEG"), file("c.png"), file("d.pdf"), file("e.PDF")])).toBeNull();
    expect(attachmentProblem([file("a.pdf", MAX_ATTACHMENTS_BYTES)])).toBeNull();
  });

  it("refuses a sixth file", () => {
    expect(attachmentProblem(Array.from({ length: 6 }, (_, i) => file(`${i}.png`)))).toBe("count");
  });

  it("counts the size of all files together", () => {
    expect(attachmentProblem([file("a.pdf", MAX_ATTACHMENTS_BYTES / 2), file("b.pdf", MAX_ATTACHMENTS_BYTES / 2 + 1)])).toBe("size");
  });

  it("refuses other types, whatever the count", () => {
    expect(attachmentProblem([file("a.exe")])).toBe("type");
    expect(attachmentProblem([file("noextension")])).toBe("type");
  });
});

describe("mergeAttachments", () => {
  it("appends new files and skips one picked twice", () => {
    const a = file("a.png");
    const merged = mergeAttachments([a], [file("a.png"), file("b.png")]);
    expect(merged.map((f) => f.name)).toEqual(["a.png", "b.png"]);
  });
});
