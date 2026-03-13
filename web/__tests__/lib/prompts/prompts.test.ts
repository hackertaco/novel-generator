// @vitest-environment node
import { describe, it, expect } from "vitest";
import { detectGenre, getGenrePrompt } from "@/lib/prompts/genre-prompts";
import { getSeedPrompt } from "@/lib/prompts/seed-prompt";
import { getChapterPrompt } from "@/lib/prompts/chapter-prompt";
import { getSummaryPrompt } from "@/lib/prompts/summary-prompt";

describe("detectGenre", () => {
  it('returns "현대 로맨스" for text with "로맨스"', () => {
    expect(detectGenre("로맨스 소설을 쓰고 싶어요")).toBe("현대 로맨스");
  });

  it('returns "로맨스 판타지" for text with "로판"', () => {
    expect(detectGenre("로판 느낌의 이야기")).toBe("로맨스 판타지");
  });

  it('returns "무협" for text with "무협"', () => {
    expect(detectGenre("무협 세계관 소설")).toBe("무협");
  });

  it('returns "회귀" for text with "회귀"', () => {
    expect(detectGenre("회귀물을 쓰려고 합니다")).toBe("회귀");
  });

  it('returns "회귀" for text with "귀환"', () => {
    expect(detectGenre("귀환 후 복수하는 이야기")).toBe("회귀");
  });

  it('returns "현대 판타지" as default', () => {
    expect(detectGenre("재밌는 소설을 쓰고 싶어요")).toBe("현대 판타지");
  });
});

describe("getGenrePrompt", () => {
  it("returns prompt containing genre guide", () => {
    const prompt = getGenrePrompt("현대 로맨스", "테스트 인터뷰");

    expect(prompt).toContain("카카오페이지 현대 로맨스 전문 작가");
  });

  it("includes interview result", () => {
    const interviewResult = "주인공은 회귀한 검사입니다";
    const prompt = getGenrePrompt("현대 판타지", interviewResult);

    expect(prompt).toContain(interviewResult);
  });

  it("includes JSON format instruction", () => {
    const prompt = getGenrePrompt("현대 판타지", "인터뷰");

    expect(prompt).toContain("JSON 배열로 출력");
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"logline"');
  });
});

describe("getSeedPrompt", () => {
  it("includes interview result", () => {
    const interviewResult = "로맨스 소설, 현대 배경";
    const prompt = getSeedPrompt(interviewResult);

    expect(prompt).toContain("인터뷰 결과");
    expect(prompt).toContain(interviewResult);
  });

  it("includes YAML template", () => {
    const prompt = getSeedPrompt("인터뷰 결과");

    expect(prompt).toContain("```yaml");
    expect(prompt).toContain("title:");
    expect(prompt).toContain("logline:");
    expect(prompt).toContain("world:");
    expect(prompt).toContain("characters:");
    expect(prompt).toContain("arcs:");
    expect(prompt).toContain("foreshadowing:");
    expect(prompt).toContain("style:");
  });
});

describe("getChapterPrompt", () => {
  it("includes chapter context and number", () => {
    const prompt = getChapterPrompt(
      "챕터 컨텍스트 내용",
      "스타일 가이드 내용",
      "이전 전개 내용",
      5,
      "복선 지시사항",
    );

    expect(prompt).toContain("챕터 컨텍스트 내용");
    expect(prompt).toContain("스타일 가이드 내용");
    expect(prompt).toContain("이전 전개 내용");
    expect(prompt).toContain("5화를 작성해주세요");
    expect(prompt).toContain("복선 지시사항");
    expect(prompt).toContain("카카오페이지 스타일 필수 요소");
  });
});

describe("getSummaryPrompt", () => {
  it("includes chapter content", () => {
    const chapterContent = "현우가 검은 반지를 손에 쥐었다.";
    const prompt = getSummaryPrompt(chapterContent);

    expect(prompt).toContain(chapterContent);
    expect(prompt).toContain("회차 내용");
    expect(prompt).toContain("출력 형식 (JSON)");
    expect(prompt).toContain("plot_summary");
    expect(prompt).toContain("events");
    expect(prompt).toContain("character_changes");
    expect(prompt).toContain("foreshadowing_touched");
  });
});
