import { describe, expect, it } from "vitest";
import {
  getAllowedQuestionIds,
  THYROID_QUESTIONNAIRE_V1,
} from "../questionnaire-schema";

describe("getAllowedQuestionIds", () => {
  it("collects question IDs from every section", () => {
    const ids = getAllowedQuestionIds(THYROID_QUESTIONNAIRE_V1);

    expect(ids).toContain("full_name");
    expect(ids).toContain("family_history_details");
    expect(ids).not.toContain("unknown_field");
  });
});