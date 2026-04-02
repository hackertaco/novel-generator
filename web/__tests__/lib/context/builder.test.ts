// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildChapterContext } from "@/lib/context/builder";
import type { NovelSeed } from "@/lib/schema/novel";

const testSeed: NovelSeed = {
  title: "회귀자의 검",
  logline: "배신당해 죽은 검사가 10년 전으로 돌아간다",
  total_chapters: 100,
  world: {
    name: "현대 한국",
    genre: "현대 판타지",
    sub_genre: "회귀",
    time_period: "현대",
    magic_system: null,
    key_locations: {},
    factions: {},
    rules: [],
  },
  characters: [
    {
      id: "mc",
      name: "강현우",
      role: "주인공",
      social_rank: "commoner",
      introduction_chapter: 1,
      voice: {
        tone: "냉소적",
        speech_patterns: ["~하지", "...그래서?"],
        sample_dialogues: ["죽어봤으니까 알지.", "...그래서, 뭐 어쩌라고?"],
        personality_core: "냉소적이지만 속정 있음",
      },
      backstory: "배경",
      arc_summary: "성장",
      state: {
        level: 1,
        status: "normal",
        location: null,
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    },
  ],
  arcs: [
    {
      id: "arc_1",
      name: "귀환편",
      start_chapter: 1,
      end_chapter: 50,
      summary: "현우가 과거로 돌아와 힘을 키운다",
      key_events: ["회귀", "첫 전투"],
      climax_chapter: 48,
    },
  ],
  chapter_outlines: [
    {
      chapter_number: 5,
      title: "검은 반지",
      arc_id: "arc_1",
      one_liner: "현우가 검은 반지를 발견한다",
      advances_thread: [],
      key_points: ["반지 발견", "이상한 기운"],
      characters_involved: ["mc"],
      tension_level: 6,
    },
  ],
  extended_outlines: [],
  story_threads: [],
  foreshadowing: [
    {
      id: "fs_ring",
      name: "검은 반지",
      description: "반지에 봉인된 힘",
      importance: "critical",
      planted_at: 5,
      hints_at: [15],
      reveal_at: 48,
      status: "pending",
      hint_count: 0,
    },
  ],
  style: {
    max_paragraph_length: 3,
    dialogue_ratio: 0.6,
    sentence_style: "short",
    hook_ending: true,
    pov: "1인칭",
    tense: "과거형",
    formatting_rules: [
      "문단은 3문장 이하로",
      "대사 후 긴 지문 금지",
    ],
  },
};

describe("buildChapterContext", () => {
  it("includes novel title and logline", () => {
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("회귀자의 검");
    expect(context).toContain("배신당해 죽은 검사가 10년 전으로 돌아간다");
  });

  it("includes current arc information", () => {
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("귀환편");
    expect(context).toContain("1~50화");
    expect(context).toContain("현우가 과거로 돌아와 힘을 키운다");
    expect(context).toContain("클라이맥스: 48화");
  });

  it("includes chapter outline when available", () => {
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("5화 아웃라인");
    expect(context).toContain("검은 반지");
    expect(context).toContain("현우가 검은 반지를 발견한다");
    expect(context).toContain("반지 발견");
    expect(context).toContain("이상한 기운");
    expect(context).toContain("6/10");
  });

  it("includes character voice details", () => {
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("강현우");
    expect(context).toContain("주인공");
    expect(context).toContain("냉소적");
    expect(context).toContain("~하지");
    expect(context).toContain("...그래서?");
    expect(context).toContain("죽어봤으니까 알지.");
  });

  it("includes foreshadowing actions for the chapter", () => {
    // Chapter 5 is planted_at for fs_ring with status "pending" -> shouldAct returns "plant"
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("복선 처리");
    expect(context).toContain("검은 반지");
    expect(context).toContain("반지에 봉인된 힘");
  });

  it("includes previous summaries (last 5)", () => {
    const summaries = [
      { chapter: 1, title: "1화", summary: "현우가 회귀한다" },
      { chapter: 2, title: "2화", summary: "첫 날 학교에 간다" },
      { chapter: 3, title: "3화", summary: "훈련을 시작한다" },
      { chapter: 4, title: "4화", summary: "강해지기 시작한다" },
      { chapter: 5, title: "5화", summary: "반지를 발견한다" },
      { chapter: 6, title: "6화", summary: "반지의 힘을 느낀다" },
      { chapter: 7, title: "7화", summary: "새로운 적이 나타난다" },
    ];

    const context = buildChapterContext(testSeed, 8, summaries);

    // Should include last 5 summaries (chapters 3-7)
    expect(context).toContain("이전 내용 요약");
    expect(context).toContain("3화");
    expect(context).toContain("7화");
    // Should NOT include chapter 1 or 2 (only last 5)
    expect(context).not.toContain("1화: 현우가 회귀한다");
    expect(context).not.toContain("2화: 첫 날 학교에 간다");
  });

  it("includes style guide", () => {
    const context = buildChapterContext(testSeed, 5, []);

    expect(context).toContain("스타일 가이드");
    expect(context).toContain("3문장 이하");
    expect(context).toContain("60%");
    expect(context).toContain("1인칭");
    expect(context).toContain("과거형");
    expect(context).toContain("필수"); // hook_ending: true -> "필수"
    expect(context).toContain("문단은 3문장 이하로");
    expect(context).toContain("대사 후 긴 지문 금지");
  });

  it("uses Korean text format", () => {
    const context = buildChapterContext(testSeed, 5, []);

    // Should use Korean headers
    expect(context).toContain("# 소설 정보");
    expect(context).toContain("제목:");
    expect(context).toContain("로그라인:");
    expect(context).toContain("장르:");
    expect(context).toContain("# 현재 아크");
    expect(context).toContain("# 등장 캐릭터");
    expect(context).toContain("# 스타일 가이드");
  });
});
