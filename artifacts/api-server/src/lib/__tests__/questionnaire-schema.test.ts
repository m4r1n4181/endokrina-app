import { describe, expect, it } from "vitest";
import {
  getAllowedQuestionIds,
  RETIRED_QUESTION_IDS,
  THYROID_QUESTIONNAIRE_V1,
} from "../questionnaire-schema";

describe("getAllowedQuestionIds", () => {
  it("collects question IDs from every section", () => {
    const ids = getAllowedQuestionIds(THYROID_QUESTIONNAIRE_V1);

    expect(ids).toContain("full_name");
    expect(ids).toContain("family_history_details");
    expect(ids).not.toContain("unknown_field");
  });

  it("still accepts retired question IDs so older drafts can be saved", () => {
    const ids = getAllowedQuestionIds(THYROID_QUESTIONNAIRE_V1);
    for (const retired of RETIRED_QUESTION_IDS) expect(ids).toContain(retired);
  });

  it("no longer asks the retired preference questions", () => {
    const asked = THYROID_QUESTIONNAIRE_V1.sections.flatMap((section) => section.questions.map((q) => q.id));
    for (const retired of RETIRED_QUESTION_IDS) expect(asked).not.toContain(retired);
    expect(THYROID_QUESTIONNAIRE_V1.sections.map((section) => section.id)).not.toContain("preferences");
  });
});
