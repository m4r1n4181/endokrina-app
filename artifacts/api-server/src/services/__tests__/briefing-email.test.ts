import { describe, expect, it } from "vitest";
import { escapeHtml, renderMorningBriefing, type BriefingItem } from "../briefing-email";

const TZ = "Europe/Belgrade";
const URL = "https://portal.example.rs/dashboard";
const DAY = new Date("2026-09-24T05:00:00Z");

const items: BriefingItem[] = [
  { patientName: "Ana Petrović", scheduledAt: new Date("2026-09-24T07:00:00Z"), status: "submitted" },
  { patientName: "Marko Jovanović", scheduledAt: new Date("2026-09-24T08:30:00Z"), status: "link_sent" },
];

function render(overrides: Partial<Parameters<typeof renderMorningBriefing>[0]> = {}) {
  return renderMorningBriefing({ doctorName: "dr Jović", day: DAY, items, dashboardUrl: URL, timeZone: TZ, ...overrides });
}

describe("renderMorningBriefing", () => {
  it("lists every patient with local time and Serbian status label, in the given order", () => {
    const { text } = render();
    const lines = text.split("\n").filter((l) => l.includes("—"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("09:00");
    expect(lines[0]).toContain("Ana Petrović");
    expect(lines[0]).toContain("Poslato");
    expect(lines[1]).toContain("10:30");
    expect(lines[1]).toContain("Link poslat");
  });

  it("contains the dashboard link in both text and html", () => {
    const { text, html } = render();
    expect(text).toContain(URL);
    expect(html).toContain(`href="${URL}"`);
  });

  it("keeps patient names out of the subject, and puts the count in it", () => {
    const { subject } = render();
    expect(subject).toContain("(2)");
    expect(subject).not.toContain("Ana");
    expect(subject).not.toContain("Petrović");
  });

  it("never renders raw enum values or ISO timestamps", () => {
    const { text, html } = render();
    for (const body of [text, html]) {
      expect(body).not.toMatch(/link_sent|uploaded_digitally|submitted/);
      expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    }
  });

  it("falls back to the raw value for unknown appointment statuses", () => {
    const { text } = render({
      items: [{ patientName: "Test", scheduledAt: DAY, status: "brand_new_status" }],
    });
    expect(text).toContain("brand_new_status");
  });

  it("escapes HTML in patient and doctor names", () => {
    const { html } = render({
      doctorName: "<b>dr</b>",
      items: [{ patientName: `<script>alert("x")</script>`, scheduledAt: DAY, status: "opened" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>dr</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("flattens newlines in names so they cannot break the text layout", () => {
    const { text } = render({
      items: [{ patientName: "Ana\r\nBcc: evil@example.com", scheduledAt: DAY, status: "opened" }],
    });
    expect(text).not.toMatch(/\nBcc:/);
  });
});

describe("escapeHtml", () => {
  it("escapes the five special characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});
