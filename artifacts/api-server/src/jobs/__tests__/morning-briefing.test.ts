import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Only outbound delivery is mocked; everything else (queries, claim logic, rendering) is real.
vi.mock("../../services/notifications", () => ({
  sendEmail: vi.fn(),
  sendReminderSms: vi.fn(),
  sendPatientLinkSms: vi.fn(),
}));

import { appointmentsTable, db, usersTable } from "../../lib/db";
import { sendEmail } from "../../services/notifications";
import { sendDoctorMorningBriefings } from "../maintenance";

/**
 * Fixed far-future summer date (CEST, UTC+2) so results never depend on when the suite runs.
 * Assumes default MORNING_BRIEFING_HOUR=7 and MORNING_BRIEFING_CATCHUP_HOURS=5 (window 07:00-11:59).
 */
const TODAY = "2027-06-15";
const AT_0730_LOCAL = new Date("2027-06-15T05:30:00Z");

const suffix = Math.random().toString(36).slice(2, 8);
const email = (name: string) => `briefing-${name}-${suffix}@clinic.test`;

const ids: Record<"a" | "b" | "c" | "inactive", string> = { a: "", b: "", c: "", inactive: "" };
const mailMock = vi.mocked(sendEmail);

function mailsTo(address: string) {
  return mailMock.mock.calls.filter(([to]) => to === address);
}

function textOf(call: (typeof mailMock.mock.calls)[number]): string {
  const content = call[2];
  return typeof content === "string" ? content : content.text;
}

async function briefedOn(id: string): Promise<string | null> {
  const [row] = await db.select({ v: usersTable.lastMorningBriefingOn }).from(usersTable).where(eq(usersTable.id, id));
  return row.v;
}

async function appointment(doctorId: string, patientName: string, scheduledAt: string, overrides: Partial<typeof appointmentsTable.$inferInsert> = {}) {
  await db.insert(appointmentsTable).values({
    doctorId,
    invitedFullName: patientName,
    invitedPhone: "+381641234567",
    appointmentType: "follow_up",
    scheduledAt: new Date(scheduledAt),
    status: "link_sent",
    ...overrides,
  });
}

beforeAll(async () => {
  const makeDoctor = async (name: string, fullName: string, isActive = true) => {
    const [row] = await db
      .insert(usersTable)
      .values({ email: email(name), passwordHash: "not-a-real-hash", role: "doctor", fullName, isActive })
      .returning({ id: usersTable.id });
    return row.id;
  };
  ids.a = await makeDoctor("a", "dr Alfa");
  ids.b = await makeDoctor("b", "dr Beta");
  ids.c = await makeDoctor("c", "dr Ceta"); // no appointments today
  ids.inactive = await makeDoctor("inactive", "dr Neaktivan", false);

  // Doctor A — inserted out of time order on purpose.
  await appointment(ids.a, "Bojan Poslednji", "2027-06-15T15:30:00Z", { status: "link_sent", labStatus: null }); // 17:30
  await appointment(ids.a, "Ana Prva", "2027-06-15T07:00:00Z", { status: "submitted", labStatus: "uploaded_digitally" }); // 09:00
  await appointment(ids.a, "Cana Sredina", "2027-06-15T09:15:00Z", { status: "opened" }); // 11:15
  // Must NOT appear:
  await appointment(ids.a, "Nikola Juce", "2027-06-14T21:30:00Z"); // 23:30 local on the 14th
  await appointment(ids.a, "Petra Sutra", "2027-06-15T22:30:00Z"); // 00:30 local on the 16th
  await appointment(ids.a, "Otkazana Osoba", "2027-06-15T08:00:00Z", { status: "cancelled", excludedFromClinicalViews: true });
  await appointment(ids.a, "Nacrt Osoba", "2027-06-15T08:30:00Z", { status: "draft_invitation" });

  await appointment(ids.b, "Drugi Pacijent", "2027-06-15T08:00:00Z");
  await appointment(ids.inactive, "Neaktivni Pacijent", "2027-06-15T08:00:00Z");
});

afterAll(async () => {
  const all = Object.values(ids);
  await db.delete(appointmentsTable).where(inArray(appointmentsTable.doctorId, all));
  await db.delete(usersTable).where(inArray(usersTable.id, all));
});

beforeEach(async () => {
  mailMock.mockReset();
  mailMock.mockResolvedValue(undefined);
  await db.update(usersTable).set({ lastMorningBriefingOn: null }).where(inArray(usersTable.id, Object.values(ids)));
});

describe("sendDoctorMorningBriefings", () => {
  it("sends each doctor one mail with only their own, current-day, non-cancelled patients in time order", async () => {
    await sendDoctorMorningBriefings(AT_0730_LOCAL);

    const a = mailsTo(email("a"));
    expect(a).toHaveLength(1);
    const text = textOf(a[0]);

    const order = ["Ana Prva", "Cana Sredina", "Bojan Poslednji"].map((n) => text.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(text).toContain("09:00");
    expect(text).toContain("17:30");

    for (const excluded of ["Nikola Juce", "Petra Sutra", "Otkazana Osoba", "Nacrt Osoba", "Drugi Pacijent"]) {
      expect(text).not.toContain(excluded);
    }

    const b = mailsTo(email("b"));
    expect(b).toHaveLength(1);
    expect(textOf(b[0])).toContain("Drugi Pacijent");
    expect(textOf(b[0])).not.toContain("Ana Prva");
  });

  it("links to the dashboard and carries no clinical fields", async () => {
    await sendDoctorMorningBriefings(AT_0730_LOCAL);
    const text = textOf(mailsTo(email("a"))[0]);
    expect(text).toMatch(/\/dashboard/);
    expect(text).not.toMatch(/answers|questionnaire_id|summary_id/i);
  });

  it("does not email doctors with no appointments today, or inactive doctors", async () => {
    await sendDoctorMorningBriefings(AT_0730_LOCAL);
    expect(mailsTo(email("c"))).toHaveLength(0);
    expect(mailsTo(email("inactive"))).toHaveLength(0);
    expect(await briefedOn(ids.c)).toBeNull();
  });

  it("is idempotent within a day", async () => {
    await sendDoctorMorningBriefings(AT_0730_LOCAL);
    await sendDoctorMorningBriefings(new Date("2027-06-15T06:30:00Z"));
    expect(mailsTo(email("a"))).toHaveLength(1);
    expect(await briefedOn(ids.a)).toBe(TODAY);
  });

  it("sends at most one mail per doctor even when two job runs overlap", async () => {
    mailMock.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await Promise.all([sendDoctorMorningBriefings(AT_0730_LOCAL), sendDoctorMorningBriefings(AT_0730_LOCAL)]);
    expect(mailsTo(email("a"))).toHaveLength(1);
    expect(mailsTo(email("b"))).toHaveLength(1);
  });

  it("only sends inside the configured window", async () => {
    await sendDoctorMorningBriefings(new Date("2027-06-15T01:00:00Z")); // 03:00 local
    await sendDoctorMorningBriefings(new Date("2027-06-15T10:00:00Z")); // 12:00 local, window closed
    expect(mailsTo(email("a"))).toHaveLength(0);

    await sendDoctorMorningBriefings(new Date("2027-06-15T08:59:00Z")); // 10:59 local, catch-up
    expect(mailsTo(email("a"))).toHaveLength(1);
  });

  it("releases the slot when delivery fails and retries on the next run", async () => {
    mailMock.mockImplementation(async (to: string) => {
      if (to === email("a")) throw new Error("SMTP down");
    });

    const sentFirst = await sendDoctorMorningBriefings(AT_0730_LOCAL);
    expect(sentFirst).toBe(1); // doctor B still got theirs
    expect(await briefedOn(ids.a)).toBeNull();
    expect(await briefedOn(ids.b)).toBe(TODAY);

    mailMock.mockReset();
    mailMock.mockResolvedValue(undefined);
    const sentSecond = await sendDoctorMorningBriefings(new Date("2027-06-15T05:31:00Z"));
    expect(sentSecond).toBe(1);
    expect(mailsTo(email("a"))).toHaveLength(1);
    expect(mailsTo(email("b"))).toHaveLength(0); // not re-sent
    expect(await briefedOn(ids.a)).toBe(TODAY);
  });

  it("briefs again the next day", async () => {
    await sendDoctorMorningBriefings(AT_0730_LOCAL);
    await appointment(ids.a, "Sutradan Pacijent", "2027-06-16T07:00:00Z");
    await sendDoctorMorningBriefings(new Date("2027-06-16T05:30:00Z"));
    const calls = mailsTo(email("a"));
    expect(calls).toHaveLength(2);
    expect(textOf(calls[1])).toContain("Sutradan Pacijent");
    expect(textOf(calls[1])).not.toContain("Ana Prva");
  });
});
