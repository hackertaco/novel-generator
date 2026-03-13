import { describe, it, expect } from "vitest";
import { handleSelfReviewResponse } from "@/lib/agents/writer-agent";

describe("handleSelfReviewResponse", () => {
  it("returns original text for NO_CHANGES response", () => {
    const result = handleSelfReviewResponse("NO_CHANGES", "원본 텍스트");
    expect(result).toBe("원본 텍스트");
  });

  it("returns new text when self-review provides revision", () => {
    const result = handleSelfReviewResponse("수정된 텍스트 여기", "원본 텍스트");
    expect(result).toBe("수정된 텍스트 여기");
  });

  it("returns original if revision is less than 70% of original length", () => {
    const original = "아주 긴 원본 텍스트가 여기에 있습니다. 충분한 길이를 가지고 있어야 합니다.";
    const short = "짧은";
    const result = handleSelfReviewResponse(short, original);
    expect(result).toBe(original);
  });

  it("returns original for empty response", () => {
    const result = handleSelfReviewResponse("", "원본 텍스트");
    expect(result).toBe("원본 텍스트");
  });

  it("handles NO_CHANGES with surrounding whitespace", () => {
    const result = handleSelfReviewResponse("  NO_CHANGES  ", "원본");
    expect(result).toBe("원본");
  });
});
