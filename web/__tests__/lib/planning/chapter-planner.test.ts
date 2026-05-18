import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import type { ArcPlan } from "@/lib/schema/planning";

const mockCallStructured = vi.fn();

vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: () => ({ callStructured: mockCallStructured }),
}));

import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";

function makeSeed(): NovelSeed {
  return {
    title: "테스트",
    logline: "테스트 로그라인",
    total_chapters: 3,
    world: {
      name: "테스트 세계",
      genre: "fantasy",
      sub_genre: "romantasy",
      time_period: "중세풍",
      magic_system: "문양 마법",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "elysia",
        name: "엘리시아 크레센트",
        role: "protagonist",
        description: "주인공",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "담담함", speech_patterns: [], sample_dialogues: [], personality_core: "냉정함" },
        backstory: "배경",
        arc_summary: "회귀 후 복수 결심",
        state: { level: 1, status: "긴장", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "serena",
        name: "세레나 크레센트",
        role: "supporting",
        description: "조력자",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "차분함", speech_patterns: [], sample_dialogues: [], personality_core: "숨은 의도" },
        backstory: "배경",
        arc_summary: "가족 내 갈등",
        state: { level: 1, status: "침착", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "marian",
        name: "마리안",
        role: "supporting",
        description: "시녀",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "조심스러움", speech_patterns: [], sample_dialogues: [], personality_core: "충성심" },
        backstory: "배경",
        arc_summary: "주인공 보조",
        state: { level: 1, status: "불안", relationships: {}, inventory: [], secrets_known: [] },
      },
    ],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [
      {
        chapter_number: 1,
        title: "첫 화",
        arc_id: "arc_1",
        one_liner: "엘리시아가 회귀를 확인한다",
        key_points: ["회귀를 확인한다"],
        characters_involved: ["elysia", "serena", "marian"],
        tension_level: 5,
      },
    ],
    extended_outlines: [],
    style: {
      tone: "긴장감 있는 판타지",
      prose_guidelines: [],
      banned: [],
    },
  } as unknown as NovelSeed;
}

function makeArc(): ArcPlan {
  return {
    id: "arc_1",
    name: "첫 아크",
    part_id: "part_1",
    start_chapter: 1,
    end_chapter: 3,
    summary: "아크 요약",
    theme: "회귀",
    key_events: ["회귀 확인"],
    climax_chapter: 3,
    tension_curve: [4, 5, 6],
    chapter_blueprints: [],
  } as ArcPlan;
}

beforeEach(() => {
  mockCallStructured.mockReset();
});

describe("generateChapterBlueprints", () => {
  it("preserves outline characters_involved even when the model drops them", async () => {
    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 1,
            title: "죽음의 맛으로 깨어나다",
            arc_id: "arc_1",
            one_liner: "엘리시아가 회귀를 확인한다",
            role_in_arc: "setup",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 침실에서 달력을 확인한다",
                type: "hook",
                characters: ["elysia", "marian"],
                estimated_chars: 1800,
                emotional_tone: "충격",
                must_reveal: ["회귀 자각"],
              },
            ],
            dependencies: [],
            emotional_arc: "충격 → 결심",
            key_points: ["회귀 자각"],
            characters_involved: ["elysia", "marian"],
            tension_level: 4,
            foreshadowing_actions: [],
            romance_beat: "무심한 편들기",
            romance_counterpart: "serena",
            romance_beat_type: "gaze_shift",
            romance_thread_advances: true,
            target_word_count: 2000,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    const result = await generateChapterBlueprints(makeSeed(), makeArc(), [], undefined, null, 1);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.characters_involved).toEqual(["elysia", "marian", "serena"]);
    expect(result.data[0]?.scenes[0]?.characters).toEqual(["elysia", "marian", "serena"]);
  });

  it("registers foreshadowing during blueprint planning when a delayed key point is grounded in a scene", async () => {
    const seed = makeSeed();

    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 1,
            title: "붉은 낙인이 깨어난 밤",
            arc_id: "arc_1",
            one_liner: "엘리시아가 회귀의 징표를 발견한다",
            role_in_arc: "setup",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 거울 앞에서 손목에 떠오른 붉은 낙인을 보고 세레나 크레센트와 숨긴다.",
                type: "hook",
                characters: ["elysia", "serena"],
                estimated_chars: 1500,
                emotional_tone: "불안",
                must_reveal: [
                  "엘리시아의 손목에 붉은 낙인이 새겨진다",
                  "세레나는 그 낙인이 10년 전 금서 사건과 닮았다고 숨긴다",
                ],
                how: "거울 확인 → 붉은 낙인 발견 → 세레나가 표정을 감춤",
                leads_to: "낙인의 기원이 후반부 조사로 이어진다",
              },
            ],
            dependencies: [],
            emotional_arc: "충격 → 의심",
            key_points: [
              {
                what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                reveal: "delayed",
                reveal_at: 5,
                caused_by: "회귀 직후 거울 앞에서 봉인 반응이 되살아났다",
                consequence: "세레나가 낙인의 기원을 숨기며 조사선을 따로 만든다",
              },
            ],
            characters_involved: ["elysia", "serena"],
            tension_level: 6,
            foreshadowing_actions: [],
            curiosity_hook: "왜 엘리시아의 낙인이 금서 사건 생존자의 표식과 일치하는가?",
            target_word_count: 2000,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    const result = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);

    expect(result.data[0]?.foreshadowing_actions).toContainEqual({
      id: "fs_auto_ch001_sc01_kp01",
      action: "plant",
    });
    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]).toMatchObject({
      id: "fs_auto_ch001_sc01_kp01",
      planted_at: 1,
      reveal_at: 5,
      status: "pending",
      description: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
      origin: {
        episode_id: "ep_001",
        scene_id: "scene_001_01",
      },
    });
    expect(seed.foreshadowing[0]?.origin?.source_span.excerpt).toContain("엘리시아의 손목에 붉은 낙인이 새겨진다");
  });

  it("does not duplicate the same planned foreshadowing when blueprints are regenerated", async () => {
    const seed = makeSeed();

    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 1,
            title: "붉은 낙인이 깨어난 밤",
            arc_id: "arc_1",
            one_liner: "엘리시아가 회귀의 징표를 발견한다",
            role_in_arc: "setup",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 거울 앞에서 손목에 떠오른 붉은 낙인을 보고 세레나 크레센트와 숨긴다.",
                type: "hook",
                characters: ["elysia", "serena"],
                estimated_chars: 1500,
                emotional_tone: "불안",
                must_reveal: [
                  "엘리시아의 손목에 붉은 낙인이 새겨진다",
                  "세레나는 그 낙인이 10년 전 금서 사건과 닮았다고 숨긴다",
                ],
                how: "거울 확인 → 붉은 낙인 발견 → 세레나가 표정을 감춤",
                leads_to: "낙인의 기원이 후반부 조사로 이어진다",
              },
            ],
            dependencies: [],
            emotional_arc: "충격 → 의심",
            key_points: [
              {
                what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                reveal: "delayed",
                reveal_at: 5,
                caused_by: "회귀 직후 거울 앞에서 봉인 반응이 되살아났다",
                consequence: "세레나가 낙인의 기원을 숨기며 조사선을 따로 만든다",
              },
            ],
            characters_involved: ["elysia", "serena"],
            tension_level: 6,
            foreshadowing_actions: [],
            curiosity_hook: "왜 엘리시아의 낙인이 금서 사건 생존자의 표식과 일치하는가?",
            target_word_count: 2000,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);

    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
  });

  it("keeps the first foreshadow origin when a later chapter repeats the same delayed point", async () => {
    const seed = makeSeed();

    mockCallStructured
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 1,
              title: "붉은 낙인이 깨어난 밤",
              arc_id: "arc_1",
              one_liner: "엘리시아가 회귀의 징표를 발견한다",
              role_in_arc: "setup",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 거울 앞에서 손목에 떠오른 붉은 낙인을 보고 세레나 크레센트와 숨긴다.",
                  type: "hook",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "불안",
                  must_reveal: [
                    "엘리시아의 손목에 붉은 낙인이 새겨진다",
                    "세레나는 그 낙인이 10년 전 금서 사건과 닮았다고 숨긴다",
                  ],
                  how: "거울 확인 → 붉은 낙인 발견 → 세레나가 표정을 감춤",
                  leads_to: "낙인의 기원이 후반부 조사로 이어진다",
                },
              ],
              dependencies: [],
              emotional_arc: "충격 → 의심",
              key_points: [
                {
                  what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                  why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                  reveal: "delayed",
                  reveal_at: 5,
                  caused_by: "회귀 직후 거울 앞에서 봉인 반응이 되살아났다",
                  consequence: "세레나가 낙인의 기원을 숨기며 조사선을 따로 만든다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 6,
              foreshadowing_actions: [],
              curiosity_hook: "왜 엘리시아의 낙인이 금서 사건 생존자의 표식과 일치하는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      })
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 2,
              title: "도서관의 확인",
              arc_id: "arc_1",
              one_liner: "엘리시아가 낙인에 대한 기록을 다시 마주한다",
              role_in_arc: "rising_action",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 황실 도서관에서 붉은 낙인 기록을 뒤지다 세레나 크레센트의 반응을 떠올린다.",
                  type: "discovery",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "의심",
                  must_reveal: [
                    "엘리시아는 붉은 낙인을 다시 확인하지만 정체는 아직 모른다",
                    "세레나가 10년 전 금서 사건 기록을 감춘 흔적이 남아 있다",
                  ],
                  how: "서고 탐색 → 낙인 관련 기록 발견 → 세레나의 은폐를 의심",
                  leads_to: "낙인의 기원을 둘러싼 조사선이 더 깊어진다",
                },
              ],
              dependencies: [1],
              emotional_arc: "의심 → 집착",
              key_points: [
                {
                  what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                  why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                  reveal: "delayed",
                  reveal_at: 5,
                  caused_by: "도서관 기록이 첫 장면의 낙인을 다시 떠올리게 만든다",
                  consequence: "엘리시아가 낙인의 정체를 추적하기 시작한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 7,
              foreshadowing_actions: [],
              curiosity_hook: "세레나는 왜 낙인의 정체를 숨겼는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      });

    const first = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    const second = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 2);

    expect(first.data[0]?.foreshadowing_actions).toContainEqual({
      id: "fs_auto_ch001_sc01_kp01",
      action: "plant",
    });
    expect(second.data[0]?.foreshadowing_actions).toEqual([]);
    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
    expect(seed.foreshadowing[0]?.origin).toMatchObject({
      episode_id: "ep_001",
      scene_id: "scene_001_01",
    });
    expect(seed.foreshadowing[0]?.origin?.source_span.excerpt).toContain("엘리시아의 손목에 붉은 낙인이 새겨진다");
    expect(seed.foreshadowing[0]?.hints_at).toEqual([2]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
  });

  it("keeps the original foreshadow origin when a later scene in the same chapter only mentions it again", async () => {
    const seed = makeSeed();

    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 1,
            title: "붉은 낙인이 깨어난 밤",
            arc_id: "arc_1",
            one_liner: "엘리시아가 낙인을 발견하고 세레나의 반응을 의심한다",
            role_in_arc: "setup",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 거울 앞에서 손목에 떠오른 붉은 낙인을 처음 확인한다.",
                type: "hook",
                characters: ["elysia"],
                estimated_chars: 1200,
                emotional_tone: "충격",
                must_reveal: [
                  "엘리시아의 손목에 붉은 낙인이 새겨진다",
                ],
                how: "거울 확인 → 붉은 낙인 발견",
                leads_to: "정체를 숨긴 낙인이 이후 조사선의 출발점이 된다",
              },
              {
                purpose: "세레나 크레센트가 엘리시아의 손목을 다시 붙잡고 같은 붉은 낙인을 감추라고 재촉한다.",
                type: "reaction",
                characters: ["elysia", "serena"],
                estimated_chars: 1200,
                emotional_tone: "불안",
                must_reveal: [
                  "세레나는 엘리시아의 붉은 낙인을 다시 보고도 정체를 말하지 않는다",
                ],
                how: "세레나가 손목을 붙잡음 → 낙인을 다시 확인 → 침묵을 강요",
                leads_to: "세레나가 숨기는 이유를 엘리시아가 의심하게 된다",
              },
            ],
            dependencies: [],
            emotional_arc: "충격 → 의심",
            key_points: [
              {
                what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                reveal: "delayed",
                reveal_at: 5,
                caused_by: "회귀 직후 거울 앞에서 봉인 반응이 되살아났다",
                consequence: "세레나가 낙인의 기원을 숨기며 조사선을 따로 만든다",
              },
              {
                what: "세레나는 엘리시아의 붉은 낙인을 다시 보고도 정체를 말하지 않는다",
                why: "세레나가 그 표식을 왜 두려워하는지 후반부에 밝혀진다",
                reveal: "delayed",
                reveal_at: 5,
                caused_by: "첫 장면에서 드러난 낙인을 세레나가 같은 밤 다시 목격했다",
                consequence: "엘리시아는 세레나의 침묵 자체를 단서로 의심한다",
              },
            ],
            characters_involved: ["elysia", "serena"],
            tension_level: 7,
            foreshadowing_actions: [],
            curiosity_hook: "세레나는 왜 그 붉은 낙인의 정체를 감추는가?",
            target_word_count: 2400,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    const result = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);

    expect(seed.foreshadowing).toHaveLength(1);
    expect(result.data[0]?.foreshadowing_actions).toEqual([
      { id: "fs_auto_ch001_sc01_kp01", action: "plant" },
    ]);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
    expect(seed.foreshadowing[0]?.origin).toMatchObject({
      episode_id: "ep_001",
      scene_id: "scene_001_01",
    });
    expect(seed.foreshadowing[0]?.origin?.source_span.excerpt).toContain("엘리시아의 손목에 붉은 낙인이 새겨진다");
    expect(seed.foreshadowing[0]?.description).toContain("세레나가 그 표식을 왜 두려워하는지 후반부에 밝혀진다");
    expect(seed.foreshadowing[0]?.hints_at).toEqual([1]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
  });

  it("stores every merged hint occurrence reference with full provenance even when hints collapse to one chapter", async () => {
    const seed = makeSeed();

    mockCallStructured
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 1,
              title: "잠긴 북회랑의 물결",
              arc_id: "arc_1",
              one_liner: "엘리시아가 북회랑 봉인문 전조를 처음 목격한다",
              role_in_arc: "setup",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 연못 수면 위로 스치는 검은 파문을 보고 세레나 크레센트의 동요를 눈치챈다.",
                  type: "hook",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "불길",
                  must_reveal: [
                    "연못 수면에 북회랑 봉인문을 향한 검은 파문이 잠깐 떠오른다",
                    "세레나는 파문을 보자마자 엘리시아를 서둘러 데리고 나온다",
                  ],
                  how: "수면 확인 → 검은 파문 포착 → 세레나가 대화를 끊고 철수",
                  leads_to: "엘리시아는 파문이 북회랑 봉인문과 이어진 전조라고 의심한다",
                },
              ],
              dependencies: [],
              emotional_arc: "호기심 → 불안",
              key_points: [
                {
                  what: "연못 수면에 북회랑 봉인문을 향한 검은 파문이 잠깐 떠오른다",
                  why: "그 파문이 북회랑 봉인문 개방 직전에만 생기는 방출 신호였다는 사실이 나중에 밝혀진다",
                  reveal: "delayed",
                  reveal_at: 9,
                  caused_by: "봉인문 안쪽 압력이 연못 수면으로 먼저 누출되었다",
                  consequence: "엘리시아는 파문의 방향과 북회랑 기록을 함께 추적한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 6,
              foreshadowing_actions: [],
              curiosity_hook: "연못의 검은 파문은 왜 북회랑 봉인문을 향해 말려 들어갔는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      })
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 2,
              title: "같은 경보의 밤",
              arc_id: "arc_1",
              one_liner: "엘리시아가 같은 봉인문 신호를 두 번 더 포착한다",
              role_in_arc: "rising_action",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 지하 수로 쇠사슬 진동을 듣고 전날 본 파문을 떠올린다.",
                  type: "discovery",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "의심",
                  must_reveal: [
                    "지하 수로 쇠사슬이 북회랑 봉인문 개방을 예고하듯 일정하게 울린다",
                    "세레나는 그 리듬을 듣고도 연못 파문 이야기를 다시 꺼내지 못하게 막는다",
                  ],
                  how: "수로 진입 → 쇠사슬 진동 청취 → 세레나가 대화를 차단",
                  leads_to: "엘리시아는 파문과 진동을 같은 경보로 묶기 시작한다",
                },
                {
                  purpose: "엘리시아 크레센트가 북회랑 문고리에서 같은 경보음을 다시 듣고 수첩에 적어 둔다.",
                  type: "discovery",
                  characters: ["elysia"],
                  estimated_chars: 1400,
                  emotional_tone: "집착",
                  must_reveal: [
                    "북회랑 문고리 안쪽에서 같은 경보음이 다시 짧게 울린다",
                    "엘리시아는 연못 파문과 수로 진동이 하나의 봉인문 경보라고 확신한다",
                  ],
                  how: "문고리 접촉 → 같은 경보음 청취 → 엘리시아가 메모",
                  leads_to: "엘리시아는 세 번 반복된 신호를 같은 북회랑 봉인문 전조로 정리한다",
                },
              ],
              dependencies: [1],
              emotional_arc: "의심 → 확신",
              key_points: [
                {
                  what: "지하 수로 쇠사슬이 북회랑 봉인문 개방을 예고하듯 일정하게 울린다",
                  why: "그 진동이 북회랑 봉인문 개방 직전 반복되는 동일 경보였다는 사실이 나중에 밝혀진다",
                  reveal: "delayed",
                  reveal_at: 9,
                  caused_by: "봉인 장치의 압력이 수로 쇠사슬로 먼저 전달되었다",
                  consequence: "엘리시아는 연못 파문과 수로 진동을 하나의 봉인문 신호로 묶는다",
                },
                {
                  what: "북회랑 문고리 안쪽에서 같은 경보음이 다시 짧게 울린다",
                  why: "그 경보음도 북회랑 봉인문 개방 직전 반복되는 동일 경보였다는 사실이 나중에 밝혀진다",
                  reveal: "delayed",
                  reveal_at: 9,
                  caused_by: "봉인문 바깥 경첩에도 같은 압력 경보가 전달되었다",
                  consequence: "엘리시아는 세 번 반복된 신호를 같은 북회랑 봉인문 전조로 정리한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 7,
              foreshadowing_actions: [],
              curiosity_hook: "같은 경보가 왜 연못과 수로와 문고리에서 연달아 울리는가?",
              target_word_count: 2200,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      });

    await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 2);

    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.origin).toMatchObject({
      episode_id: "ep_001",
      scene_id: "scene_001_01",
    });
    expect(seed.foreshadowing[0]?.hints_at).toEqual([2]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
    expect(seed.foreshadowing[0]?.linked_hint_occurrences).toEqual([
      {
        episode_id: "ep_002",
        scene_id: "scene_002_01",
        source_span: expect.objectContaining({
          excerpt: "지하 수로 쇠사슬이 북회랑 봉인문 개방을 예고하듯 일정하게 울린다",
        }),
      },
      {
        episode_id: "ep_002",
        scene_id: "scene_002_02",
        source_span: expect.objectContaining({
          excerpt: "북회랑 문고리 안쪽에서 같은 경보음이 다시 짧게 울린다",
        }),
      },
    ]);
  });

  it("carries forward duplicate foreshadow provenance chains when later records collapse into the earliest origin", async () => {
    const seed = makeSeed();
    seed.foreshadowing.push(
      {
        id: "fs_auto_ch001_sc01_kp01",
        name: "연못 수면의 검은 파문",
        description: "북회랑 봉인문 개방 직전 나타나는 동일 경보다",
        canonical_target: "북회랑 봉인문 개방 경보",
        importance: "normal",
        planted_at: 1,
        hints_at: [],
        reveal_at: 9,
        origin: {
          episode_id: "ep_001",
          scene_id: "scene_001_01",
          source_span: {
            start_offset: 0,
            end_offset: 20,
            excerpt: "연못 수면에 북회랑 봉인문을 향한 검은 파문이 잠깐 떠오른다",
          },
        },
        linked_hint_occurrences: [],
        status: "pending",
        hint_count: 0,
      },
      {
        id: "fs_auto_ch002_sc01_kp01",
        name: "지하 수로 쇠사슬의 경보 진동",
        description: "북회랑 봉인문 개방 직전 나타나는 동일 경보다",
        canonical_target: "북회랑 봉인문 개방 경보",
        importance: "normal",
        planted_at: 2,
        hints_at: [2],
        reveal_at: 9,
        origin: {
          episode_id: "ep_002",
          scene_id: "scene_002_01",
          source_span: {
            start_offset: 0,
            end_offset: 25,
            excerpt: "지하 수로 쇠사슬이 북회랑 봉인문 개방을 예고하듯 일정하게 울린다",
          },
        },
        linked_hint_occurrences: [
          {
            episode_id: "ep_002",
            scene_id: "scene_002_02",
            source_span: {
              start_offset: 0,
              end_offset: 24,
              excerpt: "북회랑 문고리 안쪽에서 같은 경보음이 다시 짧게 울린다",
            },
          },
        ],
        status: "pending",
        hint_count: 1,
      },
    );

    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 3,
            title: "세 번째 신호",
            arc_id: "arc_1",
            one_liner: "엘리시아가 같은 봉인문 경보를 또 한 번 확인한다",
            role_in_arc: "rising_action",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 북회랑 입구에서 다시 울린 경보를 듣고 연못 파문과 수로 진동을 하나로 묶는다.",
                type: "discovery",
                characters: ["elysia", "serena"],
                estimated_chars: 1500,
                emotional_tone: "확신",
                must_reveal: [
                  "북회랑 입구 문틈에서 같은 경보음이 세 번째로 짧게 울린다",
                  "엘리시아는 연못 파문과 수로 진동, 문틈 경보를 같은 봉인문 신호라고 정리한다",
                ],
                how: "북회랑 접근 → 동일 경보 청취 → 세 개의 신호를 한 묶음으로 메모",
                leads_to: "엘리시아는 봉인문 개방 시점을 역산하기 시작한다",
              },
            ],
            dependencies: [1, 2],
            emotional_arc: "의심 → 확신",
            key_points: [
              {
                what: "북회랑 입구 문틈에서 같은 경보음이 세 번째로 짧게 울린다",
                why: "그 경보음이 북회랑 봉인문 개방 직전 반복되는 동일 경보였다는 사실이 나중에 밝혀진다",
                reveal: "delayed",
                reveal_at: 9,
                caused_by: "봉인문 압력이 북회랑 입구 경첩까지 전달되었다",
                consequence: "엘리시아는 세 번 반복된 신호를 하나의 봉인문 개방 예고로 묶는다",
              },
            ],
            characters_involved: ["elysia", "serena"],
            tension_level: 7,
            foreshadowing_actions: [],
            curiosity_hook: "왜 같은 경보가 북회랑 주변에서 반복되는가?",
            target_word_count: 2100,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    const result = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 3);

    expect(result.data[0]?.foreshadowing_actions).toEqual([]);
    expect(seed.foreshadowing).toHaveLength(2);

    const canonicalForeshadowing = seed.foreshadowing.find((entry) =>
      entry.id === "fs_auto_ch001_sc01_kp01"
      && entry.lifecycle !== "intentionally_abandoned"
    );
    const abandonedDuplicate = seed.foreshadowing.find((entry) =>
      entry.id === "fs_auto_ch002_sc01_kp01"
    );

    expect(canonicalForeshadowing?.origin).toMatchObject({
      episode_id: "ep_001",
      scene_id: "scene_001_01",
    });
    expect(canonicalForeshadowing?.hints_at).toEqual([2, 3]);
    expect(canonicalForeshadowing?.hint_count).toBe(2);
    expect(canonicalForeshadowing?.linked_hint_occurrences).toEqual([
      {
        episode_id: "ep_002",
        scene_id: "scene_002_01",
        source_span: expect.objectContaining({
          excerpt: "지하 수로 쇠사슬이 북회랑 봉인문 개방을 예고하듯 일정하게 울린다",
        }),
      },
      {
        episode_id: "ep_002",
        scene_id: "scene_002_02",
        source_span: expect.objectContaining({
          excerpt: "북회랑 문고리 안쪽에서 같은 경보음이 다시 짧게 울린다",
        }),
      },
      {
        episode_id: "ep_003",
        scene_id: "scene_003_01",
        source_span: expect.objectContaining({
          excerpt: "북회랑 입구 문틈에서 같은 경보음이 세 번째로 짧게 울린다",
        }),
      },
    ]);
    expect(abandonedDuplicate).toMatchObject({
      id: "fs_auto_ch002_sc01_kp01",
      lifecycle: "intentionally_abandoned",
      abandonment_marker: "intentional-abandonment:merged-into:fs_auto_ch001_sc01_kp01",
      status: "retired",
      verification_metadata: {
        source_episode_ids: ["ep_002"],
        source_scene_ids: ["scene_002_01", "scene_002_02"],
        source_occurrence_count: 2,
      },
    });
  });

  it("treats a later clarified restatement as a reference to the original foreshadowing", async () => {
    const seed = makeSeed();

    mockCallStructured
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 1,
              title: "붉은 낙인이 깨어난 밤",
              arc_id: "arc_1",
              one_liner: "엘리시아가 회귀의 징표를 발견한다",
              role_in_arc: "setup",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 거울 앞에서 손목에 떠오른 붉은 낙인을 보고 세레나 크레센트와 숨긴다.",
                  type: "hook",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "불안",
                  must_reveal: [
                    "엘리시아의 손목에 붉은 낙인이 새겨진다",
                    "세레나는 그 낙인이 10년 전 금서 사건과 닮았다고 숨긴다",
                  ],
                  how: "거울 확인 → 붉은 낙인 발견 → 세레나가 표정을 감춤",
                  leads_to: "낙인의 기원이 후반부 조사로 이어진다",
                },
              ],
              dependencies: [],
              emotional_arc: "충격 → 의심",
              key_points: [
                {
                  what: "엘리시아의 손목에 붉은 낙인이 새겨진다",
                  why: "그 낙인이 황실 금서 사건 생존자의 표식임이 나중에 드러난다",
                  reveal: "delayed",
                  reveal_at: 5,
                  caused_by: "회귀 직후 거울 앞에서 봉인 반응이 되살아났다",
                  consequence: "세레나가 낙인의 기원을 숨기며 조사선을 따로 만든다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 6,
              foreshadowing_actions: [],
              curiosity_hook: "왜 엘리시아의 낙인이 금서 사건 생존자의 표식과 일치하는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      })
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 2,
              title: "도서관의 붉은 기록",
              arc_id: "arc_1",
              one_liner: "엘리시아가 낙인의 의미를 더 구체적으로 의심한다",
              role_in_arc: "rising_action",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 황실 도서관에서 붉은 낙인 도판과 생존자 명부를 함께 확인하며 세레나 크레센트의 침묵을 떠올린다.",
                  type: "discovery",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1600,
                  emotional_tone: "의심",
                  must_reveal: [
                    "엘리시아는 손목의 붉은 낙인을 다시 확인한다",
                    "낙인 도판 옆에는 금서 사건 생존자에게 남은 봉인 표식이라는 메모가 있다",
                  ],
                  how: "도판 대조 → 생존자 명부 확인 → 세레나의 침묵을 의심",
                  leads_to: "엘리시아가 낙인과 금서 사건의 연결을 집요하게 추적한다",
                },
              ],
              dependencies: [1],
              emotional_arc: "의심 → 집착",
              key_points: [
                {
                  what: "엘리시아는 손목의 붉은 낙인이 금서 사건 생존자 표식과 이어진다는 단서를 다시 확인한다",
                  why: "그 붉은 낙인이 황실 금서 사건 생존자에게 남은 봉인 표식이며 세레나가 그 진실을 숨겼다는 사실이 나중에 드러난다",
                  reveal: "delayed",
                  reveal_at: 5,
                  caused_by: "도서관에서 첫 장면의 낙인과 같은 도판을 다시 확인했다",
                  consequence: "엘리시아가 낙인의 정체와 세레나의 은폐를 함께 추적한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 7,
              foreshadowing_actions: [],
              curiosity_hook: "세레나는 왜 생존자 표식의 진실을 숨기고 있는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      });

    const first = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    const second = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 2);

    expect(first.data[0]?.foreshadowing_actions).toContainEqual({
      id: "fs_auto_ch001_sc01_kp01",
      action: "plant",
    });
    expect(second.data[0]?.foreshadowing_actions).toEqual([]);
    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
    expect(seed.foreshadowing[0]?.description).toContain("그 붉은 낙인이 황실 금서 사건 생존자에게 남은 봉인 표식이며 세레나가 그 진실을 숨겼다는 사실이 나중에 드러난다");
    expect(seed.foreshadowing[0]?.origin).toMatchObject({
      episode_id: "ep_001",
      scene_id: "scene_001_01",
    });
    expect(seed.foreshadowing[0]?.hints_at).toEqual([2]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
  });

  it("normalizes differently worded hint mentions to the same canonical target", async () => {
    const seed = makeSeed();

    mockCallStructured
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 1,
              title: "검은 수면의 첫 신호",
              arc_id: "arc_1",
              one_liner: "엘리시아가 연못 위 문양의 불길한 떨림을 목격한다",
              role_in_arc: "setup",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 새벽 연못 위로 솟는 검은 문양의 떨림을 목격하고 세레나 크레센트가 이를 덮으려 한다.",
                  type: "hook",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "불안",
                  must_reveal: [
                    "연못 위에 검은 문양이 잠깐 떠올랐다가 사라진다",
                    "세레나는 그 문양을 본 즉시 시선을 돌리며 화제를 끊는다",
                  ],
                  how: "수면 반사 확인 → 검은 문양이 번쩍임 → 세레나가 즉시 덮음",
                  leads_to: "엘리시아는 문양이 더 큰 사건의 신호라고 의심한다",
                },
              ],
              dependencies: [],
              emotional_arc: "평온 → 불안",
              key_points: [
                {
                  what: "연못 위에 검은 문양이 잠깐 떠올랐다가 사라진다",
                  why: "그 문양이 북회랑 봉인문이 열릴 때 먼저 나타나는 개방 신호라는 사실이 나중에 드러난다",
                  reveal: "delayed",
                  reveal_at: 7,
                  caused_by: "봉인문 아래에 눌린 마력이 수면에 먼저 새어 나왔다",
                  consequence: "엘리시아는 문양의 출처를 추적하다 북회랑 기록으로 향한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 6,
              foreshadowing_actions: [],
              curiosity_hook: "세레나는 왜 북회랑과 닿은 그 문양을 보자마자 침묵했는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      })
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 2,
              title: "쇠사슬이 우는 수로",
              arc_id: "arc_1",
              one_liner: "엘리시아가 다른 징후를 통해 같은 봉인 사건을 감지한다",
              role_in_arc: "rising_action",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 지하 수로에서 울리는 쇠사슬 진동을 듣고 세레나 크레센트의 전날 침묵을 떠올린다.",
                  type: "discovery",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1600,
                  emotional_tone: "의심",
                  must_reveal: [
                    "지하 수로에서 쇠사슬 진동이 울려 퍼진다",
                    "세레나는 그 소리를 듣고도 연못 문양 이야기를 꺼내지 못하게 막는다",
                  ],
                  how: "수로 진입 → 쇠사슬 진동 청취 → 세레나가 말을 막음",
                  leads_to: "엘리시아는 두 징후가 같은 재난을 가리킨다고 확신한다",
                },
              ],
              dependencies: [1],
              emotional_arc: "의심 → 확신",
              key_points: [
                {
                  what: "지하 수로의 쇠사슬 진동이 곧 북회랑 봉인문 개방을 알리는 전조였다는 단서가 다시 나타난다",
                  why: "그 진동이 7화 북회랑 봉인문 개방 직전에 반복되는 동일한 개방 신호였음이 후반부에 밝혀진다",
                  reveal: "delayed",
                  reveal_at: 7,
                  caused_by: "북회랑 아래 봉인 장치가 수로 쇠사슬을 먼저 흔들었다",
                  consequence: "엘리시아는 연못 문양과 수로 진동을 하나의 봉인문 개방 징후로 묶어 추적한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 7,
              foreshadowing_actions: [],
              curiosity_hook: "수로의 진동과 연못의 문양은 왜 같은 밤의 징후처럼 이어지는가?",
              target_word_count: 2100,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      });

    const first = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    const second = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 2);

    expect(first.data[0]?.foreshadowing_actions).toContainEqual({
      id: "fs_auto_ch001_sc01_kp01",
      action: "plant",
    });
    expect(second.data[0]?.foreshadowing_actions).toEqual([]);
    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("북회랑");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("봉인문");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("개방");
    expect(seed.foreshadowing[0]?.hints_at).toEqual([2]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
  });

  it("merges same canonical target hints even when later mentions predict a different reveal chapter", async () => {
    const seed = makeSeed();

    mockCallStructured
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 1,
              title: "잠긴 북회랑의 물결",
              arc_id: "arc_1",
              one_liner: "엘리시아가 연못 수면의 이상한 파문을 처음 목격한다",
              role_in_arc: "setup",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 북회랑 쪽으로 흐르는 검은 파문을 보고 세레나 크레센트의 동요를 감지한다.",
                  type: "hook",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1500,
                  emotional_tone: "불길",
                  must_reveal: [
                    "연못 수면에 북회랑 쪽으로 말려 들어가는 검은 파문이 생긴다",
                    "세레나는 그 방향을 보자마자 대화를 끊고 엘리시아를 데리고 나온다",
                  ],
                  how: "수면 확인 → 검은 파문 포착 → 세레나가 황급히 철수",
                  leads_to: "엘리시아는 파문이 북회랑 봉인문과 이어진 징후라고 의심한다",
                },
              ],
              dependencies: [],
              emotional_arc: "호기심 → 불안",
              key_points: [
                {
                  what: "연못 수면의 검은 파문이 북회랑 봉인문 개방 직전에 나타나는 첫 전조라는 단서가 드러난다",
                  why: "그 파문이 북회랑 봉인문 개방 직전에만 생기는 방출 신호였다는 사실이 나중에 밝혀진다",
                  reveal: "delayed",
                  reveal_at: 9,
                  caused_by: "봉인문 안쪽 압력이 연못 수면으로 먼저 누출되었다",
                  consequence: "엘리시아는 파문의 방향과 북회랑 기록을 함께 추적한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 6,
              foreshadowing_actions: [],
              curiosity_hook: "연못의 검은 파문은 왜 북회랑을 향해 말려 들어갔는가?",
              target_word_count: 2000,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      })
      .mockResolvedValueOnce({
        data: {
          chapter_blueprints: [
            {
              chapter_number: 2,
              title: "쇠사슬 아래 숨은 호흡",
              arc_id: "arc_1",
              one_liner: "엘리시아가 수로의 진동에서 같은 봉인문 신호를 포착한다",
              role_in_arc: "rising_action",
              scenes: [
                {
                  purpose: "엘리시아 크레센트가 지하 수로 쇠사슬의 떨림을 듣고 전날 본 연못 파문과 연결 짓는다.",
                  type: "discovery",
                  characters: ["elysia", "serena"],
                  estimated_chars: 1600,
                  emotional_tone: "의심",
                  must_reveal: [
                    "지하 수로 쇠사슬이 북회랑 방향으로 일정하게 울린다",
                    "세레나는 그 리듬을 듣고도 파문 이야기를 다시 꺼내지 못하게 막는다",
                  ],
                  how: "수로 진입 → 쇠사슬 진동 청취 → 세레나가 대화 차단",
                  leads_to: "엘리시아는 연못 파문과 수로 진동을 같은 사건의 예고로 묶는다",
                },
              ],
              dependencies: [1],
              emotional_arc: "의심 → 확신",
              key_points: [
                {
                  what: "지하 수로 쇠사슬의 진동 역시 북회랑 봉인문 개방 전조라는 동일한 징후가 재확인된다",
                  why: "그 진동과 연못 파문이 모두 북회랑 봉인문 개방 직전 반복되는 동일 경보였다는 사실이 더 늦게 드러난다",
                  reveal: "delayed",
                  reveal_at: 12,
                  caused_by: "봉인 장치의 압력이 수로 쇠사슬과 연못 수면에 함께 전달되었다",
                  consequence: "엘리시아는 두 현상을 하나의 봉인문 개방 신호로 정리해 추적한다",
                },
              ],
              characters_involved: ["elysia", "serena"],
              tension_level: 7,
              foreshadowing_actions: [],
              curiosity_hook: "수로 진동과 연못 파문은 왜 같은 봉인문 개방을 예고하는가?",
              target_word_count: 2100,
            },
          ],
        },
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
      });

    await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 1);
    const second = await generateChapterBlueprints(seed, makeArc(), [], undefined, null, 2);

    expect(second.data[0]?.foreshadowing_actions).toEqual([]);
    expect(seed.foreshadowing).toHaveLength(1);
    expect(seed.foreshadowing[0]?.id).toBe("fs_auto_ch001_sc01_kp01");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("북회랑");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("봉인문");
    expect(seed.foreshadowing[0]?.canonical_target).toContain("개방");
    expect(seed.foreshadowing[0]?.reveal_at).toBe(9);
    expect(seed.foreshadowing[0]?.hints_at).toEqual([2]);
    expect(seed.foreshadowing[0]?.hint_count).toBe(1);
  });
});
