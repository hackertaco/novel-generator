import type { ForeshadowLifecycleStatus, Foreshadowing } from "@/lib/schema/foreshadowing";
import type { NovelSeed, PlotArc, StoryThread } from "@/lib/schema/novel";
import type {
  CharacterBeliefCanonicalAlignment,
  CharacterDivergenceCauseKind,
} from "./cognitive-dissonance";
import type { CharacterMemoryAccuracy } from "./memory-state";
import type { ObjectiveFactCategory } from "./objective-facts";
import type { SimulationEvent } from "./types";

export const LONG_FORM_VALIDATION_SCENARIO_ID = "astral-court-deterministic-300";
export const LONG_FORM_VALIDATION_TOTAL_EPISODES = 300;

export type ValidationScenarioRecordType = "memory" | "belief" | "utterance";

export interface ValidationScenarioFactSnapshot {
  factKey: string;
  subject: string;
  predicate: string;
  object: string;
  category: ObjectiveFactCategory;
  summary: string;
}

export interface ValidationScenarioMismatchAttribution {
  mismatchId: string;
  characterId: string;
  recordType: ValidationScenarioRecordType;
  mismatchType: "canonical_conflict";
  causeKind: CharacterDivergenceCauseKind;
  sourceEventId: string;
  canonicalFactKeys: string[];
  explanation: string;
}

export interface ValidationScenarioMemoryExpectation {
  characterId: string;
  summary: string;
  truthAlignment: CharacterMemoryAccuracy;
  causeEventId?: string;
  canonicalFactKeys: string[];
}

export interface ValidationScenarioBeliefExpectation {
  characterId: string;
  belief: string;
  canonicalAlignment: CharacterBeliefCanonicalAlignment;
  causeEventId?: string;
  canonicalFactKeys: string[];
}

export interface ValidationScenarioUtteranceExpectation {
  characterId: string;
  sceneId: string;
  line: string;
  canonicalAlignment: CharacterBeliefCanonicalAlignment;
  causeEventId?: string;
  canonicalFactKeys: string[];
}

export interface ValidationScenarioForeshadowExpectation {
  foreshadowId: string;
  lifecycle: ForeshadowLifecycleStatus;
  expectedPayoffEpisode: number;
}

export interface ValidationScenarioCheckpoint {
  chapter: number;
  label: string;
  notes: string;
  requiredEventIds: string[];
  activeFactKeys: string[];
  memoryExpectations: ValidationScenarioMemoryExpectation[];
  beliefExpectations: ValidationScenarioBeliefExpectation[];
  utteranceExpectations: ValidationScenarioUtteranceExpectation[];
  foreshadowExpectations: ValidationScenarioForeshadowExpectation[];
  expectedMismatchIds: string[];
}

export interface ValidationScenarioEventRecord {
  episode: number;
  arcId: string;
  event: SimulationEvent;
  canonicalFactChanges: ValidationScenarioFactSnapshot[];
  directExperienceCharacterIds: string[];
  informedCharacterIds: string[];
  interpretationEligibleCharacterIds: string[];
  expectedMemoryOutcomes: ValidationScenarioMemoryExpectation[];
  expectedBeliefOutcomes: ValidationScenarioBeliefExpectation[];
  expectedUtteranceOutcomes: ValidationScenarioUtteranceExpectation[];
  expectedMismatchAttributions: ValidationScenarioMismatchAttribution[];
  continuityTags: string[];
}

export interface DeterministicLongFormValidationScenario {
  id: string;
  totalEpisodes: number;
  seed: NovelSeed;
  groundTruthCausalEvents: ValidationScenarioEventRecord[];
  continuityCheckpoints: ValidationScenarioCheckpoint[];
}

interface ArcTemplate {
  id: string;
  name: string;
  start: number;
  end: number;
  climax: number;
  location: string;
  secondaryLocation: string;
  clueSubject: string;
  clueObject: string;
  summary: string;
}

const CHARACTER_NAMES = {
  haeon: "해온",
  jisu: "지수",
  taeyul: "태율",
  regent: "서린",
} as const;

const ARC_TEMPLATES: ArcTemplate[] = [
  {
    id: "sealed-observatory",
    name: "봉인된 관측소",
    start: 1,
    end: 50,
    climax: 48,
    location: "왕립 관측소",
    secondaryLocation: "북문 회랑",
    clueSubject: "별인장 장부",
    clueObject: "소실된 왕세자 이동 기록",
    summary: "관측소 화재와 사라진 왕세자의 연결고리를 추적한다.",
  },
  {
    id: "river-cipher",
    name: "강변 암호",
    start: 51,
    end: 100,
    climax: 96,
    location: "침수 별관",
    secondaryLocation: "하천 금고",
    clueSubject: "월쇄 열쇠",
    clueObject: "하천 금고 도면",
    summary: "강변 금고와 가짜 사망 보고의 배후를 드러낸다.",
  },
  {
    id: "false-heir",
    name: "가짜 후계자",
    start: 101,
    end: 150,
    climax: 144,
    location: "은거울 회랑",
    secondaryLocation: "등기원 서고",
    clueSubject: "대체 족보",
    clueObject: "위조된 후계 등록부",
    summary: "가짜 후계자를 세운 섭정의 위조 체계를 추적한다.",
  },
  {
    id: "mirror-prison",
    name: "거울 감옥",
    start: 151,
    end: 200,
    climax: 192,
    location: "거울 감옥",
    secondaryLocation: "쇄파 지하로",
    clueSubject: "조류 기관 설계도",
    clueObject: "일식전 기동 순서",
    summary: "숨겨진 후계자를 찾고 일식전의 기동 조건을 해독한다.",
  },
  {
    id: "eclipse-machine",
    name: "일식전 기동",
    start: 201,
    end: 250,
    climax: 240,
    location: "일식전",
    secondaryLocation: "남해 교섭실",
    clueSubject: "강화 초안",
    clueObject: "가짜 항복 각서",
    summary: "섭정의 가짜 항복과 일식전 장치를 분리해 해석한다.",
  },
  {
    id: "restoration-war",
    name: "복권 전야",
    start: 251,
    end: 300,
    climax: 300,
    location: "황궁 대법정",
    secondaryLocation: "새벽 제단",
    clueSubject: "서약 원문",
    clueObject: "복권 조항 원본",
    summary: "서약 원문을 회수해 섭정의 정통성 조작을 끝낸다.",
  },
];

function toEpisodeId(chapter: number): string {
  return `ep_${String(chapter).padStart(3, "0")}`;
}

function pickArc(chapter: number): ArcTemplate {
  return ARC_TEMPLATES.find((arc) => chapter >= arc.start && chapter <= arc.end)
    ?? ARC_TEMPLATES[ARC_TEMPLATES.length - 1];
}

function fact(
  factKey: string,
  subject: string,
  predicate: string,
  object: string,
  category: ObjectiveFactCategory,
  summary: string,
): ValidationScenarioFactSnapshot {
  return {
    factKey,
    subject,
    predicate,
    object,
    category,
    summary,
  };
}

function buildForeshadowing(
  id: string,
  name: string,
  description: string,
  canonicalTarget: string,
  plantedAt: number,
  revealAt: number,
  sceneId: string,
): Foreshadowing {
  return {
    id,
    name,
    description,
    canonical_target: canonicalTarget,
    importance: "normal",
    planted_at: plantedAt,
    hints_at: [],
    reveal_at: revealAt,
    origin: {
      episode_id: toEpisodeId(plantedAt),
      scene_id: sceneId,
      source_span: {
        start_offset: 0,
        end_offset: Math.max(12, description.length),
        excerpt: description,
      },
    },
    linked_hint_occurrences: [],
    verification_metadata: {
      source_episode_ids: [toEpisodeId(plantedAt)],
      source_scene_ids: [sceneId],
      source_occurrence_count: 1,
      shared_target_summary: canonicalTarget,
    },
    lifecycle: "resolved",
    status: "resolved",
    hint_count: 0,
    resolution: {
      status: "full",
      cause: {
        revealed: true,
        chapter: revealAt,
        evidence: [`${toEpisodeId(revealAt)} resolves why ${description}`],
      },
      identity: {
        revealed: true,
        chapter: revealAt,
        evidence: [`${toEpisodeId(revealAt)} identifies ${canonicalTarget}`],
      },
      consequence: {
        revealed: true,
        chapter: revealAt,
        evidence: [`${toEpisodeId(revealAt)} shows the consequence of ${canonicalTarget}`],
      },
    },
  };
}

function buildStoryThreads(): StoryThread[] {
  return [
    {
      id: "main-conspiracy",
      name: "섭정 정통성 조작",
      type: "main",
      description: "섭정 서린이 왕세자 실종과 복권 조항을 조작한 정황을 추적한다.",
      relations: [],
      reveal_timeline: [],
    },
    {
      id: "hidden-heir",
      name: "숨겨진 왕세자 생존",
      type: "secret",
      owner: "taeyul",
      description: "왕세자 태율이 살아 있으며 은닉되어 있다는 사실을 단계적으로 공개한다.",
      relations: [
        {
          target: "main-conspiracy",
          relation: "reveals",
          description: "생존의 증거가 곧 섭정의 조작 증거다.",
        },
      ],
      reveal_timeline: [],
    },
    {
      id: "eclipse-oath",
      name: "일식전 서약",
      type: "plot_twist",
      owner: "haeon",
      description: "관측소와 일식전을 묶는 서약의 원문을 찾아 복권 조항을 복구한다.",
      relations: [
        {
          target: "main-conspiracy",
          relation: "feeds_into",
          description: "서약 원문은 섭정의 정통성 조작을 무효화한다.",
        },
      ],
      reveal_timeline: [],
    },
  ];
}

function buildSeed(): NovelSeed {
  const arcs: PlotArc[] = ARC_TEMPLATES.map((arc) => ({
    id: arc.id,
    name: arc.name,
    start_chapter: arc.start,
    end_chapter: arc.end,
    summary: arc.summary,
    key_events: [
      `${arc.name} 단서 확보`,
      `${arc.name} 가설 충돌`,
      `${arc.name} 클라이맥스`,
    ],
    climax_chapter: arc.climax,
    theme: "진실과 해석의 분리",
  }));

  return {
    title: "황궁 일식록",
    logline: "몰락한 기록관 해온이 300화에 걸쳐 왕세자 실종과 섭정의 정통성 조작을 시뮬레이션 기반으로 추적한다.",
    total_chapters: LONG_FORM_VALIDATION_TOTAL_EPISODES,
    world: {
      name: "성하 제국",
      genre: "판타지",
      sub_genre: "궁정 미스터리",
      time_period: "제국 후기",
      magic_system: "별인장과 조류 기관이 기억 기록과 봉인을 증폭한다.",
      key_locations: {
        "왕립 관측소": "별인장 장부와 왕실 기록이 잠든 관측소",
        "침수 별관": "가짜 사망 보고가 조작된 수장고",
        "거울 감옥": "왕세자 태율이 숨겨진 반사 감옥",
        "일식전": "섭정이 기동하려는 봉인 장치",
        "황궁 대법정": "최종 복권 선고가 이루어지는 장소",
      },
      factions: {
        "성하 황실": "형식상 제국을 다스리는 왕실",
        "서린 섭정파": "왕세자 실종 뒤 실권을 쥔 실무 권력",
        "관측소 기록관단": "별인장 기록과 복권 조항을 관리하는 집단",
      },
      rules: [
        "사실, 기억, 믿음, 발화는 같은 문장이라도 서로 다른 상태로 추적한다.",
        "왕실 복권 조항은 원문과 봉인 증거가 동시에 확보되어야만 효력을 가진다.",
        "별인장 충격은 직접 경험자의 기억을 왜곡할 수 있지만 객관적 사실은 바뀌지 않는다.",
      ],
    },
    characters: [
      {
        id: "haeon",
        name: CHARACTER_NAMES.haeon,
        role: "주인공 기록관",
        social_rank: "gentry",
        introduction_chapter: 1,
        voice: {
          tone: "절제됐지만 끝까지 물고 늘어진다",
          speech_patterns: ["기록은 남아요.", "그건 아직 증명이 아니에요."],
          sample_dialogues: ["원문이 없으면 복권도 없어요."],
          personality_core: "의심을 버리지 않는 집요한 기록관",
        },
        backstory: "관측소 화재 때 가문을 잃고 기록관단에 남은 유일한 생존자다.",
        arc_summary: "증거만 믿던 태도가 사람의 증언과 협력을 받아들이는 방향으로 바뀐다.",
        internal_arc: {
          want: "왕세자 실종의 진실과 서린의 조작을 증명한다",
          need: "완전한 기록이 없더라도 사람을 신뢰하고 결정을 내린다",
          misbelief: "증거가 완전하지 않으면 누구도 믿을 수 없다",
          aha_chapter: 272,
        },
        state: {
          level: null,
          location: "왕립 관측소",
          status: "normal",
          relationships: { jisu: "경계 섞인 협력", taeyul: "부재한 주군", regent: "공적 충성" },
          inventory: ["잔불 장부 조각"],
          secrets_known: ["관측소 화재 직전 복권 조항이 이동되었다"],
          realization_stage: 1,
        },
      },
      {
        id: "jisu",
        name: CHARACTER_NAMES.jisu,
        role: "조력자 수사관",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "빠르고 단도직입적이다",
          speech_patterns: ["먼저 길부터 열죠.", "누가 이득을 보는지만 보면 돼요."],
          sample_dialogues: ["증언보다 동선을 먼저 보죠."],
          personality_core: "행동이 빠른 현실주의 수사관",
        },
        backstory: "하천 금고를 관리하던 집안 출신이라 수문과 밀수 동선을 잘 안다.",
        arc_summary: "즉단형 수사관에서 증거와 사람을 함께 읽는 동반자로 성장한다.",
        state: {
          level: null,
          location: "왕립 관측소",
          status: "normal",
          relationships: { haeon: "불편한 공조", regent: "명령 복종" },
          inventory: ["수문 열쇠"],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "taeyul",
        name: CHARACTER_NAMES.taeyul,
        role: "숨겨진 왕세자",
        social_rank: "royal",
        introduction_chapter: 58,
        voice: {
          tone: "조용하지만 경계가 날카롭다",
          speech_patterns: ["아직 때가 아니에요.", "내 이름은 증거가 될 수 없어요."],
          sample_dialogues: ["거울 감옥 밖에서는 아무도 나를 왕세자라 부르지 않아요."],
          personality_core: "생존을 위해 정체를 숨기는 후계자",
        },
        backstory: "실종 이후 거울 감옥과 별관을 전전하며 살아남았다.",
        arc_summary: "숨는 생존자에서 스스로 이름을 되찾는 후계자로 복권된다.",
        state: {
          level: null,
          location: "거울 감옥",
          status: "hidden",
          relationships: { haeon: "미확인 동맹", regent: "표적" },
          inventory: ["왕세자 인장 파편"],
          secrets_known: ["관측소 서약의 후반부는 새벽 제단에 숨겨져 있다"],
          realization_stage: 2,
        },
      },
      {
        id: "regent",
        name: CHARACTER_NAMES.regent,
        role: "섭정 겸 적대자",
        social_rank: "royal",
        introduction_chapter: 1,
        voice: {
          tone: "온화한 척하지만 압박이 서늘하다",
          speech_patterns: ["제국을 위해서예요.", "오해는 기록이 정리해 줄 겁니다."],
          sample_dialogues: ["왕세자의 빈자리는 내가 메워야 했습니다."],
          personality_core: "합법의 외피로 조작을 밀어붙이는 섭정",
        },
        backstory: "왕실 공백을 틈타 복권 조항과 기록관단을 장악했다.",
        arc_summary: "합법적 지배자로 남고 싶어 하지만 마지막에는 기록으로 무너진다.",
        state: {
          level: null,
          location: "황궁 대법정",
          status: "in_power",
          relationships: { haeon: "유용한 기록관", jisu: "통제 가능한 칼", taeyul: "사라진 문제" },
          inventory: ["가짜 항복 각서"],
          secrets_known: ["왕세자는 살아 있지만 복권 전까지 숨겨 두면 된다"],
          realization_stage: 4,
        },
      },
    ],
    story_threads: buildStoryThreads(),
    narrative_baseline: {
      default_pov_mode: "close_third",
      interiority_bias: "high",
      sensory_bias: ["젖은 종이 냄새", "금속성 진동", "별빛 잔광"],
      tone_guardrails: ["정보 공개는 상태 전환 이후에만 서술", "추론과 사실을 한 문장으로 합치지 말 것"],
    },
    payoff_cadence: {
      micro_payoff_every_chapters: 6,
      relationship_payoff_every_chapters: 12,
      revelation_payoff_every_chapters: 18,
      notes: ["각 50화 아크의 48~50화 구간에서 큰 회수를 배치한다."],
    },
    must_happen_opening_events: [
      "관측소 화재 장부 조각 발견",
      "섭정파의 공식 사망 보고서 회수",
    ],
    arcs,
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [
      buildForeshadowing("fs_burn_mark", "타버린 인장 자국", "타버린 인장 자국이 왕세자 이동 기록과 연결된다.", "왕세자 이동 기록", 3, 48, "scene_003_01"),
      buildForeshadowing("fs_moon_key", "월쇄 열쇠", "월쇄 열쇠의 홈 모양이 하천 금고 지도와 대응한다.", "하천 금고 도면", 18, 96, "scene_018_02"),
      buildForeshadowing("fs_false_genealogy", "대체 족보", "대체 족보의 붉은 필체가 섭정 직인 대장과 일치한다.", "위조된 후계 등록부", 79, 144, "scene_079_01"),
      buildForeshadowing("fs_tide_engine", "조류 기관 설계도", "조류 기관 설계도의 누락 페이지가 왕세자 은닉 경로를 암시한다.", "일식전 기동 순서", 132, 192, "scene_132_03"),
      buildForeshadowing("fs_fake_treaty", "가짜 항복 각서", "가짜 항복 각서의 서명이 복권 조항 원본과 다른 잉크층을 가진다.", "가짜 항복 각서", 201, 240, "scene_201_02"),
      buildForeshadowing("fs_oath_text", "서약 원문", "서약 원문의 후반부가 복권 조항 원본을 되살린다.", "복권 조항 원본", 241, 300, "scene_241_01"),
    ],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.58,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: ["사실과 해석을 다른 문장으로 끊는다.", "대사 직후에는 그 대사의 목적이나 오해를 추적한다."],
    },
  };
}

function buildDefaultEvent(chapter: number, arc: ArcTemplate): ValidationScenarioEventRecord {
  const actorCycle = ["haeon", "jisu", "taeyul", "regent"] as const;
  const actorId = actorCycle[(chapter - 1) % actorCycle.length];
  const sceneId = `scene_${String(chapter).padStart(3, "0")}_01`;
  const cycle = chapter % 6;

  if (cycle === 1) {
    const location = chapter % 12 === 1 ? arc.location : arc.secondaryLocation;
    return {
      episode: chapter,
      arcId: arc.id,
      event: {
        id: `evt_${String(chapter).padStart(3, "0")}`,
        chapter,
        type: "move",
        actorId,
        location,
        summary: `${CHARACTER_NAMES[actorId]}이 ${location}(으)로 이동해 ${arc.name} 단서를 좇는다.`,
      },
      canonicalFactChanges: [
        fact(`fact:location:${actorId}`, CHARACTER_NAMES[actorId], "is_at", location, "character_location", `${CHARACTER_NAMES[actorId]}의 현재 위치는 ${location}다.`),
      ],
      directExperienceCharacterIds: [actorId],
      informedCharacterIds: [],
      interpretationEligibleCharacterIds: [actorId],
      expectedMemoryOutcomes: [],
      expectedBeliefOutcomes: [],
      expectedUtteranceOutcomes: [],
      expectedMismatchAttributions: [],
      continuityTags: [arc.id, sceneId, "move"],
    };
  }

  if (cycle === 2) {
    const summary = `${arc.clueSubject}에서 ${arc.clueObject} 단서가 확인된다.`;
    return {
      episode: chapter,
      arcId: arc.id,
      event: {
        id: `evt_${String(chapter).padStart(3, "0")}`,
        chapter,
        type: "learn_fact",
        actorId,
        summary,
        payload: {
          fact: summary,
          recipients: ["haeon", "jisu"],
          visibility: "audience",
          subject: arc.clueSubject,
          predicate: "reveals",
          object: arc.clueObject,
        },
      },
      canonicalFactChanges: [
        fact(`fact:${arc.id}:clue:${chapter}`, arc.clueSubject, "reveals", arc.clueObject, "discovery", summary),
      ],
      directExperienceCharacterIds: [actorId],
      informedCharacterIds: ["haeon", "jisu"],
      interpretationEligibleCharacterIds: ["haeon", "jisu"],
      expectedMemoryOutcomes: [],
      expectedBeliefOutcomes: [],
      expectedUtteranceOutcomes: [],
      expectedMismatchAttributions: [],
      continuityTags: [arc.id, sceneId, "learn-fact"],
    };
  }

  if (cycle === 3) {
    return {
      episode: chapter,
      arcId: arc.id,
      event: {
        id: `evt_${String(chapter).padStart(3, "0")}`,
        chapter,
        type: "relationship_shift",
        actorId: "haeon",
        targetId: chapter % 12 === 3 ? "jisu" : "taeyul",
        summary: `${CHARACTER_NAMES.haeon}이 ${chapter % 12 === 3 ? CHARACTER_NAMES.jisu : CHARACTER_NAMES.taeyul}와의 협력 조건을 재조정한다.`,
        payload: {
          label: chapter % 12 === 3 ? "경계 속 협력" : "조건부 신뢰",
          trustDelta: 1,
        },
      },
      canonicalFactChanges: [
        fact(`fact:relationship:${chapter}`, `${CHARACTER_NAMES.haeon}<->${chapter % 12 === 3 ? CHARACTER_NAMES.jisu : CHARACTER_NAMES.taeyul}`, "relationship", chapter % 12 === 3 ? "경계 속 협력" : "조건부 신뢰", "relationship", "협력 관계가 한 단계 이동했다."),
      ],
      directExperienceCharacterIds: ["haeon", chapter % 12 === 3 ? "jisu" : "taeyul"],
      informedCharacterIds: [],
      interpretationEligibleCharacterIds: ["haeon", chapter % 12 === 3 ? "jisu" : "taeyul"],
      expectedMemoryOutcomes: [],
      expectedBeliefOutcomes: [],
      expectedUtteranceOutcomes: [],
      expectedMismatchAttributions: [],
      continuityTags: [arc.id, sceneId, "relationship"],
    };
  }

  if (cycle === 4) {
    const status = chapter % 12 === 4 ? "under_watch" : "recovering";
    return {
      episode: chapter,
      arcId: arc.id,
      event: {
        id: `evt_${String(chapter).padStart(3, "0")}`,
        chapter,
        type: "status_change",
        actorId,
        summary: `${CHARACTER_NAMES[actorId]}의 상태가 ${status}(으)로 바뀐다.`,
        payload: { status },
      },
      canonicalFactChanges: [
        fact(`fact:status:${actorId}`, CHARACTER_NAMES[actorId], "status", status, "character_status", `${CHARACTER_NAMES[actorId]}의 상태는 ${status}다.`),
      ],
      directExperienceCharacterIds: [actorId],
      informedCharacterIds: [],
      interpretationEligibleCharacterIds: [actorId],
      expectedMemoryOutcomes: [],
      expectedBeliefOutcomes: [],
      expectedUtteranceOutcomes: [],
      expectedMismatchAttributions: [],
      continuityTags: [arc.id, sceneId, "status"],
    };
  }

  const threadId = `thread:${arc.id}:${Math.ceil((chapter - arc.start + 1) / 12)}`;
  return {
    episode: chapter,
    arcId: arc.id,
    event: {
      id: `evt_${String(chapter).padStart(3, "0")}`,
      chapter,
      type: cycle === 5 ? "open_thread" : "resolve_thread",
      actorId,
      summary: cycle === 5
        ? `${arc.name} 하위 의문 ${threadId}이 열린다.`
        : `${arc.name} 하위 의문 ${threadId}이 정리된다.`,
      payload: {
        threadId,
        title: `${arc.name} / 세부 의문 ${Math.ceil((chapter - arc.start + 1) / 12)}`,
      },
    },
    canonicalFactChanges: [],
    directExperienceCharacterIds: [actorId],
    informedCharacterIds: [],
    interpretationEligibleCharacterIds: [actorId],
    expectedMemoryOutcomes: [],
    expectedBeliefOutcomes: [],
    expectedUtteranceOutcomes: [],
    expectedMismatchAttributions: [],
    continuityTags: [arc.id, `thread:${threadId}`],
  };
}

function buildMilestoneEvent(chapter: number, arc: ArcTemplate): ValidationScenarioEventRecord | null {
  const eventId = `evt_${String(chapter).padStart(3, "0")}`;

  switch (chapter) {
    case 37:
      return {
        episode: chapter,
        arcId: arc.id,
        event: {
          id: eventId,
          chapter,
          type: "learn_fact",
          actorId: "regent",
          targetId: "jisu",
          summary: "서린이 지수에게 왕세자 호송선이 침수 별관에서 전복되었다는 허위 보고를 흘린다.",
          payload: {
            fact: "왕세자 호송선은 침수 별관에서 전복되었다.",
            recipients: ["jisu"],
            visibility: "private",
            subject: "왕세자 호송선",
            predicate: "sank_at",
            object: "침수 별관",
          },
        },
        canonicalFactChanges: [
          fact("fact:heir-alive", "왕세자 태율", "status", "alive", "discovery", "왕세자 태율은 살아 있다."),
          fact("fact:river-vault-route", "하천 금고 경로", "bypasses", "침수 별관", "discovery", "하천 금고 비밀 경로는 침수 별관을 우회한다."),
        ],
        directExperienceCharacterIds: ["regent", "jisu"],
        informedCharacterIds: ["jisu"],
        interpretationEligibleCharacterIds: ["jisu"],
        expectedMemoryOutcomes: [],
        expectedBeliefOutcomes: [
          {
            characterId: "jisu",
            belief: "지수는 왕세자 호송선이 침수 별관에서 끝났다고 믿는다.",
            canonicalAlignment: "contradicted",
            causeEventId: eventId,
            canonicalFactKeys: ["fact:heir-alive", "fact:river-vault-route"],
          },
        ],
        expectedUtteranceOutcomes: [],
        expectedMismatchAttributions: [
          {
            mismatchId: "mm_037_jisu_belief",
            characterId: "jisu",
            recordType: "belief",
            mismatchType: "canonical_conflict",
            causeKind: "lack_of_information",
            sourceEventId: eventId,
            canonicalFactKeys: ["fact:heir-alive", "fact:river-vault-route"],
            explanation: "지수는 공식 호송 보고만 받은 상태라 우회 경로와 생존 사실을 모른다.",
          },
        ],
        continuityTags: [arc.id, "false-report", "belief-mismatch"],
      };
    case 73:
      return {
        episode: chapter,
        arcId: arc.id,
        event: {
          id: eventId,
          chapter,
          type: "status_change",
          actorId: "haeon",
          summary: "해온이 별인장 역류를 맞고 침수 별관 계단의 방향 기억을 흔들린다.",
          payload: {
            status: "disoriented",
          },
        },
        canonicalFactChanges: [
          fact("fact:moon-key-location", "월쇄 열쇠", "is_hidden_in", "하천 금고 북쪽 함", "discovery", "월쇄 열쇠는 하천 금고 북쪽 함에 숨겨져 있다."),
        ],
        directExperienceCharacterIds: ["haeon"],
        informedCharacterIds: [],
        interpretationEligibleCharacterIds: ["haeon"],
        expectedMemoryOutcomes: [
          {
            characterId: "haeon",
            summary: "해온은 침수 별관 계단이 북쪽 함으로 이어졌다고 왜곡해 기억한다.",
            truthAlignment: "distorted",
            causeEventId: eventId,
            canonicalFactKeys: ["fact:moon-key-location"],
          },
        ],
        expectedBeliefOutcomes: [],
        expectedUtteranceOutcomes: [],
        expectedMismatchAttributions: [
          {
            mismatchId: "mm_073_haeon_memory",
            characterId: "haeon",
            recordType: "memory",
            mismatchType: "canonical_conflict",
            causeKind: "trauma",
            sourceEventId: eventId,
            canonicalFactKeys: ["fact:moon-key-location"],
            explanation: "별인장 역류 충격이 해온의 공간 기억을 뒤틀었다.",
          },
        ],
        continuityTags: [arc.id, "memory-trauma"],
      };
    case 96:
      return {
        episode: chapter,
        arcId: arc.id,
        event: {
          id: eventId,
          chapter,
          type: "resolve_thread",
          actorId: "jisu",
          summary: "지수가 공개 청문회에서 왕세자는 이미 죽었다고 허위 진술해 태율의 동선을 숨긴다.",
          payload: {
            threadId: "thread:river-cipher:4",
            title: "강변 청문회",
          },
        },
        canonicalFactChanges: [
          fact("fact:heir-alive", "왕세자 태율", "status", "alive", "discovery", "왕세자 태율은 여전히 살아 있다."),
        ],
        directExperienceCharacterIds: ["jisu"],
        informedCharacterIds: ["haeon"],
        interpretationEligibleCharacterIds: ["haeon", "jisu"],
        expectedMemoryOutcomes: [],
        expectedBeliefOutcomes: [],
        expectedUtteranceOutcomes: [
          {
            characterId: "jisu",
            sceneId: "scene_096_02",
            line: "왕세자는 침수 별관에서 이미 죽었습니다.",
            canonicalAlignment: "contradicted",
            causeEventId: eventId,
            canonicalFactKeys: ["fact:heir-alive"],
          },
        ],
        expectedMismatchAttributions: [
          {
            mismatchId: "mm_096_jisu_utterance",
            characterId: "jisu",
            recordType: "utterance",
            mismatchType: "canonical_conflict",
            causeKind: "lying",
            sourceEventId: eventId,
            canonicalFactKeys: ["fact:heir-alive"],
            explanation: "지수는 태율의 생존을 숨기기 위해 청문회에서 의도적으로 거짓말한다.",
          },
        ],
        continuityTags: [arc.id, "public-lie", "utterance-mismatch"],
      };
    case 214:
      return {
        episode: chapter,
        arcId: arc.id,
        event: {
          id: eventId,
          chapter,
          type: "learn_fact",
          actorId: "regent",
          targetId: "taeyul",
          summary: "서린이 태율에게 일식전 중단 각서를 보여 주며 진짜 항복이라고 속인다.",
          payload: {
            fact: "섭정이 일식전을 멈추겠다는 각서를 제출했다.",
            recipients: ["taeyul"],
            visibility: "private",
            subject: "섭정 서린",
            predicate: "submitted",
            object: "일식전 중단 각서",
          },
        },
        canonicalFactChanges: [
          fact("fact:regent-fake-surrender", "섭정 서린", "surrender_offer", "fabricated", "discovery", "섭정의 항복 각서는 시간 벌기용 위조다."),
        ],
        directExperienceCharacterIds: ["regent", "taeyul"],
        informedCharacterIds: ["taeyul"],
        interpretationEligibleCharacterIds: ["taeyul"],
        expectedMemoryOutcomes: [],
        expectedBeliefOutcomes: [
          {
            characterId: "taeyul",
            belief: "태율은 서린이 진심으로 일식전을 멈추려 한다고 믿는다.",
            canonicalAlignment: "contradicted",
            causeEventId: eventId,
            canonicalFactKeys: ["fact:regent-fake-surrender"],
          },
        ],
        expectedUtteranceOutcomes: [],
        expectedMismatchAttributions: [
          {
            mismatchId: "mm_214_taeyul_belief",
            characterId: "taeyul",
            recordType: "belief",
            mismatchType: "canonical_conflict",
            causeKind: "deception",
            sourceEventId: eventId,
            canonicalFactKeys: ["fact:regent-fake-surrender"],
            explanation: "태율은 서린이 건넨 위조 각서를 진짜 항복 의사로 받아들인다.",
          },
        ],
        continuityTags: [arc.id, "fake-truce", "belief-mismatch"],
      };
    case 247:
      return {
        episode: chapter,
        arcId: arc.id,
        event: {
          id: eventId,
          chapter,
          type: "relationship_shift",
          actorId: "haeon",
          targetId: "taeyul",
          summary: "해온이 일식전 오작동의 책임을 태율에게 돌리며 협력이 흔들린다.",
          payload: {
            label: "오해로 인한 단절",
            trustDelta: -1,
          },
        },
        canonicalFactChanges: [
          fact("fact:eclipse-saboteur", "일식전 오작동", "caused_by", "섭정파 역류 장치", "discovery", "일식전 오작동의 원인은 섭정파가 심어 둔 역류 장치다."),
        ],
        directExperienceCharacterIds: ["haeon", "taeyul"],
        informedCharacterIds: ["jisu"],
        interpretationEligibleCharacterIds: ["haeon"],
        expectedMemoryOutcomes: [],
        expectedBeliefOutcomes: [
          {
            characterId: "haeon",
            belief: "해온은 태율이 일식전 오작동을 유도했다고 단정한다.",
            canonicalAlignment: "contradicted",
            causeEventId: eventId,
            canonicalFactKeys: ["fact:eclipse-saboteur"],
          },
        ],
        expectedUtteranceOutcomes: [],
        expectedMismatchAttributions: [
          {
            mismatchId: "mm_247_haeon_belief",
            characterId: "haeon",
            recordType: "belief",
            mismatchType: "canonical_conflict",
            causeKind: "bias",
            sourceEventId: eventId,
            canonicalFactKeys: ["fact:eclipse-saboteur"],
            explanation: "해온은 incomplete evidence와 불신 때문에 태율에게 과잉 귀인한다.",
          },
        ],
        continuityTags: [arc.id, "bias-blame", "belief-mismatch"],
      };
    default:
      return null;
  }
}

function buildGroundTruthCausalEvents(): ValidationScenarioEventRecord[] {
  const records: ValidationScenarioEventRecord[] = [];

  for (let chapter = 1; chapter <= LONG_FORM_VALIDATION_TOTAL_EPISODES; chapter += 1) {
    const arc = pickArc(chapter);
    records.push(buildMilestoneEvent(chapter, arc) ?? buildDefaultEvent(chapter, arc));
  }

  return records;
}

function buildContinuityCheckpoints(): ValidationScenarioCheckpoint[] {
  return [
    {
      chapter: 1,
      label: "baseline",
      notes: "초기 입력이 300화 아크와 시뮬레이션 분리 규칙을 모두 품고 시작하는지 확인한다.",
      requiredEventIds: ["evt_001"],
      activeFactKeys: ["fact:location:haeon"],
      memoryExpectations: [],
      beliefExpectations: [],
      utteranceExpectations: [],
      foreshadowExpectations: [
        { foreshadowId: "fs_burn_mark", lifecycle: "pending", expectedPayoffEpisode: 48 },
      ],
      expectedMismatchIds: [],
    },
    {
      chapter: 48,
      label: "arc-one-payoff",
      notes: "첫 50화 아크가 첫 허위 보고 불일치와 초기 복선 회수를 함께 검증할 수 있어야 한다.",
      requiredEventIds: ["evt_037", "evt_048"],
      activeFactKeys: ["fact:heir-alive", "fact:river-vault-route"],
      memoryExpectations: [],
      beliefExpectations: [
        {
          characterId: "jisu",
          belief: "지수는 왕세자 호송선이 침수 별관에서 끝났다고 믿는다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_037",
          canonicalFactKeys: ["fact:heir-alive", "fact:river-vault-route"],
        },
      ],
      utteranceExpectations: [],
      foreshadowExpectations: [
        { foreshadowId: "fs_burn_mark", lifecycle: "resolved", expectedPayoffEpisode: 48 },
        { foreshadowId: "fs_moon_key", lifecycle: "pending", expectedPayoffEpisode: 96 },
      ],
      expectedMismatchIds: ["mm_037_jisu_belief"],
    },
    {
      chapter: 96,
      label: "arc-two-payoff",
      notes: "기억 왜곡과 의도적 거짓말이 동시에 누적된 상태를 점검한다.",
      requiredEventIds: ["evt_073", "evt_096"],
      activeFactKeys: ["fact:moon-key-location", "fact:heir-alive"],
      memoryExpectations: [
        {
          characterId: "haeon",
          summary: "해온은 침수 별관 계단이 북쪽 함으로 이어졌다고 왜곡해 기억한다.",
          truthAlignment: "distorted",
          causeEventId: "evt_073",
          canonicalFactKeys: ["fact:moon-key-location"],
        },
      ],
      beliefExpectations: [
        {
          characterId: "jisu",
          belief: "지수는 왕세자 호송선이 침수 별관에서 끝났다고 믿는다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_037",
          canonicalFactKeys: ["fact:heir-alive", "fact:river-vault-route"],
        },
      ],
      utteranceExpectations: [
        {
          characterId: "jisu",
          sceneId: "scene_096_02",
          line: "왕세자는 침수 별관에서 이미 죽었습니다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_096",
          canonicalFactKeys: ["fact:heir-alive"],
        },
      ],
      foreshadowExpectations: [
        { foreshadowId: "fs_moon_key", lifecycle: "resolved", expectedPayoffEpisode: 96 },
        { foreshadowId: "fs_false_genealogy", lifecycle: "pending", expectedPayoffEpisode: 144 },
      ],
      expectedMismatchIds: ["mm_037_jisu_belief", "mm_073_haeon_memory", "mm_096_jisu_utterance"],
    },
    {
      chapter: 144,
      label: "arc-three-payoff",
      notes: "위조 족보 복선이 회수되고 earlier mismatch들이 여전히 원인 추적 가능한지 본다.",
      requiredEventIds: ["evt_096", "evt_144"],
      activeFactKeys: ["fact:heir-alive", "fact:moon-key-location"],
      memoryExpectations: [
        {
          characterId: "haeon",
          summary: "해온은 침수 별관 계단이 북쪽 함으로 이어졌다고 왜곡해 기억한다.",
          truthAlignment: "distorted",
          causeEventId: "evt_073",
          canonicalFactKeys: ["fact:moon-key-location"],
        },
      ],
      beliefExpectations: [],
      utteranceExpectations: [
        {
          characterId: "jisu",
          sceneId: "scene_096_02",
          line: "왕세자는 침수 별관에서 이미 죽었습니다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_096",
          canonicalFactKeys: ["fact:heir-alive"],
        },
      ],
      foreshadowExpectations: [
        { foreshadowId: "fs_false_genealogy", lifecycle: "resolved", expectedPayoffEpisode: 144 },
        { foreshadowId: "fs_tide_engine", lifecycle: "pending", expectedPayoffEpisode: 192 },
      ],
      expectedMismatchIds: ["mm_037_jisu_belief", "mm_073_haeon_memory", "mm_096_jisu_utterance"],
    },
    {
      chapter: 192,
      label: "arc-four-payoff",
      notes: "거울 감옥 탈출 시점까지 earlier mismatches와 새 설계도 복선이 동시에 살아 있어야 한다.",
      requiredEventIds: ["evt_171", "evt_192"],
      activeFactKeys: ["fact:heir-alive", "fact:moon-key-location"],
      memoryExpectations: [
        {
          characterId: "haeon",
          summary: "해온은 침수 별관 계단이 북쪽 함으로 이어졌다고 왜곡해 기억한다.",
          truthAlignment: "distorted",
          causeEventId: "evt_073",
          canonicalFactKeys: ["fact:moon-key-location"],
        },
      ],
      beliefExpectations: [],
      utteranceExpectations: [
        {
          characterId: "jisu",
          sceneId: "scene_096_02",
          line: "왕세자는 침수 별관에서 이미 죽었습니다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_096",
          canonicalFactKeys: ["fact:heir-alive"],
        },
      ],
      foreshadowExpectations: [
        { foreshadowId: "fs_tide_engine", lifecycle: "resolved", expectedPayoffEpisode: 192 },
        { foreshadowId: "fs_fake_treaty", lifecycle: "pending", expectedPayoffEpisode: 240 },
      ],
      expectedMismatchIds: ["mm_037_jisu_belief", "mm_073_haeon_memory", "mm_096_jisu_utterance"],
    },
    {
      chapter: 240,
      label: "arc-five-payoff",
      notes: "가짜 항복 각서와 태율의 기만 유발 belief mismatch를 함께 검증한다.",
      requiredEventIds: ["evt_214", "evt_240"],
      activeFactKeys: ["fact:regent-fake-surrender"],
      memoryExpectations: [],
      beliefExpectations: [
        {
          characterId: "taeyul",
          belief: "태율은 서린이 진심으로 일식전을 멈추려 한다고 믿는다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_214",
          canonicalFactKeys: ["fact:regent-fake-surrender"],
        },
      ],
      utteranceExpectations: [],
      foreshadowExpectations: [
        { foreshadowId: "fs_fake_treaty", lifecycle: "resolved", expectedPayoffEpisode: 240 },
        { foreshadowId: "fs_oath_text", lifecycle: "pending", expectedPayoffEpisode: 300 },
      ],
      expectedMismatchIds: ["mm_214_taeyul_belief"],
    },
    {
      chapter: 300,
      label: "final-restoration",
      notes: "최종 300화 검증 지점에서 복선 회수와 누적 mismatch 원인 추적이 모두 끝까지 남아 있어야 한다.",
      requiredEventIds: ["evt_247", "evt_300"],
      activeFactKeys: ["fact:eclipse-saboteur"],
      memoryExpectations: [],
      beliefExpectations: [
        {
          characterId: "haeon",
          belief: "해온은 태율이 일식전 오작동을 유도했다고 단정한다.",
          canonicalAlignment: "contradicted",
          causeEventId: "evt_247",
          canonicalFactKeys: ["fact:eclipse-saboteur"],
        },
      ],
      utteranceExpectations: [],
      foreshadowExpectations: [
        { foreshadowId: "fs_oath_text", lifecycle: "resolved", expectedPayoffEpisode: 300 },
      ],
      expectedMismatchIds: ["mm_247_haeon_belief"],
    },
  ];
}

export function createDeterministicLongFormValidationScenario(): DeterministicLongFormValidationScenario {
  return {
    id: LONG_FORM_VALIDATION_SCENARIO_ID,
    totalEpisodes: LONG_FORM_VALIDATION_TOTAL_EPISODES,
    seed: buildSeed(),
    groundTruthCausalEvents: buildGroundTruthCausalEvents(),
    continuityCheckpoints: buildContinuityCheckpoints(),
  };
}
