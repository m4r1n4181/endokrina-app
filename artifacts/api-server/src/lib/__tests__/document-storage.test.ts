import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readDocument, saveDocument } from "../document-storage";

const storageKey = `tests/${randomBytes(8).toString("hex")}`;

describe("document storage dispatcher", () => {
  it("round-trips bytes through the configured local adapter", async () => {
    const content = Buffer.from("test document bytes");
    await saveDocument(storageKey, content, "application/pdf");

    await expect(readDocument(storageKey)).resolves.toEqual(content);
  });
});
