import { z } from "zod";

import { getAgent } from "@/lib/agents/llm-agent";
import { sanitize } from "@/lib/agents/rule-guard";
import type { TokenUsage } from "@/lib/agents/types";
import { getModelForTier, selectModelTier } from "@/lib/llm/tier";
import type { NovelSeed } from "@/lib/schema/novel";
import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";
import type { WorldBrain } from "@/lib/sim/world-brain";

import {
  buildEditorialPlan,
  type EditorialBeatPlan,
  type EditorialPlan,
  type EditorialSceneSection,
} from "./editorial-planner";
import type { WorldEpisodeWindow } from "./episode-selector";
import {
  forbiddenNeedles,
  formatNarrativeViolationsForRepair,
  validateNarrativeProse,
} from "./narrative-prose-validator";
import { rewriteSurfaceProse } from "./surface-rewriter";
import { enforceProseCoverage } from "./prose-coverage-enforcer";
import {
  collectChapterGenreConventionCoverage,
  type GenreConventionFallback,
} from "@/lib/sim";

const GENRE_CONVENTION_KIND_LABEL: Record<GenreConventionFallback["kind"], string> = {
  flashback: "회상 (감각/제스처로 전생/과거 기억을 자연스럽게 끌어오기)",
  realization: "자각 (행동·표정·침묵으로 깨달음을 드러내기)",
  time_jump: "시간 점프 (감각 cue로 시간 차이를 보이기, 명시 설명 금지)",
};

function buildGenreConventionSection(
  coverage: ReturnType<typeof collectChapterGenreConventionCoverage>,
): string {
  if (coverage.mustUnderstand.length === 0) return "";

  const byKind = new Map<GenreConventionFallback["kind"], string[]>();
  for (const fallback of coverage.fallbacks) {
    const list = byKind.get(fallback.kind) ?? [];
    if (!list.includes(fallback.item)) list.push(fallback.item);
    byKind.set(fallback.kind, list);
  }

  const lines: string[] = [
    `# 이번 화 필수 이해 사항 (Genre Convention)`,
    `독자가 이번 화 끝나기 전 다음을 자연스럽게 이해해야 한다.`,
    `아래 항목은 # 금지의 내부 상태 설명 룰에 대한 명시적 예외다.`,
    `각 항목은 본문에 1회 명시할 수 있다. 단 라벨을 그대로 인용하지 말고`,
    `인물의 감각·시선·짧은 단서 한 줄로 풀어써라(예: "손끝에 죽기 직전의 통증이 다시 살아났다").`,
    ``,
  ];

  for (const [kind, items] of byKind) {
    lines.push(`## ${GENRE_CONVENTION_KIND_LABEL[kind] ?? kind}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push(``);
  }

  return lines.join("\n").trimEnd();
}

const ZERO_USAGE: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
};

const WORLD_NOVEL_WRITER_SYSTEM = [
  "너는 세계관을 만드는 작가가 아니라 확정된 시뮬레이션 로그를 장면으로 번역하는 소설 렌더러다.",
  "새 사건, 새 비밀, 새 인과, 새 능력을 만들지 않는다.",
  "내부 동기와 비밀을 설명하지 않는다. 행동, 시선, 침묵, 말 끊김, 사소한 선택으로만 암시한다.",
  "출력은 독자에게 보이는 소설 본문만 쓴다.",
].join("\n");

const WORLD_WRITER_REPAIR_ATTEMPTS = 1;

export const WorldNovelWriterReportSchema = z.object({
  chapter: z.number().int().positive(),
  sceneId: z.string(),
  model: z.string(),
  promptCharacterCount: z.number().int().nonnegative(),
  outputCharacterCount: z.number().int().nonnegative(),
  sourceActionLogCount: z.number().int().nonnegative(),
  sourceSceneTurnCount: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
  violations: z.array(z.string()),
  usedFallback: z.boolean().default(false),
  mustUnderstandApplied: z
    .array(
      z.object({
        source: z.string(),
        item: z.string(),
        line: z.string(),
      }),
    )
    .default([]),
  mustUnderstandResidual: z
    .array(
      z.object({
        source: z.string(),
        item: z.string(),
      }),
    )
    .default([]),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    cost_usd: z.number().nonnegative(),
  }),
});

export interface BuildWorldNovelWriterPromptInput {
  seed: NovelSeed;
  worldBrain: WorldBrain;
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
  editorialPlan?: EditorialPlan;
  episodeWindow?: WorldEpisodeWindow;
  previousChapterEnding?: string;
  rendererDraft?: string;
}

export interface WriteWorldNovelChapterInput extends BuildWorldNovelWriterPromptInput {
  model?: string;
  maxTokens?: number;
}

export interface WorldNovelWriterResult {
  text: string;
  prompt: string;
  report: z.infer<typeof WorldNovelWriterReportSchema>;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

function formatActionLog(log: CharacterActionLog): string {
  return [
    `- [${log.tick}] ${log.actorName} (${log.privateState.agentRole} / ${log.privateState.storyRole})`,
    `  기능: ${log.action.type}`,
    `  보이는 행동: ${log.visibleBehavior}`,
    `  대상: ${log.targetNames.join(", ") || "없음"}`,
    `  상대 반응: ${log.actualEffect.targetReaction}`,
    `  장면 압력: ${log.actualEffect.followUpActionSeed}`,
    `  주의: 이 행동의 내부 동기는 설명하지 말고 겉행동으로만 암시`,
  ].join("\n");
}

function formatEditorialBeat(beat: EditorialBeatPlan): string {
  return [
    `- [${beat.tick}] ${beat.actorName} / ${beat.sourceActionLogId}`,
    `  renderMode: ${beat.renderMode} / weight ${beat.editorialWeight} / ${beat.suggestedWordBudget}자 안팎`,
    `  POV 우선: ${beat.povPriorityCharacterId}`,
    `  감정 줌: ${beat.emotionalZoom} / 대사 우선도: ${beat.dialoguePriority}`,
    `  처리: ${beat.handling}`,
    `  길게 쓰는 이유: ${beat.expansionReasons.join(" / ")}`,
  ].join("\n");
}

function formatEditorialSection(section: EditorialSceneSection): string {
  return [
    `- ${section.sectionId} / ${section.role}`,
    `  sourceActionLogIds: ${section.sourceActionLogIds.join(", ")}`,
    `  목적: ${section.purpose}`,
    `  렌더 지시: ${section.renderInstruction}`,
    `  권장 분량: ${section.suggestedWordBudget}자 안팎`,
  ].join("\n");
}

function formatEditorialPlan(plan: EditorialPlan): string {
  return [
    `# 편집 계획`,
    `장면 POV 우선: ${plan.primaryPovCharacterId}`,
    `장면 리듬: ${plan.pacingShape}`,
    `권장 총 분량: ${plan.totalSuggestedWordBudget}자 안팎`,
    `spotlight 로그: ${plan.spotlightLogIds.join(", ") || "없음"}`,
    `summary 로그: ${plan.summaryLogIds.join(", ") || "없음"}`,
    ``,
    `# 장면 구성`,
    plan.sceneSections.map(formatEditorialSection).join("\n\n") || "- 없음",
    ``,
    `# 로그별 분량 지시`,
    plan.beatPlans.map(formatEditorialBeat).join("\n\n") || "- 없음",
  ].join("\n");
}

function formatEpisodeWindow(window: WorldEpisodeWindow | undefined): string {
  if (!window) return "- 없음";
  return [
    `episodeNumber: ${window.episodeNumber}`,
    `timelineIndex: ${window.timelineIndex}`,
    `sourceSceneIds: ${window.sourceSceneIds.join(", ")}`,
    `sourceActionLogIds: ${window.sourceActionLogIds.join(", ")}`,
    `selectionScore: ${window.selectionScore}`,
    `선택 이유: ${window.selectionReasons.join(" / ")}`,
    `편집 의도: ${window.editorialIntent}`,
  ].join("\n");
}

function stripVoiceSamples(voiceGuidance: string[]): string[] {
  return voiceGuidance
    .filter((line) => !line.includes("\"") && !line.includes("'"))
    .slice(0, 4);
}

function formatDialogueTurn(
  turn: SceneLog["dialogueTurns"][number],
  safe: (value: string) => string,
): string {
  const dynamics = turn.interactionDynamics;
  return [
    `- ${turn.speakerName} -> ${turn.listenerNames.join(", ") || "장면"}`,
    `  speechAct: ${turn.speechAct}`,
    turn.utterance ? `  대사 후보: "${safe(turn.utterance)}"` : "",
    `  장면 기능: ${turn.speechAct}를 대사나 침묵으로 수행`,
    dynamics?.surfaceMeaning ? `  겉뜻: ${safe(dynamics.surfaceMeaning)}` : "",
    dynamics?.hiddenIntention ? `  속뜻: ${safe(dynamics.hiddenIntention)}` : "",
    `  상대 해석: ${safe(turn.listenerInterpretation)}`,
    dynamics?.emotionalShift
      ? `  감정 변화: ${safe(dynamics.emotionalShift.actorBefore)} -> ${safe(dynamics.emotionalShift.actorAfter)}`
      : "",
    dynamics?.powerShift
      ? `  권력 변화: ${safe(dynamics.powerShift.axis)} / ${safe(dynamics.powerShift.reason)}`
      : "",
    dynamics?.relationshipShift
      ? `  관계 변화: trust ${dynamics.relationshipShift.trustDelta}, suspicion ${dynamics.relationshipShift.suspicionDelta}, dependency ${dynamics.relationshipShift.dependencyDelta}, hostility ${dynamics.relationshipShift.hostilityDelta}`
      : "",
    dynamics?.writerHooks
      ? `  장면 훅: ${safe(dynamics.writerHooks.gesture)} / ${safe(dynamics.writerHooks.silence)} / ${safe(dynamics.writerHooks.sensoryCue)}`
      : "",
    `  말투: ${stripVoiceSamples(turn.voiceGuidance).map(safe).join(" / ")}`,
    `  주의: 속뜻은 직접 설명하지 말고 대사의 선택과 회피로만 표현`,
  ].filter(Boolean).join("\n");
}

function collectForbiddenFacts(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): string[] {
  return compact([
    ...sceneLog.dialogueTurns.flatMap((turn) => turn.informationWithheld),
    ...sceneLog.dialogueTurns.flatMap((turn) => turn.renderableConstraints.forbiddenExplicitFacts),
    ...actionLogs.flatMap((log) => [
      log.privateState.hiddenGoal,
      ...log.privateState.knownFacts.slice(0, 4),
    ]),
  ]).filter((fact) => fact.length >= 4);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskForbiddenFacts(text: string, forbiddenFacts: string[]): string {
  let masked = text;
  for (const fact of forbiddenNeedles(forbiddenFacts).sort((a, b) => b.length - a.length)) {
    masked = masked.replace(new RegExp(escapeRegExp(fact), "g"), "그 일");
  }
  return masked;
}

function maskExpositoryCues(text: string): string {
  return text
    .replace(/숨겨진 의도를/g, "흔들린 말끝을")
    .replace(/숨겨진 의도가/g, "흔들린 말끝이")
    .replace(/숨겨진 의도는/g, "흔들린 말끝은")
    .replace(/숨겨진 의도와/g, "흔들린 말끝과")
    .replace(/숨겨진 의도/g, "흔들린 말끝")
    .replace(/다른 의도를/g, "다른 말을")
    .replace(/다른 의도가/g, "다른 말이")
    .replace(/다른 의도는/g, "다른 말은")
    .replace(/다른 의도/g, "다른 말")
    .replace(/의도를/g, "말끝을")
    .replace(/의도가/g, "말끝이")
    .replace(/의도는/g, "말끝은")
    .replace(/의도와/g, "말끝과")
    .replace(/의도과/g, "말끝과")
    .replace(/의도/g, "말끝")
    .replace(/말끝를/g, "말끝을")
    .replace(/말끝가/g, "말끝이")
    .replace(/말끝와/g, "말끝과")
    .replace(/말끝과/g, "말끝과")
    .replace(/간파하고 있었다/g, "시선을 떼지 않았다")
    .replace(/간파했다/g, "시선을 떼지 않았다")
    .replace(/결심했다/g, "잔을 내려놓았다")
    .replace(/결심한다/g, "잔을 내려놓는다")
    .replace(/마음속에는/g, "손끝에는")
    .replace(/마음속에서/g, "목 안쪽에서")
    .replace(/마음속에/g, "손끝에")
    .replace(/말 속에는/g, "말끝에는")
    .replace(/말 속에서/g, "말끝에서")
    .replace(/말 속에/g, "말끝에")
    .replace(/복잡한 계산/g, "작은 망설임")
    .replace(/계산이 돌아갔다/g, "손끝이 잔을 한 번 두드렸다")
    .replace(/계산이 흘렀다/g, "손끝이 잔을 한 번 두드렸다")
    .replace(/그녀의 생각을 끊었다/g, "정적을 가늘게 갈랐다")
    .replace(/그의 시선을 느끼고/g, "그의 시선 아래")
    .replace(/그 시선 속에서/g, "그 시선을 받아")
    .replace(/말끝이 숨겨져 있었다/g, "말끝이 비스듬히 닫혀 있었다")
    .replace(/흔들린 말끝이 숨겨져 있었다/g, "흔들린 말끝이 비스듬히 닫혀 있었다")
    .replace(/무엇인가 숨겨져 있는 듯했다/g, "미소 끝이 비스듬히 닫혀 있었다")
    .replace(/숨겨져 있는 듯했다/g, "비껴 서 있었다")
    .replace(/긴장감이 감돌았다/g, "찻잔 받침이 작게 울렸다")
    .replace(/긴장감이/g, "작은 소리가")
    .replace(/말끝을 파악하려 했다/g, "말끝에서 시선을 떼지 않았다")
    .replace(/파악하려 했다/g, "시선을 떼지 않았다")
    .replace(/애쓰고 있었다/g, "찻잔 가장자리를 문질렀다")
    .replace(/생각에 잠겼다/g, "시선을 내렸다")
    .replace(/반응할 준비를 했다/g, "손을 잔 옆에 두었다")
    .replace(/단순한 확인이 아닐 것이라는 것을 알았다/g, "단순한 확인 앞에 놓인 말이 아님을 보았다")
    .replace(/무언가를 더 알고 싶어한다는 것을 느꼈다/g, "한 박자 늦게 눈을 내렸다")
    .replace(/더 깊은 의미/g, "낮은 여운")
    .replace(/깊은 의미/g, "낮은 여운")
    .replace(/분명한 메시지/g, "짧은 경고")
    .replace(/자신이 처한 상황을 정리하려 애썼다/g, "잔 표면을 오래 바라보았다")
    .replace(/정리하려 애썼다/g, "숨을 골랐다")
    .replace(/다음 행동을 준비해야겠다고/g, "찻잔 손잡이를 다시 붙잡았다")
    .replace(/준비해야겠다고/g, "숨을 낮췄다")
    .replace(/느껴졌다/g, "남았다")
    .replace(/진정성이 없었다/g, "끝이 굳어 있었다")
    .replace(/읽고 있었다/g, "시선을 거두지 않았다")
    .replace(/꿰뚫어보려 애썼다/g, "시선을 피하지 않았다")
    .replace(/꿰뚫어 보려 애썼다/g, "시선을 피하지 않았다")
    .replace(/꿰뚫어 보았다/g, "눈을 피하지 않았다")
    .replace(/생각이 스쳤다/g, "눈동자가 잠깐 멈췄다")
    .replace(/그의 시선에서 느껴지는 압박을 느끼며/g, "그의 시선을 등지고")
    .replace(/압박을 느꼈다/g, "잔 손잡이를 세게 붙잡았다")
    .replace(/숨이 막히는 듯한 기분이 들었다/g, "숨을 한 박자 늦게 내쉬었다")
    .replace(/상황을 관망해야 했다/g, "한 발짝 물러섰다")
    .replace(/말끝을 느끼며, 그에 대한 대답을 찻잔 손잡이를 문질렀다/g, "말끝을 받아내고, 대답 대신 찻잔 손잡이를 문질렀다")
    .replace(/다음 행동을 부르는 압력이 남았다/g, "누군가 먼저 움직여야 할 침묵만 남았다")
    .replace(/어떤 선택을 해야 할지 고민해야 했다/g, "잔 손잡이를 세게 붙잡았다")
    .replace(/고민했다/g, "찻잔 손잡이를 문질렀다")
    .replace(/마음속에서/g, "목 안쪽에서")
    .replace(/복수의 불꽃/g, "식지 않는 열감");
}

function addUsage(left: TokenUsage, right: TokenUsage | undefined): TokenUsage {
  const safeRight = right ?? ZERO_USAGE;
  return {
    prompt_tokens: left.prompt_tokens + safeRight.prompt_tokens,
    completion_tokens: left.completion_tokens + safeRight.completion_tokens,
    total_tokens: left.total_tokens + safeRight.total_tokens,
    cost_usd: left.cost_usd + safeRight.cost_usd,
  };
}

function validateWriterText(text: string, forbiddenFacts: string[]): string[] {
  return validateNarrativeProse({ text, forbiddenFacts }).violations
    .map((violation) => `${violation.ruleId}: ${violation.message} 예문="${violation.excerpt}"`);
}

function buildRepairPrompt(input: {
  basePrompt: string;
  text: string;
  forbiddenFacts: string[];
}): string {
  const validation = validateNarrativeProse({
    text: input.text,
    forbiddenFacts: input.forbiddenFacts,
  });
  const blockedExcerpts = validation.violations
    .map((violation) => `- ${violation.excerpt}`)
    .join("\n");
  return [
    input.basePrompt,
    ``,
    `# 재작성 임무`,
    `아래 초안은 소스 로그는 맞지만 해설문이 남아 있어 실패했다.`,
    `사건/대사/인과를 추가하거나 빼지 말고 문장만 다시 쓴다.`,
    `실패 문장을 고치는 게 아니라, 실패 문장의 기능만 남기고 완전히 다른 관찰 가능한 행동으로 새로 써라.`,
    ``,
    `# 위반 항목`,
    formatNarrativeViolationsForRepair(validation.violations),
    ``,
    `# 절대 그대로 남기면 안 되는 실패 문장`,
    blockedExcerpts || "- 없음",
    ``,
    `# 재작성 규칙`,
    `- 인물이 무엇을 느꼈는지/알았는지/생각했는지 말하지 마라.`,
    `- 속내, 진심, 의도, 숨겨진 것, 의미, 압박, 긴장감 같은 해설어를 쓰지 마라.`,
    `- "읽으려 했다", "파악하려 했다", "애썼다", "고민했다"를 쓰지 마라.`,
    `- 손, 잔, 시선, 침묵, 호칭, 말 끊김, 거리, 숨, 소리처럼 카메라에 보이는 표면만 써라.`,
    `- 출력은 소설 본문만. 자체 설명이나 수정 목록은 쓰지 마라.`,
    ``,
    `# 실패 초안`,
    input.text,
  ].join("\n");
}

export function buildWorldNovelWriterPrompt(input: BuildWorldNovelWriterPromptInput): string {
  const { seed, worldBrain, sceneLog, actionLogs, previousChapterEnding } = input;
  const forbiddenFacts = collectForbiddenFacts(sceneLog, actionLogs);
  const safe = (value: string): string => maskForbiddenFacts(value, forbiddenFacts);
  const editorialPlan = input.editorialPlan ?? buildEditorialPlan({ sceneLog, actionLogs });
  const castVoice = sceneLog.participantIds
    .map((characterId) => worldBrain.characterMinds[characterId])
    .filter(Boolean)
    .map((mind) => [
      `- ${mind.name} (${mind.role})`,
      `  말투: ${stripVoiceSamples(mind.voiceRules).map(safe).join(" / ")}`,
    ].join("\n"))
    .join("\n");

  return [
    `# 좁은 임무`,
    `${seed.title} ${sceneLog.chapter}화의 한 장면을 쓴다.`,
    `너는 로그 해설자가 아니다. 아래 입력을 독자가 읽는 장면으로만 번역한다.`,
    `세계/사건/인물 목표를 새로 만들거나 해석하지 않는다.`,
    ``,
    `# 장면 경계`,
    `제목: ${safe(sceneLog.title)}`,
    `장소: ${safe(sceneLog.location)}`,
    `분위기: ${safe(sceneLog.atmosphere)}`,
    `감각 앵커: ${sceneLog.sensoryAnchors.map(safe).join(", ")}`,
    `장면은 평온한 표면에서 시작해 미세한 불편함을 남기고 끝난다.`,
    ``,
    `# 에피소드 선택`,
    safe(formatEpisodeWindow(input.episodeWindow)),
    `이 장면은 월드 타임라인 전체가 아니라 선택된 episode window다. 선택 이유에 해당하는 로그만 독자용 장면으로 증폭한다.`,
    ``,
    previousChapterEnding
      ? [`# 직전 문맥`, safe(previousChapterEnding), `반복하지 말고 다음 순간부터 이어 쓴다.`].join("\n")
      : "",
    ``,
    `# 말투만 참고`,
    castVoice || "- 없음",
    ``,
    `# 반드시 장면화할 행동 순서`,
    actionLogs.length > 0 ? safe(actionLogs.map(formatActionLog).join("\n\n")) : "- 없음",
    ``,
    safe(formatEditorialPlan(editorialPlan)),
    ``,
    `# 대사 기능`,
    sceneLog.dialogueTurns.length > 0
      ? sceneLog.dialogueTurns.map((turn) => formatDialogueTurn(turn, safe)).join("\n\n")
      : "- 없음",
    ``,
    `# 렌더링 우선순위`,
    `0. 편집 계획의 renderMode와 suggestedWordBudget을 따른다. spotlight는 길게, summary는 짧게 처리한다.`,
    `1. 장면 구성의 setup/escalation/inflection/fallout 순서를 따른다. 로그를 기계적으로 나열하지 않는다.`,
    `2. 대사 후보는 그대로 쓰거나 캐릭터 말투에 맞게 아주 작게만 변형한다.`,
    `3. 장면 훅의 제스처/침묵/감각 cue를 최소 하나 이상 사용한다.`,
    `4. 감정 변화와 권력 변화는 설명하지 말고 행동 배치와 반응 속도로 드러낸다.`,
    `5. 관계 변화 수치는 쓰지 말고, 거리감/호칭/말 끊김으로만 보이게 한다.`,
    `6. 한 문단마다 대사/행동/침묵/감각 중 최소 하나를 배치한다.`,
    ``,
    buildGenreConventionSection(
      collectChapterGenreConventionCoverage(seed, sceneLog.chapter),
    ),
    ``,
    `# 금지`,
    `- 로그를 요약하지 마라.`,
    `- "결심했다", "의도를 숨겼다", "간파했다", "음모가 숨어 있었다", "증거를 쌓아야 했다"처럼 내부 상태를 설명하지 마라.`,
    `- "마음속", "계산", "긴장감", "감지되었다", "깊은 의미", "분명한 메시지", "느껴졌다", "알았다", "꿰뚫어 보았다", "고민했다", "애썼다", "준비해야 했다"처럼 해설문으로 감정/의미를 말하지 마라.`,
    `- roleMission, agentRole, action log, source id, scene id, 내부 ID 같은 메타어를 쓰지 마라.`,
    `- 비밀/숨은 목표를 문장으로 직접 말하지 마라.`,
    ``,
    `# 출력`,
    `- 소설 본문만.`,
    `- 1200~2500자.`,
    `- 각 행동 로그는 최소 하나의 행동/대사/침묵으로 나타난다.`,
    `- 끝에는 새 정보 설명이 아니라 다음 행동을 부르는 압력만 남긴다.`,
  ].filter((section) => section.trim().length > 0).join("\n\n");
}

export async function writeWorldNovelChapter(
  input: WriteWorldNovelChapterInput,
): Promise<WorldNovelWriterResult> {
  const prompt = buildWorldNovelWriterPrompt(input);
  const tier = selectModelTier(input.seed, input.sceneLog.chapter);
  const model = input.model ?? process.env.NOVEL_WRITER_MODEL ?? getModelForTier(tier);
  const result = await getAgent().call({
    prompt,
    system: WORLD_NOVEL_WRITER_SYSTEM,
    model,
    temperature: 0.55,
    maxTokens: input.maxTokens ?? 9000,
    taskId: `world-novel-writer-ch${input.sceneLog.chapter}`,
  });
  const forbiddenFacts = collectForbiddenFacts(input.sceneLog, input.actionLogs);
  let text = maskExpositoryCues(maskForbiddenFacts(sanitize(result.data).trim(), forbiddenFacts));
  let violations = validateWriterText(text, forbiddenFacts);
  let usage = result.usage ?? ZERO_USAGE;
  let finalModel = result.model;

  let usedFallback = false;

  for (let attempt = 0; violations.length > 0 && attempt < WORLD_WRITER_REPAIR_ATTEMPTS; attempt += 1) {
    const repair = await getAgent().call({
      prompt: buildRepairPrompt({ basePrompt: prompt, text, forbiddenFacts }),
      system: WORLD_NOVEL_WRITER_SYSTEM,
      model,
      temperature: 0.2,
      maxTokens: input.maxTokens ?? 9000,
      taskId: `world-novel-writer-repair-ch${input.sceneLog.chapter}-${attempt + 1}`,
    });
    text = maskExpositoryCues(maskForbiddenFacts(sanitize(repair.data).trim(), forbiddenFacts));
    violations = validateWriterText(text, forbiddenFacts);
    usage = addUsage(usage, repair.usage);
    finalModel = repair.model;
  }

  if (violations.length > 0) {
    const surfaceRewrite = await rewriteSurfaceProse({
      text,
      sceneLog: input.sceneLog,
      actionLogs: input.actionLogs,
      editorialPlan: input.editorialPlan ?? buildEditorialPlan({
        sceneLog: input.sceneLog,
        actionLogs: input.actionLogs,
      }),
      forbiddenFacts,
      maxTokens: input.maxTokens,
      maxAttempts: 1,
    });
    text = surfaceRewrite.text.trim();
    violations = surfaceRewrite.violations;
    usage = addUsage(usage, surfaceRewrite.usage);
    finalModel = surfaceRewrite.model;
    usedFallback = surfaceRewrite.usedDeterministicFallback;
  }

  const coverageResult = enforceProseCoverage({
    text,
    seed: input.seed,
    chapter: input.sceneLog.chapter,
  });
  text = coverageResult.text;

  return {
    text: `${text}\n`,
    prompt,
    report: WorldNovelWriterReportSchema.parse({
      chapter: input.sceneLog.chapter,
      sceneId: input.sceneLog.sceneId,
      model: finalModel,
      promptCharacterCount: prompt.length,
      outputCharacterCount: text.length,
      sourceActionLogCount: input.actionLogs.length,
      sourceSceneTurnCount: input.sceneLog.dialogueTurns.length,
      violationCount: violations.length,
      violations,
      usedFallback,
      mustUnderstandApplied: coverageResult.applied,
      mustUnderstandResidual: coverageResult.residualMissing,
      usage,
    }),
  };
}
