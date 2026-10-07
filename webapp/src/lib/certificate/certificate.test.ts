import { describe, expect, it } from "vitest";
import { A4_LANDSCAPE_PT, jpegToPdf } from "./pdf";
import { fitSize, layoutCertificate, PAGE, textWidth, wrapLines, type CertificateContent } from "./layout";
import { certificateFileName, linkedInCertificationUrl, SHARE_NETWORKS, shareDestination } from "./share";
import { sampleCertificateRef } from "../../components/account/CertificateCard";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

describe("jpegToPdf", () => {
  const pdf = jpegToPdf(JPEG, { width: 3508, height: 2480 }, { title: "Attestation — Pose experte", author: "Global Toothgems Academy" });
  const text = latin1(pdf);

  it("writes a one-page A4 landscape PDF holding the image", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain(`/MediaBox [0 0 ${A4_LANDSCAPE_PT.width} ${A4_LANDSCAPE_PT.height}]`);
    expect(text).toContain("/Count 1");
    expect(text).toContain("/Width 3508 /Height 2480");
    expect(text).toContain(`/Filter /DCTDecode /Length ${JPEG.length}`);
    expect(text).toContain(latin1(JPEG));
  });

  it("points every cross-reference entry at its object", () => {
    const xrefAt = Number(text.match(/startxref\n(\d+)\n/)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const entries = text.slice(xrefAt).match(/^(\d{10}) 00000 n $/gm)!;
    expect(entries).toHaveLength(6);
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("encodes the title in UTF-16 so accents survive", () => {
    expect(text).toContain("/Title <FEFF0041");
    expect(text).toContain("2014"); // the em dash
  });

  it("refuses what is not a JPEG", () => {
    expect(() => jpegToPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { width: 1, height: 1 }, { title: "", author: "" })).toThrow();
    expect(() => jpegToPdf(JPEG, { width: 0, height: 1 }, { title: "", author: "" })).toThrow();
  });
});

const CONTENT: CertificateContent = {
  brand: "Global Toothgems",
  academy: "Academy",
  title: "Certificate of completion",
  awardedTo: "Awarded to",
  holder: "Camille Martin",
  statement: "for successfully completing the course",
  courseTitle: "Tooth gem fundamentals",
  details: "Beginner · 9 lessons · 3 h",
  dateLabel: "Date of completion",
  date: "7 October 2026",
  referenceLabel: "Certificate no.",
  reference: "GTC-1A2B-3C4D-5E6F",
  seal: "Completed",
  issuer: "Global Toothgems Academy",
  issuerLabel: "Issued by",
};

describe("layoutCertificate", () => {
  const texts = (content: CertificateContent) => layoutCertificate(content).filter((op) => op.kind === "text");

  it("prints every field of the certificate", () => {
    const printed = texts(CONTENT).map((op) => op.text);
    for (const value of [CONTENT.holder, CONTENT.courseTitle, CONTENT.date, CONTENT.reference, CONTENT.issuer]) expect(printed).toContain(value);
    expect(printed).toContain(CONTENT.title.toUpperCase());
  });

  it("makes the holder the largest text, then the course", () => {
    const ops = texts(CONTENT);
    const holder = ops.find((op) => op.text === CONTENT.holder)!;
    const course = ops.find((op) => op.text === CONTENT.courseTitle)!;
    expect(Math.max(...ops.map((op) => op.size))).toBe(holder.size);
    expect(Math.max(...ops.filter((op) => op !== holder).map((op) => op.size))).toBe(course.size);
  });

  it("keeps a long name and a long title inside the frame", () => {
    const ops = texts({
      ...CONTENT,
      holder: "Marie-Charlotte Dupont-Aignan de la Villardière",
      courseTitle: "Pose experte de strass dentaires : techniques avancées, hygiène et accompagnement de la cliente",
    });
    for (const op of ops) {
      const width = op.fitWidth ?? textWidth(op.text, op.size, op.weight, op.tracking, op.mono);
      const left = op.align === "middle" ? op.x - width / 2 : op.align === "end" ? op.x - width : op.x;
      expect(left).toBeGreaterThanOrEqual(11.5);
      expect(left + width).toBeLessThanOrEqual(PAGE.width - 11.5);
    }
    expect(ops.filter((op) => op.size === ops.find((o) => o.text.startsWith("Pose"))!.size && op.weight === 600 && op.align === "middle").length).toBeGreaterThanOrEqual(2);
  });

  it("is the same on every call (server and browser agree)", () => {
    expect(JSON.stringify(layoutCertificate(CONTENT))).toBe(JSON.stringify(layoutCertificate(CONTENT)));
  });
});

describe("text estimates", () => {
  it("shrinks only what overflows", () => {
    expect(fitSize("Ana", 14, 230, 8)).toBe(14);
    expect(fitSize("A very long name that will never fit on a single line here", 14, 100, 8)).toBeLessThan(14);
    expect(fitSize("x".repeat(500), 14, 100, 8)).toBe(8);
  });

  it("wraps on words, into at most the lines allowed", () => {
    const lines = wrapLines("one two three four five six seven eight nine ten", 7, 60, 600, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toBe("one two three four five six seven eight nine ten");
  });
});

describe("sharing", () => {
  it("opens each network with the caption where it accepts one", () => {
    const caption = "I just completed “Basics” with Global Toothgems ✦ #toothgems";
    expect(shareDestination("x", caption, "s")).toBe(`https://x.com/intent/tweet?text=${encodeURIComponent(caption)}`);
    expect(shareDestination("linkedin", caption, "s")).toContain(`text=${encodeURIComponent(caption)}`);
    expect(shareDestination("email", caption, "Subject & more")).toBe(`mailto:?subject=${encodeURIComponent("Subject & more")}&body=${encodeURIComponent(caption)}`);
    for (const network of SHARE_NETWORKS) expect(shareDestination(network, caption, "s")).toMatch(/^(https:\/\/|mailto:)/);
  });

  it("pre-fills LinkedIn's certification form", () => {
    const url = new URL(linkedInCertificationUrl({ courseTitle: "Pose & hygiène", awardedOn: "2026-03-09", reference: "GTC-1A2B-3C4D-5E6F" }));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(url.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(url.searchParams.get("name")).toBe("Pose & hygiène");
    expect(url.searchParams.get("organizationName")).toBe("Global Toothgems");
    expect(url.searchParams.get("issueYear")).toBe("2026");
    expect(url.searchParams.get("issueMonth")).toBe("3");
    expect(url.searchParams.get("certId")).toBe("GTC-1A2B-3C4D-5E6F");
  });

  it("names files in ASCII with the reference", () => {
    expect(certificateFileName("Pose experte : l’art du strass", "GTC-1A2B-3C4D-5E6F", "pdf")).toBe(
      "global-toothgems-pose-experte-l-art-du-strass-gtc-1a2b-3c4d-5e6f.pdf",
    );
    expect(certificateFileName("✦✦", "GTC-0000-0000-0000", "png")).toBe("global-toothgems-certificate-gtc-0000-0000-0000.png");
  });
});

describe("sampleCertificateRef", () => {
  it("has the server's format and is stable", () => {
    const ref = sampleCertificateRef("bases", "2026-10-07");
    expect(ref).toMatch(/^GTC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(sampleCertificateRef("bases", "2026-10-07")).toBe(ref);
    expect(sampleCertificateRef("bases", "2026-10-08")).not.toBe(ref);
  });
});
