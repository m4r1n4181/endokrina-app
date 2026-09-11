import { describe, expect, it } from "vitest";
import { isMagicLinkExpired, verifyLinkToken } from "../../services/patient-auth";

describe("patient preparation links", () => {
  it("expires links older than the configured lifetime", () => {
    const createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(isMagicLinkExpired({ createdAt })).toBe(true);
  });

  it("rejects a tampered link signature", () => {
    expect(verifyLinkToken("payload.invalid-signature")).toBe(false);
  });
});
