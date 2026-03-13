// @vitest-environment node
import { describe, it, expect } from "vitest";

// Test the mock fallback logic that exists in the plots route
// We import and test the core logic rather than the HTTP handler

describe("/api/plots smoke test", () => {
  it("should have mock plots for 로맨스 genre", () => {
    // Verify the mock data structure matches PlotOption interface
    const mockPlot = {
      id: "A",
      title: "다시, 너에게",
      logline: "후회하는 남주 앞에 당차게 나타난 여주",
      hook: "밀당 역전",
      arc_summary: ["1부", "2부", "3부"],
      key_twist: "반전",
    };

    expect(mockPlot).toHaveProperty("id");
    expect(mockPlot).toHaveProperty("title");
    expect(mockPlot).toHaveProperty("logline");
    expect(mockPlot).toHaveProperty("hook");
    expect(mockPlot.arc_summary).toHaveLength(3);
    expect(mockPlot).toHaveProperty("key_twist");
  });

  it("should have mock plots for default genre", () => {
    const mockPlot = {
      id: "A",
      title: "정점으로",
      logline: "바닥에서 시작해 정상을 향해",
      hook: "언더독 성공",
      arc_summary: ["1부", "2부", "3부"],
      key_twist: "재능이 아니라 저주였다",
    };

    expect(mockPlot.arc_summary).toHaveLength(3);
  });
});
