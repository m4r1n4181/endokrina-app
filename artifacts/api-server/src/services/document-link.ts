/**
 * Short-lived signed links for a doctor to open or download one patient document.
 *
 * Why: the staff portal authenticates with a Bearer header, which a plain link cannot carry.
 * The portal used to fetch the file and open it from an in-memory blob URL, which iOS browsers
 * (Safari, and Chrome on iPhone, which uses Safari's engine) cannot open or download. A signed
 * link is an ordinary URL every browser can open.
 *
 * The link is minted only by the authenticated, audit-logged /download endpoint, names exactly
 * one document, carries the doctor's id for the audit log, and expires after LINK_TTL_SECONDS.
 */
import crypto from "node:crypto";
import { config } from "../lib/config";

export const LINK_TTL_SECONDS = 120;

export interface DocumentLinkPayload {
  /** document id */
  d: string;
  /** appointment id */
  a: string;
  /** staff user id (audit) */
  u: string;
  /** staff role (audit) */
  r: string;
  /** expiry, unix seconds */
  exp: number;
}

function sign(encodedPayload: string): string {
  return crypto.createHmac("sha256", config.JWT_SECRET).update(`document-link:${encodedPayload}`).digest("base64url");
}

export function createDocumentLinkToken(
  payload: Omit<DocumentLinkPayload, "exp">,
  now: number = Date.now()
): string {
  const full: DocumentLinkPayload = { ...payload, exp: Math.floor(now / 1000) + LINK_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Returns the payload for a valid, unexpired token, otherwise null. */
export function verifyDocumentLinkToken(token: string, now: number = Date.now()): DocumentLinkPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(encoded));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DocumentLinkPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(now / 1000)) return null;
    if (!payload.d || !payload.a || !payload.u || !payload.r) return null;
    return payload;
  } catch {
    return null;
  }
}
