import { describe, expect, it } from "vitest";
import { createDocumentLinkToken, LINK_TTL_SECONDS, verifyDocumentLinkToken } from "../document-link";

const payload = { d: "doc-1", a: "appt-1", u: "user-1", r: "doctor" };

describe("document links", () => {
  it("accepts a fresh link and returns what it names", () => {
    const token = createDocumentLinkToken(payload, 1_000_000);
    expect(verifyDocumentLinkToken(token, 1_000_000)).toMatchObject(payload);
  });

  it("rejects an expired link", () => {
    const token = createDocumentLinkToken(payload, 1_000_000);
    expect(verifyDocumentLinkToken(token, 1_000_000 + (LINK_TTL_SECONDS + 1) * 1000)).toBeNull();
  });

  it("rejects a link whose payload was changed", () => {
    const token = createDocumentLinkToken(payload, 1_000_000);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, d: "someone-elses-doc", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyDocumentLinkToken(`${forged}.${signature}`, 1_000_000)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyDocumentLinkToken("not-a-token")).toBeNull();
    expect(verifyDocumentLinkToken("a.b.c")).toBeNull();
  });
});
