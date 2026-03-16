// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { useNovelStore } from "@/hooks/useNovelStore";

describe("useNovelStore smoke test", () => {
  beforeEach(() => {
    useNovelStore.getState().reset();
  });

  it("should have correct initial state", () => {
    const state = useNovelStore.getState();
    expect(state.genre).toBeNull();
    expect(state.plots).toEqual([]);
    expect(state.selectedPlot).toBeNull();
    expect(state.seed).toBeNull();
    expect(state.chapters).toEqual({});
    expect(state.summaries).toEqual([]);
    expect(state.currentChapter).toBe(0);
    expect(state.isGenerating).toBe(false);
    expect(state.streamingText).toBe("");
    expect(state.error).toBeNull();
  });

  it("should set genre and reset downstream state", () => {
    const store = useNovelStore.getState();
    store.setPlots([{ id: "A", title: "t", logline: "l", hook: "h", arc_summary: [], key_twist: "k", male_archetype: "", female_archetype: "" }]);
    store.setGenre("무협");

    const state = useNovelStore.getState();
    expect(state.genre).toBe("무협");
    expect(state.plots).toEqual([]);
    expect(state.selectedPlot).toBeNull();
    expect(state.seed).toBeNull();
  });

  it("should select a plot", () => {
    const plot = { id: "B", title: "테스트", logline: "l", hook: "h", arc_summary: ["a"], key_twist: "k", male_archetype: "", female_archetype: "" };
    useNovelStore.getState().selectPlot(plot);
    expect(useNovelStore.getState().selectedPlot).toEqual(plot);
  });

  it("should save chapter and update currentChapter", () => {
    useNovelStore.getState().saveChapter(1, "챕터 내용");
    const state = useNovelStore.getState();
    expect(state.chapters[1]).toBe("챕터 내용");
    expect(state.currentChapter).toBe(1);
  });

  it("should append streaming text", () => {
    const store = useNovelStore.getState();
    store.setStreamingText("시작");
    store.appendStreamingText(" 추가");
    expect(useNovelStore.getState().streamingText).toBe("시작 추가");
  });

  it("should reset all state", () => {
    const store = useNovelStore.getState();
    store.setGenre("로맨스");
    store.setIsGenerating(true);
    store.setError("에러");
    store.reset();

    const state = useNovelStore.getState();
    expect(state.genre).toBeNull();
    expect(state.isGenerating).toBe(false);
    expect(state.error).toBeNull();
  });
});
