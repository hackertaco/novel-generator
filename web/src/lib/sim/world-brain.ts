import { z } from "zod";

import type { Character } from "@/lib/schema/character";
import type { NovelSeed, PlotArc } from "@/lib/schema/novel";
import { conjunctiveParticle } from "@/lib/utils/korean";

const StringListSchema = z.array(z.string());

export const WorldBrainFactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  resources: StringListSchema,
  pressurePoints: StringListSchema,
});

export const WorldBrainSecretSchema = z.object({
  id: z.string(),
  holderCharacterIds: StringListSchema,
  description: z.string(),
  dangerIfRevealed: z.string(),
  revealPressure: z.string(),
});

export const WorldBrainRailSchema = z.object({
  id: z.string(),
  kind: z.enum(["opening", "part", "arc", "foreshadowing", "certainty"]),
  chapterRange: z.string(),
  description: z.string(),
  hardConstraint: z.boolean(),
});

export const WorldBrainRelationshipModelSchema = z.object({
  targetId: z.string(),
  publicFace: z.string(),
  privateTruth: z.string(),
  trustLevel: z.number().int().min(-2).max(2),
  speechRule: z.string(),
  pressure: z.string(),
});

export const WorldBrainPlanTransitionSchema = z.object({
  characterId: z.string(),
  beforePlan: z.string(),
  afterPlan: z.string(),
  reason: z.string(),
  pressure: z.string(),
});

export const WorldBrainKnowledgeFlowSchema = z.object({
  usedKnowledge: StringListSchema,
  gainedKnowledge: StringListSchema,
  ownerCharacterIds: StringListSchema,
  visibility: z.enum(["private", "shared", "audience"]),
  blockedByForbiddenKnowledge: StringListSchema,
});

export const WorldBrainActionEconomicsSchema = z.object({
  cost: z.string(),
  risk: z.string(),
  benefit: z.string(),
  consequence: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const CharacterMindSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  faction: z.string().nullable(),
  socialMask: z.string(),
  personalityCore: z.string(),
  voiceRules: StringListSchema,
  desires: z.object({
    surfaceGoal: z.string(),
    hiddenGoal: z.string(),
    need: z.string(),
  }),
  fears: StringListSchema,
  taboos: StringListSchema,
  leveragePoints: StringListSchema,
  secrets: StringListSchema,
  knownFacts: StringListSchema,
  falseBeliefs: StringListSchema,
  access: z.object({
    knowledgeDomains: StringListSchema,
    forbiddenKnowledge: StringListSchema,
    accessRights: StringListSchema,
    surveillanceRisk: StringListSchema,
  }),
  currentPlan: z.string(),
  relationshipModel: z.record(z.string(), WorldBrainRelationshipModelSchema),
  memorySeeds: StringListSchema,
});

export const WorldBrainSchema = z.object({
  schemaVersion: z.literal("world-brain.v1"),
  title: z.string(),
  logline: z.string(),
  worldHistory: z.object({
    foundingPremise: z.string(),
    unresolvedPastEvents: StringListSchema,
    hiddenTruths: StringListSchema,
    inheritedWounds: StringListSchema,
  }),
  conflictMap: z.object({
    factions: z.array(WorldBrainFactionSchema),
    secrets: z.array(WorldBrainSecretSchema),
    scarceResources: StringListSchema,
    pressurePoints: StringListSchema,
  }),
  plotRails: z.object({
    mustHappen: z.array(WorldBrainRailSchema),
    mustNotHappenBefore: z.array(WorldBrainRailSchema),
    arcRails: z.array(WorldBrainRailSchema),
    optionalBranches: StringListSchema,
    failureConsequences: StringListSchema,
  }),
  characterMinds: z.record(z.string(), CharacterMindSchema),
  simulationRules: z.object({
    decisionPriorities: StringListSchema,
    informationFlowRules: StringListSchema,
    trustUpdateRules: StringListSchema,
    secrecyRules: StringListSchema,
    editorRules: StringListSchema,
  }),
  editorContract: z.object({
    sourceOfTruth: StringListSchema,
    selectionPolicy: StringListSchema,
    rendererPolicy: StringListSchema,
    forbiddenMoves: StringListSchema,
  }),
  qualityBar: z.object({
    targetEventsPerChapterMin: z.number().int().positive(),
    targetEventsPerChapterMax: z.number().int().positive(),
    maxPlaceholderEventRatio: z.number().min(0).max(1),
    rendererMustCiteSourceEventIds: z.boolean(),
    memoryMustBeCharacterScoped: z.boolean(),
  }),
});

export type WorldBrainFaction = z.infer<typeof WorldBrainFactionSchema>;
export type WorldBrainSecret = z.infer<typeof WorldBrainSecretSchema>;
export type WorldBrainRail = z.infer<typeof WorldBrainRailSchema>;
export type WorldBrainRelationshipModel = z.infer<typeof WorldBrainRelationshipModelSchema>;
export type WorldBrainPlanTransition = z.infer<typeof WorldBrainPlanTransitionSchema>;
export type WorldBrainKnowledgeFlow = z.infer<typeof WorldBrainKnowledgeFlowSchema>;
export type WorldBrainActionEconomics = z.infer<typeof WorldBrainActionEconomicsSchema>;
export type CharacterMind = z.infer<typeof CharacterMindSchema>;
export type WorldBrain = z.infer<typeof WorldBrainSchema>;

function compact(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function chapterRangeForArc(arc: PlotArc): string {
  return `${arc.start_chapter}-${arc.end_chapter}`;
}

function collectCharacterSecrets(character: Character): string[] {
  return compact([
    ...(character.state.secrets_known ?? []),
    character.intent_profile?.hidden_goal,
  ]);
}

function buildRelationshipModel(character: Character): Record<string, WorldBrainRelationshipModel> {
  const model: Record<string, WorldBrainRelationshipModel> = {};

  for (const fact of character.relationship_facts ?? []) {
    const targetId = fact.target;
    model[targetId] = {
      targetId,
      publicFace: fact.public_face,
      privateTruth: fact.private_truth,
      trustLevel: fact.trust_level,
      speechRule: compact([
        fact.address_default ? `호칭: ${fact.address_default}` : null,
        fact.speech_mode_default ? `화계: ${fact.speech_mode_default}` : null,
        fact.preferred_register,
        fact.preferred_patterns.length > 0
          ? `자주 쓰는 표현: ${fact.preferred_patterns.join(" / ")}`
          : null,
        fact.note,
      ]).join(" / ") || "관계별 말투 규칙 미정",
      pressure: compact([
        fact.hostility_mode,
        fact.romance_role !== "none" ? `romance:${fact.romance_role}` : null,
        ...fact.forbidden_register.map((item) => `금지 표현: ${item}`),
      ]).join(" / ") || "즉시 압박 없음",
    };
  }

  for (const [targetId, description] of Object.entries(character.state.relationships ?? {})) {
    if (model[targetId]) continue;
    model[targetId] = {
      targetId,
      publicFace: "unspecified",
      privateTruth: description,
      trustLevel: 0,
      speechRule: "자유서술 관계만 있음. 실제 대화 전 relationship_facts 보강 필요",
      pressure: description,
    };
  }

  return model;
}

function buildCharacterMind(character: Character): CharacterMind {
  const intent = character.intent_profile;
  const internalArc = character.internal_arc;
  const access = character.access_profile;

  const surfaceGoal = intent?.surface_goal
    ?? internalArc?.want
    ?? `${character.role}로서 현재 위치를 지키려 한다`;
  const hiddenGoal = intent?.hidden_goal
    ?? character.state.secrets_known[0]
    ?? "숨겨진 목표가 아직 명시되지 않음";
  const coreFear = intent?.core_fear
    ?? internalArc?.misbelief
    ?? "잃을 수 있는 것을 아직 명시해야 함";

  const memorySeeds = compact([
    character.backstory,
    character.arc_summary,
    character.state.location ? `초기 위치: ${character.state.location}` : null,
    character.state.status ? `초기 상태: ${character.state.status}` : null,
    ...character.state.inventory.map((item) => `소지품: ${item}`),
    ...character.state.secrets_known.map((secret) => `알고 있는 비밀: ${secret}`),
    ...Object.entries(character.state.relationships ?? {}).map(
      ([target, relation]) => `${target}: ${relation}`,
    ),
  ]);

  return CharacterMindSchema.parse({
    characterId: character.id,
    name: character.name,
    role: character.role,
    faction: character.faction ?? character.house ?? null,
    socialMask: compact([
      character.public_title,
      character.court_position,
      character.masking_habit,
      `사회적 신분: ${character.social_rank}`,
    ]).join(" / ") || "공적 얼굴 미정",
    personalityCore: character.voice.personality_core,
    voiceRules: compact([
      character.voice.tone,
      ...character.voice.speech_patterns,
      ...character.voice.sample_dialogues.slice(0, 3),
    ]),
    desires: {
      surfaceGoal,
      hiddenGoal,
      need: internalArc?.need ?? "성장에 필요한 내면 진실 미정",
    },
    fears: compact([coreFear]),
    taboos: compact(intent?.taboo_actions ?? []),
    leveragePoints: compact(intent?.leverage_points ?? []),
    secrets: collectCharacterSecrets(character),
    knownFacts: compact([
      ...character.state.secrets_known,
      ...Object.keys(character.state.relationships ?? {}).map((target) =>
        `${target}${conjunctiveParticle(target)} 관계가 있다`
      ),
      character.access_profile?.knowledge_domains.join(", "),
    ]),
    falseBeliefs: compact([internalArc?.misbelief]),
    access: {
      knowledgeDomains: compact(access?.knowledge_domains ?? []),
      forbiddenKnowledge: compact(access?.forbidden_knowledge ?? []),
      accessRights: compact(access?.access_rights ?? []),
      surveillanceRisk: compact(access?.surveillance_risk ?? []),
    },
    currentPlan: surfaceGoal,
    relationshipModel: buildRelationshipModel(character),
    memorySeeds,
  });
}

function buildFactions(seed: NovelSeed): WorldBrainFaction[] {
  const factions: WorldBrainFaction[] = [];
  const factionMembers = new Map<string, Character[]>();

  for (const character of seed.characters) {
    const factionName = character.faction ?? character.house;
    if (!factionName) continue;
    factionMembers.set(factionName, [...(factionMembers.get(factionName) ?? []), character]);
  }

  for (const [name, description] of Object.entries(seed.world.factions ?? {})) {
    const members = factionMembers.get(name) ?? [];
    factions.push({
      id: slugify(name, `faction_${factions.length + 1}`),
      name,
      description,
      resources: compact([
        ...members.map((member) => `${member.name}(${member.role})`),
        seed.world.room_access_rules?.[name],
      ]),
      pressurePoints: compact([
        ...members.flatMap((member) => member.intent_profile?.leverage_points ?? []),
        ...members.flatMap((member) => member.intent_profile?.core_fear ? [member.intent_profile.core_fear] : []),
      ]),
    });
  }

  for (const [name, members] of factionMembers.entries()) {
    if (factions.some((faction) => faction.name === name)) continue;
    factions.push({
      id: slugify(name, `faction_${factions.length + 1}`),
      name,
      description: "인물 정보에서 파생된 세력",
      resources: compact(members.map((member) => `${member.name}(${member.role})`)),
      pressurePoints: compact(members.flatMap((member) => [
        member.intent_profile?.core_fear,
        ...(member.intent_profile?.leverage_points ?? []),
      ])),
    });
  }

  return factions;
}

function buildSecrets(seed: NovelSeed): WorldBrainSecret[] {
  const bySecret = new Map<string, Set<string>>();

  for (const character of seed.characters) {
    for (const secret of collectCharacterSecrets(character)) {
      if (!bySecret.has(secret)) {
        bySecret.set(secret, new Set());
      }
      bySecret.get(secret)!.add(character.id);
    }
  }

  return [...bySecret.entries()].map(([description, holders], index) => ({
    id: `secret_${String(index + 1).padStart(3, "0")}`,
    holderCharacterIds: [...holders],
    description,
    dangerIfRevealed: "관계, 권력 균형, 생존 전략이 바뀐다",
    revealPressure: "이 비밀을 아는 인물이 압박받거나 행동할 때 로그로 표면화된다",
  }));
}

function buildMustHappenRails(seed: NovelSeed): WorldBrainRail[] {
  const rails: WorldBrainRail[] = [];

  for (const [index, event] of (seed.must_happen_opening_events ?? []).entries()) {
    rails.push({
      id: `opening_${String(index + 1).padStart(2, "0")}`,
      kind: "opening",
      chapterRange: "1-5",
      description: event,
      hardConstraint: true,
    });
  }

  for (const part of seed.must_happen_part_events ?? []) {
    for (const [index, event] of part.events.entries()) {
      rails.push({
        id: `${slugify(part.part_id, "part")}_${String(index + 1).padStart(2, "0")}`,
        kind: "part",
        chapterRange: part.part_id,
        description: event,
        hardConstraint: true,
      });
    }
  }

  for (const fs of seed.foreshadowing) {
    rails.push({
      id: `foreshadow_${fs.id}`,
      kind: "foreshadowing",
      chapterRange: compact([
        `plant:${fs.planted_at}`,
        fs.hints_at.length > 0 ? `hint:${fs.hints_at.join(",")}` : null,
        fs.reveal_at ? `reveal:${fs.reveal_at}` : null,
      ]).join(" / "),
      description: `${fs.name}: ${fs.description}`,
      hardConstraint: fs.importance === "critical",
    });
  }

  return rails;
}

function buildMustNotHappenBeforeRails(seed: NovelSeed): WorldBrainRail[] {
  return [
    ...(seed.certainty_ceiling_by_phase ?? []).map((entry, index) => ({
      id: `certainty_${String(index + 1).padStart(2, "0")}`,
      kind: "certainty" as const,
      chapterRange: entry.chapter_range,
      description: `확신 상한: ${entry.max_certainty}${entry.notes ? ` - ${entry.notes}` : ""}`,
      hardConstraint: true,
    })),
    ...seed.foreshadowing
      .filter((fs) => fs.reveal_at !== null)
      .map((fs) => ({
        id: `no_early_reveal_${fs.id}`,
        kind: "foreshadowing" as const,
        chapterRange: `1-${Math.max(1, (fs.reveal_at ?? 1) - 1)}`,
        description: `${fs.name}의 정답을 ${fs.reveal_at}화 전에는 확정 공개하지 않는다`,
        hardConstraint: true,
      })),
  ];
}

function buildArcRails(seed: NovelSeed): WorldBrainRail[] {
  return seed.arcs.flatMap((arc) => [
    {
      id: `arc_${arc.id}`,
      kind: "arc" as const,
      chapterRange: chapterRangeForArc(arc),
      description: `${arc.name}: ${arc.summary}`,
      hardConstraint: true,
    },
    ...arc.key_events.map((event, index) => ({
      id: `arc_${arc.id}_event_${String(index + 1).padStart(2, "0")}`,
      kind: "arc" as const,
      chapterRange: chapterRangeForArc(arc),
      description: event,
      hardConstraint: true,
    })),
  ]);
}

export function buildWorldBrainFromSeed(seed: NovelSeed): WorldBrain {
  const characterMinds = Object.fromEntries(
    seed.characters.map((character) => [character.id, buildCharacterMind(character)]),
  );

  const hiddenTruths = compact([
    ...seed.foreshadowing.map((fs) => fs.canonical_target ?? fs.description),
    ...seed.story_threads
      .filter((thread) => thread.type.includes("secret") || thread.type.includes("twist"))
      .map((thread) => thread.description || thread.name),
  ]);

  const unresolvedPastEvents = compact([
    ...seed.arcs.flatMap((arc) => arc.key_events.slice(0, 2)),
    ...seed.characters.map((character) => character.backstory),
  ]).slice(0, 24);

  const inheritedWounds = compact(
    seed.characters.flatMap((character) => [
      character.internal_arc?.misbelief,
      character.intent_profile?.core_fear,
    ]),
  );

  const scarceResources = compact([
    seed.world.magic_system ?? undefined,
    ...Object.keys(seed.world.key_locations ?? {}).map((location) => `장소 접근권: ${location}`),
    ...(seed.world.symbolic_objects ?? []).map((item) => `상징물: ${item.name} - ${item.significance}`),
    ...(seed.world.evidence_classes?.strong ?? []).map((item) => `강한 증거: ${item}`),
  ]);

  const pressurePoints = compact([
    ...(seed.world.rules ?? []),
    ...(seed.world.protocol_rules ?? []),
    ...(seed.world.public_behavior_constraints ?? []),
    ...(seed.world.punishment_rules ?? []),
    ...(seed.romance_core ? [seed.romance_core.obstacle] : []),
  ]);

  const brain: WorldBrain = {
    schemaVersion: "world-brain.v1",
    title: seed.title,
    logline: seed.logline,
    worldHistory: {
      foundingPremise: `${seed.world.name} / ${seed.world.genre} / ${seed.world.sub_genre} / ${seed.world.time_period}`,
      unresolvedPastEvents,
      hiddenTruths,
      inheritedWounds,
    },
    conflictMap: {
      factions: buildFactions(seed),
      secrets: buildSecrets(seed),
      scarceResources,
      pressurePoints,
    },
    plotRails: {
      mustHappen: buildMustHappenRails(seed),
      mustNotHappenBefore: buildMustNotHappenBeforeRails(seed),
      arcRails: buildArcRails(seed),
      optionalBranches: compact(seed.story_threads.map((thread) => `${thread.name}: ${thread.description}`)),
      failureConsequences: [
        "필수 사건이 빠지면 다음 화 행동 이유가 사라진다",
        "비밀이 너무 빨리 공개되면 장기 긴장과 떡밥 회수가 무너진다",
        "인물 기억을 건너뛰면 같은 사건에 대한 반응이 매번 리셋된다",
      ],
    },
    characterMinds,
    simulationRules: {
      decisionPriorities: [
        "각 인물은 자기 surfaceGoal을 먼저 추구한다",
        "hiddenGoal과 coreFear가 강하게 자극되면 겉 목표보다 숨은 목표를 우선한다",
        "접근권한이 없는 정보는 알 수 없고, 알면 ledger에 원인이 있어야 한다",
        "관계 trustLevel이 낮을수록 같은 말도 의심하거나 방어적으로 해석한다",
        "plotRails는 세계의 압력이지 인물의 자유 행동을 완전히 덮어쓰지 않는다",
      ],
      informationFlowRules: [
        "비밀은 holderCharacterIds 또는 source event를 통해서만 이동한다",
        "강한 증거 없이 confirmed 진술을 만들지 않는다",
        "목격, 문서, 대화, 물건 접촉은 모두 event log로 남긴다",
      ],
      trustUpdateRules: [
        "도움을 받으면 trustLevel이 오른다",
        "거짓말, 배신, 정보 은폐가 드러나면 trustLevel이 내려간다",
        "공적 얼굴과 사적 진실이 다르면 독자는 행동 불일치를 단서로 본다",
      ],
      secrecyRules: [
        "회귀, 독살, 밀통, 혈통/마법 같은 핵심 비밀은 reveal rail 전 확정 공개 금지",
        "감정은 행동과 선택으로 먼저 드러내고, Renderer가 필요한 만큼만 문장화한다",
      ],
      editorRules: [
        "시뮬레이션 로그가 원본이고 소설 문장은 렌더링이다",
        "Renderer는 사건을 새로 만들지 말고 eventId를 근거로 장면을 선택한다",
        "빈 화를 만들지 않기 위해 한 화에는 최소 3개의 의미 있는 사건 후보가 필요하다",
      ],
    },
    editorContract: {
      sourceOfTruth: [
        "WorldBrain.characterMinds",
        "WorldBrain.conflictMap",
        "SimulationEventLedger",
        "WorldStateAuthority snapshot",
      ],
      selectionPolicy: [
        "편집자는 가장 충돌이 큰 로그를 중심 장면으로 고른다",
        "장기 떡밥, 관계 변화, 정보 이동이 있는 로그를 우선한다",
        "같은 목적의 반복 로그는 압축하고, 상태가 바뀐 로그만 장면화한다",
      ],
      rendererPolicy: [
        "표현은 Renderer만 담당한다",
        "신념은 Belief 재계산 결과를 따른다",
        "인과 오류는 EventLedger 소급 수정으로 고친다",
      ],
      forbiddenMoves: [
        "원인 없는 감정 변화",
        "출처 없는 지식 획득",
        "plotRails를 무시한 조기 확정 공개",
        "character memory를 리셋한 듯한 반복 반응",
      ],
    },
    qualityBar: {
      targetEventsPerChapterMin: 3,
      targetEventsPerChapterMax: 7,
      maxPlaceholderEventRatio: 0.05,
      rendererMustCiteSourceEventIds: true,
      memoryMustBeCharacterScoped: true,
    },
  };

  return WorldBrainSchema.parse(brain);
}

export function summarizeWorldBrain(brain: WorldBrain): Record<string, unknown> {
  return {
    title: brain.title,
    characterMindCount: Object.keys(brain.characterMinds).length,
    factionCount: brain.conflictMap.factions.length,
    secretCount: brain.conflictMap.secrets.length,
    mustHappenRailCount: brain.plotRails.mustHappen.length,
    mustNotHappenBeforeRailCount: brain.plotRails.mustNotHappenBefore.length,
    arcRailCount: brain.plotRails.arcRails.length,
    targetEventsPerChapter: `${brain.qualityBar.targetEventsPerChapterMin}-${brain.qualityBar.targetEventsPerChapterMax}`,
  };
}
