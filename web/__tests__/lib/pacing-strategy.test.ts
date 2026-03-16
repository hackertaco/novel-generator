/**
 * Pacing strategy tests — verify Context Starvation + Pacing Gate work
 * without going through UI. Fast feedback loop.
 */
import { describe, it, expect } from "vitest";
import { buildChapterContext, buildBlueprintContext } from "@/lib/context/builder";
import { evaluatePacing, checkEarlyChapterPacing } from "@/lib/evaluators/pacing";
import { getWriterSystemPrompt } from "@/lib/prompts/writer-system-prompt";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint } from "@/lib/schema/planning";

// --- Test fixtures ---

const MOCK_SEED: NovelSeed = {
  title: "테스트 소설",
  logline: "평범한 고등학생이 던전이 열린 세계에서 살아남는 이야기",
  total_chapters: 200,
  world: {
    name: "현대 한국 + 던전",
    genre: "현대 판타지",
    sub_genre: "헌터물",
    time_period: "현대",
    magic_system: "마나 기반 능력 체계",
    key_locations: { seoul: "서울 중심", dungeon_1: "첫 번째 던전" },
    factions: { guild_a: "대형 길드", government: "정부 관리국" },
    rules: ["마나가 고갈되면 사망", "던전은 주기적으로 열림"],
  },
  characters: [
    {
      id: "mc",
      name: "이준혁",
      role: "주인공",
      introduction_chapter: 1,
      voice: {
        tone: "무심한 듯 날카로운",
        speech_patterns: ["~거든", "뭐..."],
        sample_dialogues: ["그거 내 알 바 아닌데.", "...됐고, 다음은?"],
        personality_core: "겉으로는 귀찮아하지만 속으로는 책임감 강한 현실주의자",
      },
      backstory: "평범한 고3이었으나 첫 던전 브레이크에서 가족을 잃음",
      arc_summary: "방관자에서 세계를 지키는 자로 성장",
      state: {
        level: 1,
        location: "서울",
        status: "normal",
        relationships: { heroine: "같은 반 친구" },
        inventory: [],
        secrets_known: [],
      },
    },
    {
      id: "heroine",
      name: "강서연",
      role: "히로인",
      introduction_chapter: 3,
      voice: {
        tone: "밝고 직설적인",
        speech_patterns: ["~잖아!", "당연하지"],
        sample_dialogues: ["야, 이준혁! 또 도망가려고?", "내가 왜 가만히 있어야 하는데?"],
        personality_core: "정의감 강한 행동파",
      },
      backstory: "헌터 가문 출신이지만 능력이 늦게 각성",
      arc_summary: "가문의 기대를 넘어서는 자신만의 길 찾기",
      state: {
        level: 1,
        location: "서울",
        status: "normal",
        relationships: { mc: "같은 반 친구" },
        inventory: [],
        secrets_known: [],
      },
    },
    {
      id: "rival",
      name: "박도윤",
      role: "라이벌",
      introduction_chapter: 5,
      voice: {
        tone: "자신만만하고 도발적인",
        speech_patterns: ["~하지 않나?", "재밌군"],
        sample_dialogues: ["넌 아직 모르는 거야.", "이 정도면 실망인데."],
        personality_core: "천재적 재능을 가졌지만 공허함을 느끼는 고독한 엘리트",
      },
      backstory: "S급 헌터의 아들로 모든 것을 가졌지만 아버지에게 인정받지 못함",
      arc_summary: "적에서 동료로, 아버지의 그늘에서 벗어나기",
      state: {
        level: 5,
        location: "서울",
        status: "normal",
        relationships: { mc: "무시" },
        inventory: [],
        secrets_known: [],
      },
    },
    {
      id: "mentor",
      name: "최태산",
      role: "멘토",
      introduction_chapter: 8,
      voice: {
        tone: "과묵하고 무뚝뚝한",
        speech_patterns: ["....", "그래서?"],
        sample_dialogues: ["말이 많군.", "살아남으면 다시 와."],
        personality_core: "말보다 행동으로 가르치는 은퇴한 전설",
      },
      backstory: "전설의 S급 헌터였으나 동료를 잃고 은퇴",
      arc_summary: "과거의 죄책감을 이준혁을 통해 극복",
      state: {
        level: null,
        location: "서울",
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    },
  ],
  arcs: [
    {
      id: "arc_1",
      name: "각성편",
      start_chapter: 1,
      end_chapter: 30,
      summary: "평범한 학생 이준혁이 던전 브레이크를 겪고 능력에 눈을 뜨며 헌터의 세계에 입문한다",
      key_events: ["첫 던전 브레이크", "능력 각성", "길드 테스트"],
      climax_chapter: 28,
    },
  ],
  chapter_outlines: [
    {
      chapter_number: 1,
      title: "평범한 하루의 끝",
      arc_id: "arc_1",
      one_liner: "고3 이준혁의 지루한 일상, 그리고 하늘에 생긴 이상한 균열",
      key_points: [
        "이준혁의 일상 — 학교, 편의점 알바",
        "하늘에 미세한 균열이 보이지만 아무도 신경 쓰지 않음",
        "준혁만 균열이 보인다는 암시",
      ],
      characters_involved: ["mc"],
      tension_level: 3,
    },
    {
      chapter_number: 2,
      title: "균열",
      arc_id: "arc_1",
      one_liner: "균열이 커지고, 이상한 현상들이 시작된다",
      key_points: ["균열 확대", "동물들의 이상 행동"],
      characters_involved: ["mc"],
      tension_level: 4,
    },
  ],
  foreshadowing: [
    {
      id: "fs_1",
      name: "준혁의 진짜 능력",
      description: "준혁만 균열을 볼 수 있는 것은 특별한 능력의 전조",
      importance: "critical" as const,
      planted_at: 1,
      hints_at: [5, 10, 20],
      reveal_at: 28,
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
    formatting_rules: ["문단은 3문장 이하로", "매 회차 끝은 궁금증 유발"],
  },
};

const MOCK_BLUEPRINT: ChapterBlueprint = {
  chapter_number: 1,
  title: "평범한 하루의 끝",
  arc_id: "arc_1",
  one_liner: "고3 이준혁의 지루한 일상, 그리고 하늘에 생긴 이상한 균열",
  role_in_arc: "setup",
  scenes: [
    { purpose: "준혁의 학교 일상", type: "dialogue", characters: ["mc"], estimated_chars: 2000, emotional_tone: "평범" },
    { purpose: "편의점 알바 장면", type: "dialogue", characters: ["mc"], estimated_chars: 1500, emotional_tone: "무료함" },
    { purpose: "하늘의 균열 발견", type: "hook", characters: ["mc"], estimated_chars: 500, emotional_tone: "위화감" },
  ],
  dependencies: [],
  target_word_count: 4000,
  emotional_arc: "무료함→위화감",
  key_points: ["이준혁 일상", "균열 발견", "아무도 신경 안 씀"],
  characters_involved: ["mc", "heroine", "rival"],
  tension_level: 3,
  foreshadowing_actions: [{ id: "fs_1", action: "plant" }],
};

// --- Context Starvation Tests ---

describe("Context Starvation (ch1-3)", () => {
  it("ch1 context should NOT contain arc summary", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx).not.toContain("능력에 눈을 뜨며");
    expect(ctx).not.toContain("헌터의 세계에 입문");
    expect(ctx).not.toContain("클라이맥스");
  });

  it("ch1 context should NOT contain non-MC characters", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx).not.toContain("강서연");
    expect(ctx).not.toContain("박도윤");
    expect(ctx).not.toContain("최태산");
  });

  it("ch1 context should NOT contain foreshadowing instructions", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx).not.toContain("복선");
    expect(ctx).not.toContain("fs_1");
  });

  it("ch1 context should contain ONLY protagonist + minimal info", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx).toContain("이준혁");
    expect(ctx).toContain("테스트 소설");
    expect(ctx).toContain("현대 판타지");
    // Should have one_liner but NOT multiple key_points
    expect(ctx).toContain("지루한 일상");
  });

  it("ch1 context should have no key_points", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx).not.toContain("편의점 알바");
    expect(ctx).not.toContain("균열이 보인다는 암시");
  });

  it("ch2 context should have at most 1 key_point", () => {
    const ctx = buildChapterContext(MOCK_SEED, 2, []);
    // Should contain the one_liner
    expect(ctx).toContain("균열이 커지고");
    // Should contain first key_point
    expect(ctx).toContain("균열 확대");
    // Should NOT contain second key_point
    expect(ctx).not.toContain("동물들의 이상 행동");
  });

  it("ch4 context should contain full info (not starved)", () => {
    const ctx = buildChapterContext(MOCK_SEED, 4, []);
    // Chapter 4 should have arc summary
    expect(ctx).toContain("각성편");
  });

  it("blueprint context for ch1 should also be starved", () => {
    const ctx = buildBlueprintContext(MOCK_SEED, 1, [], MOCK_BLUEPRINT);
    // Should NOT contain blueprint scenes
    expect(ctx).not.toContain("편의점 알바 장면");
    // Should NOT contain non-MC characters
    expect(ctx).not.toContain("강서연");
    expect(ctx).not.toContain("박도윤");
    // Should contain MC
    expect(ctx).toContain("이준혁");
  });

  it("ch1 context should be short (under 500 chars)", () => {
    const ctx = buildChapterContext(MOCK_SEED, 1, []);
    expect(ctx.length).toBeLessThan(500);
  });
});

// --- Pacing Gate Tests ---

describe("Pacing Gate (early chapter enforcement)", () => {
  // Simulate a "too fast" chapter 1
  const RUSHED_CH1 = `
이준혁은 눈을 떴다. 머리가 아팠다.

"야, 이준혁! 일어나!"

강서연이 소리쳤다. 옆에서 박도윤이 비웃듯 웃었다.

"약한 놈은 여기서 떨어져야 해."

갑자기 하늘이 갈라졌다. 거대한 균열에서 몬스터가 쏟아졌다.

이준혁의 몸에서 빛이 폭발했다. 각성이었다. 압도적인 힘이 느껴졌다.

"이게... 나의 능력인가."

다음 날, 길드 본부에서 테스트를 받았다. S급 판정. 모두가 놀랐다.

며칠 후, 최태산이 찾아왔다.

"너, 나한테 배워라."

최종 결전이 다가오고 있었다. 세계가 위험했다. 모든 것이 준혁에게 달려 있었다.
`;

  const GOOD_CH1 = `
수업 종이 울렸다. 이준혁은 책상에 엎드린 채 꿈쩍도 하지 않았다.

"야, 종 쳤다."

짝꿍이 등을 쿡 찔렀다. 준혁은 느릿하게 고개를 들었다. 창밖으로 석양이 내리고 있었다.

"뭐... 알았어."

가방을 대충 챙겨 복도로 나왔다. 학교는 늘 이 시간이 가장 시끄러웠다. 웃는 소리, 뛰는 소리, 누군가를 부르는 소리.

준혁은 이어폰을 꽂았다. 그게 이 소음에서 살아남는 유일한 방법이었다.

편의점까지는 걸어서 15분. 매일 같은 길을 걸었다. 같은 가로수, 같은 횡단보도, 같은 벽돌 담.

"어서 오세요~"

알바 선배가 카운터 뒤에서 손을 흔들었다. 준혁은 고개만 까딱했다.

앞치마를 두르고 진열대를 정리하기 시작했다. 유통기한 확인, 앞줄 빼기, 뒷줄 채우기. 손이 알아서 움직였다.

그때 창밖을 봤다.

하늘에 실금 같은 게 있었다. 아주 가느다란 선. 마치 유리에 금이 간 것처럼.

"...뭐야 저거."

혼잣말이 나왔다. 하지만 창밖을 지나가는 사람들은 아무도 고개를 들지 않았다.

준혁은 다시 한번 올려다봤다. 분명히 있었다. 하늘에, 뭔가가.

"준혁아, 3번 냉장고 좀 채워~"

"...네."

고개를 돌렸다. 다시 올려다봤을 때, 선은 여전히 거기 있었다.
`;

  it("rushed ch1 should get pacing penalty", () => {
    const result = checkEarlyChapterPacing(RUSHED_CH1, 1);
    expect(result.multiplier).toBeLessThan(0.85);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("rushed ch1 should detect too many characters", () => {
    const result = checkEarlyChapterPacing(RUSHED_CH1, 1);
    const charIssue = result.issues.find((i) => i.includes("캐릭터"));
    expect(charIssue).toBeDefined();
  });

  it("rushed ch1 should detect power-up language", () => {
    const result = checkEarlyChapterPacing(RUSHED_CH1, 1);
    const powerIssue = result.issues.find((i) => i.includes("각성") || i.includes("능력"));
    expect(powerIssue).toBeDefined();
  });

  it("rushed ch1 should detect time jumps", () => {
    const result = checkEarlyChapterPacing(RUSHED_CH1, 1);
    const timeIssue = result.issues.find((i) => i.includes("시간 점프"));
    expect(timeIssue).toBeDefined();
  });

  it("good ch1 should pass with high multiplier", () => {
    const result = checkEarlyChapterPacing(GOOD_CH1, 1);
    expect(result.multiplier).toBeGreaterThanOrEqual(0.85);
  });

  it("evaluatePacing with chapterNumber applies early penalty", () => {
    const rushed = evaluatePacing(RUSHED_CH1, 1);
    const rushedNoChapter = evaluatePacing(RUSHED_CH1);
    // With chapter number, overall should be lower
    expect(rushed.overall_score).toBeLessThan(rushedNoChapter.overall_score);
  });
});

// --- Writer System Prompt Tests ---

describe("Writer system prompt — universal rules", () => {
  const genres = ["현대 판타지", "로맨스 판타지", "무협", "회귀", "현대 로맨스"];

  for (const genre of genres) {
    it(`${genre} prompt should contain pacing rules`, () => {
      const prompt = getWriterSystemPrompt(genre, 1);
      expect(prompt).toContain("한 화 = 한 장면이 이상적");
      expect(prompt).toContain("전개 속도");
    });

    it(`${genre} prompt should contain character intro rules`, () => {
      const prompt = getWriterSystemPrompt(genre, 1);
      expect(prompt).toContain("1화는 주인공 중심");
      expect(prompt).toContain("캐릭터 도입 원칙");
    });

    it(`${genre} prompt should contain anti-cringe rules`, () => {
      const prompt = getWriterSystemPrompt(genre, 1);
      expect(prompt).toContain("오글거림 방지");
      expect(prompt).toContain("심장이 두근거렸다");
    });
  }
});

describe("Exported constants for Issue Locator", () => {
  it("exports POWER_UP_PATTERNS", async () => {
    const { POWER_UP_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(POWER_UP_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports CLIMAX_PATTERNS", async () => {
    const { CLIMAX_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(CLIMAX_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports TIME_JUMP_PATTERNS", async () => {
    const { TIME_JUMP_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(TIME_JUMP_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports DESCRIPTIVE_KEYWORDS", async () => {
    const { DESCRIPTIVE_KEYWORDS } = await import("@/lib/evaluators/pacing");
    expect(DESCRIPTIVE_KEYWORDS.length).toBeGreaterThan(0);
  });
});
