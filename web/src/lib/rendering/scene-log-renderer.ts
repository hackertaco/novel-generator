import { z } from "zod";

import {
  DialogueTurnSchema,
  SceneLogSchema,
  type DialogueSpeechAct,
  type DialogueTurn,
  type SceneLog,
} from "@/lib/sim/scene-log";
import { WorldBrainSchema, type WorldBrain } from "@/lib/sim/world-brain";

const RenderViolationCodeSchema = z.enum([
  "empty_rendered_text",
  "missing_source_event",
  "missing_dialogue_line",
  "forbidden_fact_leak",
  "unsourced_event_reference",
]);

const RenderViolationSeveritySchema = z.enum(["error", "warning"]);

export const SceneLogRenderViolationSchema = z.object({
  code: RenderViolationCodeSchema,
  severity: RenderViolationSeveritySchema,
  message: z.string(),
  turnId: z.string().optional(),
  sourceEventId: z.string().optional(),
});

export const SceneLogEditorialRenderModeSchema = z.enum(["normal", "expanded", "spotlight"]);

export const SceneLogEditorialExpansionPlanSchema = z.object({
  turnId: z.string(),
  sourceActionLogIds: z.array(z.string()).default([]),
  editorialHeat: z.number().min(0).max(1),
  renderMode: SceneLogEditorialRenderModeSchema,
  expansionReasons: z.array(z.string()).default([]),
  suggestedParagraphs: z.number().int().positive(),
});

export const RenderedDialogueLineSchema = z.object({
  turnId: z.string(),
  sourceEventId: z.string(),
  sourceActionLogIds: z.array(z.string()).default([]),
  speakerId: z.string(),
  speakerName: z.string(),
  listenerNames: z.array(z.string()),
  utterance: z.string(),
});

export const SceneLogRenderReportSchema = z.object({
  sceneId: z.string(),
  chapter: z.number().int().positive(),
  sourceEventIds: z.array(z.string()),
  sourceActionLogIds: z.array(z.string()).default([]),
  dialogueLineCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  actionLogCoverage: z.number().min(0).max(1).default(1),
  editorialExpansionCount: z.number().int().nonnegative().default(0),
  expandedTurnIds: z.array(z.string()).default([]),
  editorialExpansionPlans: z.array(SceneLogEditorialExpansionPlanSchema).default([]),
  violations: z.array(SceneLogRenderViolationSchema),
});

export const SceneLogRenderOptionsSchema = z.object({
  includeTraceComments: z.boolean().default(true),
  includeTitle: z.boolean().default(true),
});

export const SceneLogRenderInputSchema = z.object({
  sceneLog: SceneLogSchema,
  worldBrain: WorldBrainSchema.optional(),
  options: SceneLogRenderOptionsSchema.partial().optional(),
});

export const SceneLogRenderResultSchema = z.object({
  text: z.string(),
  dialogueLines: z.array(RenderedDialogueLineSchema),
  report: SceneLogRenderReportSchema,
});

export const SceneLogBatchRenderInputSchema = z.object({
  sceneLogs: z.array(SceneLogSchema),
  worldBrain: WorldBrainSchema.optional(),
  options: SceneLogRenderOptionsSchema.partial().optional(),
});

export const SceneLogBatchRenderReportSchema = z.object({
  sceneCount: z.number().int().nonnegative(),
  renderedChapterCount: z.number().int().nonnegative(),
  dialogueLineCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  chapters: z.array(SceneLogRenderReportSchema),
});

export const SceneLogBatchRenderResultSchema = z.object({
  scenes: z.array(SceneLogRenderResultSchema),
  report: SceneLogBatchRenderReportSchema,
});

export type RenderViolationCode = z.infer<typeof RenderViolationCodeSchema>;
export type RenderViolationSeverity = z.infer<typeof RenderViolationSeveritySchema>;
export type SceneLogRenderViolation = z.infer<typeof SceneLogRenderViolationSchema>;
export type SceneLogEditorialRenderMode = z.infer<typeof SceneLogEditorialRenderModeSchema>;
export type SceneLogEditorialExpansionPlan = z.infer<typeof SceneLogEditorialExpansionPlanSchema>;
export type RenderedDialogueLine = z.infer<typeof RenderedDialogueLineSchema>;
export type SceneLogRenderReport = z.infer<typeof SceneLogRenderReportSchema>;
export type SceneLogRenderOptions = z.infer<typeof SceneLogRenderOptionsSchema>;
export type SceneLogRenderInput = z.infer<typeof SceneLogRenderInputSchema>;
export type SceneLogRenderResult = z.infer<typeof SceneLogRenderResultSchema>;
export type SceneLogBatchRenderInput = z.infer<typeof SceneLogBatchRenderInputSchema>;
export type SceneLogBatchRenderReport = z.infer<typeof SceneLogBatchRenderReportSchema>;
export type SceneLogBatchRenderResult = z.infer<typeof SceneLogBatchRenderResultSchema>;

const SPEECH_ACT_TONE: Record<DialogueSpeechAct, string[]> = {
  probe: [
    "상대의 표정을 놓치지 않으려는 듯",
    "서류 끈을 풀지 않은 채",
    "말끝을 부드럽게 접었지만 고개만은 물러서지 않은 채",
    "의자 팔걸이에 손을 둔 채",
    "질문보다 먼저 고개를 살짝 기울이며",
    "문가의 기척을 한 번 확인하고",
    "창틀의 그림자를 한 번 훑으며",
  ],
  deflect: [
    "대답 대신 얕게 웃으며",
    "질문의 끝을 다른 곳으로 밀어내듯",
    "잠깐 침묵을 세운 뒤",
    "장갑 끝을 소매 안쪽으로 밀어 넣으며",
    "말을 고르듯 숨을 한 번 낮추고",
    "촛농이 굳은 자리로 눈길을 내린 채",
  ],
  request_help: [
    "주변의 소리를 한 번 확인하고",
    "목소리를 낮춰",
    "서류 모서리를 손바닥으로 가리며",
    "의자 등받이 뒤로 한 걸음 물러나며",
  ],
  request_access: [
    "문가의 빛을 한 번 확인하고",
    "한 걸음 물러선 자리에서",
    "말의 무게를 가볍게 보이게 만들며",
    "손끝을 서류 가장자리에서 멈추고",
    "상대의 대답보다 문 쪽을 먼저 보며",
  ],
  maintain_mask: [
    "흐트러지지 않은 미소로",
    "누구도 책잡을 수 없는 어조로",
    "감정을 얇은 베일 아래 감추고",
  ],
  threaten_softly: [
    "웃음기를 아주 조금만 남긴 채",
    "상냥한 말투로 날을 숨기며",
    "주변 사람들이 듣기에는 평범한 안부처럼",
  ],
  confess_partial: [
    "진실의 일부만 조심스럽게 꺼내며",
    "말하지 않은 부분을 침묵에 남겨 둔 채",
    "상대가 오해할 여지를 계산하며",
  ],
  reassure: [
    "불안을 잠재우듯",
    "상대를 안심시키는 목소리로",
    "표정을 부드럽게 풀며",
  ],
  withhold: [
    "가장 중요한 말은 삼킨 채",
    "시선을 잠시 잔 안쪽에 떨어뜨리고",
    "대답할 수 있는 부분만 고르며",
  ],
};

const REACTION_BEATS = [
  "테이블 위 봉투의 봉인 끈이 낮게 흔들리고, 맞은편 손이 잠깐 멈췄다.",
  "그 말은 다정한 인사처럼 들렸지만, 끝에는 작은 가시가 남았다.",
  "대답보다 먼저 문손잡이 쪽의 그림자가 움직였다. 은빛 가장자리가 잠깐 차갑게 번졌다.",
  "문가에 선 사람 하나가 숨을 삼켰고, 말끝은 그 자리에서 반쯤 접혔다.",
  "누군가는 고개를 낮췄고, 누군가는 잔에서 손을 떼지 않았다.",
  "짧은 정적 뒤, 상대의 입술이 닫힌 채로 한 번 더 굳어졌다.",
  "커튼 아래 그림자가 느리게 밀렸고, 대답은 그보다 늦게 도착했다.",
  "소매 끝이 테이블 모서리를 스쳤다. 아무도 그 소리를 모른 척했다.",
  "벽난로의 재가 아주 작게 내려앉았다.",
  "창빛이 서류 가장자리에서 흔들렸고, 눈길은 다른 곳으로 비켜 갔다.",
  "말이 끝난 자리에는 장갑 한 짝만큼의 거리가 새로 생겼다.",
  "촛농이 굳어 가는 동안, 누구도 먼저 웃지 않았다.",
  "바닥의 빛 번짐이 발끝 아래에서 얇게 갈라졌다.",
  "닫힌 문틈 너머의 기척이 잠깐 멎었다.",
  "의자 다리가 마른 소리를 냈고, 그 소리에 모두가 한 박자 늦었다.",
  "잉크가 마르지 않은 서류 위로 그림자가 지나갔다.",
  "잔 받침에 닿은 손끝이 미세하게 방향을 바꾸었다.",
  "누군가 숨을 들이마셨지만, 말은 아직 입술 밖으로 나오지 않았다.",
  "문가의 시선 하나가 다른 사람의 어깨 너머로 미끄러졌다.",
  "서류 모서리에 눌린 빛이 잠깐 끊겼다가 다시 이어졌다.",
  "찻잔 아래 고인 온기가 대답보다 먼저 식어 갔다.",
  "복도 쪽 발소리가 지나가자 방 안의 침묵이 더 낮아졌다.",
  "장갑 낀 손이 테이블 아래에서 천천히 펴졌다.",
  "누군가는 방금 나온 이름을 다시 삼키듯 시선을 내렸다.",
  "반쯤 열린 문이 아주 작게 흔들리고 곧 멈췄다.",
  "의자 등받이에 얹힌 손이 대답 대신 힘을 잃었다.",
  "창문에 비친 얼굴들이 서로 다른 속도로 굳어 갔다.",
  "잉크 냄새가 옅어질수록 방금의 말은 더 또렷하게 남았다.",
  "바닥의 그림자가 테이블 밑으로 물러나며 자리를 비웠다.",
  "옷깃을 스친 숨이 짧게 끊기고, 다음 말은 늦어졌다.",
  "누구도 고개를 들지 않았지만 모두가 방금의 방향을 알았다.",
  "작은 금속음 하나가 지나간 뒤, 침묵은 전보다 얇아졌다.",
];

function stableIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return modulo === 0 ? 0 : hash % modulo;
}

function pick(seed: string, values: string[]): string {
  return values[stableIndex(seed, values.length)] ?? values[0] ?? "";
}

function shortName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function hasFinalConsonant(value: string): boolean {
  const last = Array.from(value.trim()).at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

function topicName(name: string): string {
  const shortened = shortName(name);
  return `${shortened}${hasFinalConsonant(shortened) ? "은" : "는"}`;
}

function topicPhrase(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "은" : "는"}`;
}

function subjectPhrase(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "이" : "가"}`;
}

function objectPhrase(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "을" : "를"}`;
}

function pairPhrase(left: string, right: string): string {
  return `${left}${hasFinalConsonant(left) ? "과" : "와"} ${right}`;
}

function formatList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")}${hasFinalConsonant(values.at(-2) ?? "") ? "과" : "와"} ${values[values.length - 1]}`;
}

function firstSentence(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？]|다|요)\s+/)[0]
    ?.trim() || value.trim();
}

function hideTechnicalIds(value: string): string {
  return value.replace(/\b[a-z][a-z0-9_]*\b/g, "남겨 둔 단서");
}

function replaceParticlePlaceholder(
  value: string,
  placeholder: string,
  particleForStem: (stem: string) => string,
): string {
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[\\s("'“‘\\[{/:;])([^\\s,.;:!?()[\\]{}"“”'‘’]+(?:\\s+[^\\s,.;:!?()[\\]{}"“”'‘’]+)*)${escaped}`,
    "gu",
  );
  return value.replace(pattern, (_match, prefix: string, stem: string) =>
    `${prefix}${stem}${particleForStem(stem.trim())}`
  );
}

function resolveParticlePlaceholders(value: string): string {
  return [
    (text: string) => replaceParticlePlaceholder(text, "은/는", (stem) => hasFinalConsonant(stem) ? "은" : "는"),
    (text: string) => replaceParticlePlaceholder(text, "이/가", (stem) => hasFinalConsonant(stem) ? "이" : "가"),
    (text: string) => replaceParticlePlaceholder(text, "을/를", (stem) => hasFinalConsonant(stem) ? "을" : "를"),
    (text: string) => replaceParticlePlaceholder(text, "과/와", (stem) => hasFinalConsonant(stem) ? "과" : "와"),
    (text: string) => replaceParticlePlaceholder(text, "와/과", (stem) => hasFinalConsonant(stem) ? "과" : "와"),
  ].reduce((text, transform) => transform(text), value);
}

function cleanSurfaceText(value: string): string {
  return resolveParticlePlaceholders(value)
    .replace(/숨겨진/gu, "비공개")
    .replace(/숨겨져/gu, "닫혀")
    .replace(/숨은/gu, "말하지 않은")
    .replace(/압박감|압박/gu, "긴장")
    .replace(/은잔와/gu, "은잔과")
    .replace(/향를/gu, "향을")
    .replace(/타이밍를/gu, "타이밍을")
    .replace(/수상한 물건가/gu, "수상한 물건이")
    .replace(/수상한 물건를/gu, "수상한 물건을")
    .replace(/감춰진/gu, "닫힌")
    .replace(/감춰둔/gu, "닫아 둔")
    .replace(/감추려/gu, "말끝을 닫으려")
    .replace(/탐색/gu, "확인")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanRenderedSurfaceText(value: string): string {
  return value
    .replace(/독살의 기억을 안고 깨어난 엘리시아가,\s*거울 속 3년 전의 자신을 보며 잔을 내려놓고 첫 증거를 손끝에 남긴다/gu, "엘리시아는 독살의 기억을 삼킨 채 거울 속 3년 전의 얼굴을 바라보았다. 잔은 아직 손끝 아래에 있었다")
    .replace(/([.?!。！？])\s*\./gu, "$1")
    .replace(/은잔와/gu, "은잔과")
    .replace(/향를/gu, "향을")
    .replace(/타이밍를/gu, "타이밍을")
    .replace(/수상한 물건가/gu, "수상한 물건이")
    .replace(/수상한 물건를/gu, "수상한 물건을")
    .replace(/압박감|압박/gu, "긴장")
    .replace(/숨겨진/gu, "비공개")
    .replace(/숨겨져/gu, "닫혀")
    .replace(/숨은/gu, "말하지 않은");
}

function pressureLabel(sceneLog: SceneLog): string {
  const type = sceneLog.narrativeDirectorPressures[0]?.type;
  if (type === "constraint") return "제약";
  if (type === "opportunity") return "빈틈";
  if (type === "rumor") return "소문";
  if (type === "deadline") return "시한";
  return "조건";
}

function pressureCue(sceneLog: SceneLog): string {
  const summary = cleanSurfaceText(sceneLog.narrativeDirectorPressures[0]?.summary ?? "");
  if (/하인|명단|봉쇄/u.test(summary)) return "명단 봉쇄";
  if (/감시|교대/u.test(summary)) return "감시 교대";
  if (/증인|공개 발언/u.test(summary)) return "증인의 시선";
  if (/소문|기록/u.test(summary)) return "기록 소문";
  if (/시한|마감|밤/u.test(summary)) return "밤의 시한";
  return pressureLabel(sceneLog);
}

function pressureBeatCue(sceneLog: SceneLog, seed: string): string {
  const pressure = pressureCue(sceneLog);
  const variantsByPressure: Record<string, string[]> = {
    "명단 봉쇄": ["닫힌 장부", "비어 있는 이름", "접힌 명부", "남은 표식"],
    "감시 교대": ["문가의 눈", "바뀌는 발걸음", "복도 끝 기척", "다음 순찰"],
    "증인의 시선": ["곁눈질", "듣는 귀", "굳어 가는 발언", "남은 목격자"],
    "기록 소문": ["닫힌 기록", "돌아다니는 말", "복도에 남은 소문", "접힌 문서"],
    "밤의 시한": ["늦은 종소리", "남은 시각", "식어 가는 촛농", "다음 마감"],
    "제약": ["좁아진 길", "남은 조건", "닫힌 선택지", "지켜보는 자리"],
    "빈틈": ["벌어진 틈", "낮아진 목소리", "비어 있는 자리", "늦은 기척"],
    "소문": ["낮은 말", "돌아다니는 이름", "문밖의 속삭임", "흐려진 목격담"],
    "시한": ["남은 시각", "다음 종소리", "짧아진 밤", "닫히는 시간"],
    "조건": ["남은 조건", "좁아진 자리", "흔들린 순서", "늦은 기척"],
  };
  const variants = variantsByPressure[pressure] ?? [pressure, "남은 조건", "좁아진 자리", "늦은 기척"];
  return pick(`${seed}:pressure-beat-cue`, variants);
}

function readerPressureSentence(sceneLog: SceneLog): string {
  const pressure = cleanSurfaceText(sceneLog.narrativeDirectorPressures[0]?.summary ?? "");
  const locationCue = sceneLog.location.split(/\s+/u).slice(-1)[0] ?? "방";
  const pressureName = pressureCue(sceneLog);
  const purpose = sceneLog.scenePurpose;

  if (/응접실 배치|사용인 동선/u.test(pressure)) {
    return pick(`${sceneLog.sceneId}:reader-pressure:layout`, [
      `${locationCue}의 의자 배치가 새벽 사이 조금 달라져 있었다.`,
      `어제와 같은 방인데도 문가에 선 사람들의 자리가 미묘하게 바뀌어 있었다.`,
      `차를 따르는 손과 문가를 지키는 발끝이 평소보다 한 박자씩 어긋나 있었다.`,
    ]);
  }
  if (/문서실|기록|장부|명단/u.test(pressure)) {
    return pick(`${sceneLog.sceneId}:reader-pressure:record`, [
      `닫힌 장부 한 권이 아직 주인을 정하지 못한 채 테이블 가장자리에 놓여 있었다.`,
      `누군가 다시 쓴 줄 하나가 방 안의 말을 조심스럽게 만들었다.`,
      `기록을 맡은 손이 오기 전까지, 누구도 먼저 이름을 입에 올리지 않았다.`,
    ]);
  }
  if (/증인|하인|소문|목격/u.test(pressure)) {
    return pick(`${sceneLog.sceneId}:reader-pressure:witness`, [
      `문밖의 속삭임은 낮았지만, 방 안의 사람들은 이미 들은 얼굴이었다.`,
      `같은 일을 본 사람들의 말이 조금씩 달라지기 시작했다.`,
      `이름 없는 목격담 하나가 찻잔보다 먼저 자리를 차지했다.`,
    ]);
  }
  if (/봉쇄|명령|권한|허락|접근/u.test(pressure)) {
    return pick(`${sceneLog.sceneId}:reader-pressure:access`, [
      `문은 열려 있었지만, 드나들 수 있는 사람의 수는 이미 줄어 있었다.`,
      `허락받은 길 하나가 조용히 닫히려 하고 있었다.`,
      `누군가는 들어올 수 있었고, 누군가는 같은 문 앞에서 멈춰야 했다.`,
    ]);
  }
  if (/감시|교대|순찰/u.test(pressure)) {
    return pick(`${sceneLog.sceneId}:reader-pressure:watch`, [
      `복도 끝의 발걸음이 바뀌는 순간마다 방 안의 말도 조금씩 짧아졌다.`,
      `지켜보는 눈이 바뀌자, 같은 침묵도 다른 뜻을 갖기 시작했다.`,
      `다음 순찰이 오기 전까지 남은 시간은 길지 않았다.`,
    ]);
  }
  if (purpose === "foreshadowing") {
    return pick(`${sceneLog.sceneId}:reader-pressure:foreshadow`, [
      `아직 설명되지 않은 흔적 하나가 사라지지 않고 빛 아래 남아 있었다.`,
      `아무도 묻지 않은 물건 하나가 다음 말을 기다리는 듯 놓여 있었다.`,
      `그 자리에는 지금 대답할 수 없는 작은 징후가 남아 있었다.`,
    ]);
  }

  return pick(`${sceneLog.sceneId}:reader-pressure:${pressureName}`, [
    `${pressureName}은 말보다 먼저 방 안의 속도를 늦췄다.`,
    `그 자리에는 아직 이름 붙이지 못한 ${pressureName} 하나가 남아 있었다.`,
    `사람들은 ${pressureName}을 모르는 척했지만, 누구도 평소처럼 움직이지 못했다.`,
  ]);
}

function surfaceClauseVariant(seed: string, phrase: string, variants: string[]): string {
  if (!phrase) return "";
  return variants[stableIndex(seed, variants.length)] ?? phrase;
}

function polishUtteranceForSurface(turn: DialogueTurn, utterance: string): string {
  return utterance
    .replace(/전 같은 실수를 반복하지 않을 겁니다\.\s*장부 끝의 이름부터 확인하겠습니다/gu, surfaceClauseVariant(`${turn.turnId}:same-mistake-ledger`, "전 같은 실수를 반복하지 않을 겁니다. 장부 끝의 이름부터 확인하겠습니다", [
      "오늘은 잔보다 장부를 먼저 보겠습니다",
      "끝에 남은 이름부터 확인하죠",
      "그 이름이 왜 거기 있는지 직접 보겠습니다",
      "저는 이번엔 장부의 빈칸을 먼저 읽겠습니다",
    ]))
    .replace(/전 같은 실수를 반복하지 않을 겁니다\.\s*사용인들의 입이 닫히기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:same-mistake-servants`, "전 같은 실수를 반복하지 않을 겁니다. 사용인들의 입이 닫히기 전에요", [
      "사용인들이 같은 말을 외우기 전에 만나야겠어요",
      "입들이 닫히기 전에, 제가 먼저 듣겠습니다",
      "아직 말이 맞춰지지 않았을 때 확인해야 합니다",
      "늦으면 모두 같은 대답만 하게 될 겁니다",
    ]))
    .replace(/사용인들의 입이 닫히기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:servant-mouths`, "사용인들의 입이 닫히기 전에요", [
      "하인들이 같은 말을 외우기 전에요",
      "명단이 먼저 닫히기 전에요",
      "누가 먼저 지시받기 전에요",
      "방 밖의 말이 한 줄로 맞춰지기 전에요",
    ]))
    .replace(/문서가 사라지기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:document-vanish`, "문서가 사라지기 전에요", [
      "그 서류가 다른 손으로 넘어가기 전에요",
      "빈 자리가 먼저 덮이기 전에요",
      "기록함이 닫히기 전에요",
      "누군가 장부를 다시 묶기 전에요",
      "서류의 행방이 말로 정리되기 전에요",
      "그 줄이 지워졌다고 말하기 전에요",
      "문서가 방 밖으로 나가기 전에요",
      "남은 종이가 다른 이름을 얻기 전에요",
    ]))
    .replace(/다음에는 다른 자리에서 묻겠습니다\s+다음 말은 장소를 바꾸겠습니다/gu, "다음에는 다른 자리에서 묻겠습니다")
    .replace(/장부 끝의 이름부터 확인하겠습니다\s+말은 여기까지만 하죠/gu, "장부 끝의 이름부터 확인하겠습니다")
    .replace(/([가-힣](?:다|요|죠|니다|습니다|겠습니다))\.\s+다음 말은 장소를 바꾸겠습니다/gu, "$1")
    .replace(/([가-힣](?:다|요|죠|니다|습니다|겠습니다))\s+(말은 여기까지만 하죠|다음 말은 장소를 바꾸겠습니다)/gu, "$1")
    .replace(/재밌네요\.\s*보통은 그렇게 정면으로 나오지 않거든요/gu, surfaceClauseVariant(`${turn.turnId}:direct-front`, "재밌네요. 보통은 그렇게 정면으로 나오지 않거든요", [
      "그렇게 바로 나오실 줄은 몰랐습니다",
      "그 대답은 생각보다 빠르군요",
      "예상보다 먼저 선을 넘으셨네요",
      "그 말은 못 들은 척하기 어렵겠습니다",
    ]))
    .replace(/공개 발언으로 굳기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:public-speech`, "공개 발언으로 굳기 전에요", [
      "사람들 앞에서 굳어지기 전에요",
      "공식적인 말이 되기 전에요",
      "증인의 기억에 박히기 전에요",
      "이 자리의 답으로 남기 전에요",
    ]))
    .replace(/증인이 듣기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:witness`, "증인이 듣기 전에요", [
      "증인 귀에 들어가기 전에요",
      "누가 들었다고 말하기 전에요",
      "듣는 사람이 늘어나기 전에요",
      "방 밖으로 나가기 전에요",
    ]))
    .replace(/출입 명분이 끊기기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:access`, "출입 명분이 끊기기 전에요", [
      "드나들 이유가 사라지기 전에요",
      "문턱을 넘을 핑계가 없어지기 전에요",
      "허락받을 길이 막히기 전에요",
      "문이 닫히기 전에요",
    ]))
    .replace(/기록 시간이 바뀌기 전입니다/gu, surfaceClauseVariant(`${turn.turnId}:record-time`, "기록 시간이 바뀌기 전입니다", [
      "기록 담당자가 오기 전입니다",
      "그 줄이 다시 쓰이기 전입니다",
      "장부의 시간이 굳기 전입니다",
      "초가 바뀌기 전에 확인해야 합니다",
    ]))
    .replace(/서명란이 채워지면 늦습니다/gu, surfaceClauseVariant(`${turn.turnId}:signature`, "서명란이 채워지면 늦습니다", [
      "서명이 올라가면 돌이키기 어렵습니다",
      "빈칸이 닫히면 늦습니다",
      "이름이 들어가기 전에 봐야 합니다",
      "도장이 찍히면 끝입니다",
    ]))
    .replace(/다음 종이 울리기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:bell`, "다음 종이 울리기 전에요", [
      "종소리가 복도까지 가기 전에요",
      "다음 알림이 오기 전에요",
      "시계가 넘어가기 전에요",
      "문밖이 다시 소란해지기 전에요",
    ]))
    .replace(/명분이 끊기기 전에요/gu, surfaceClauseVariant(`${turn.turnId}:cause`, "명분이 끊기기 전에요", [
      "이유가 사라지기 전에요",
      "핑계가 닫히기 전에요",
      "말할 자리가 없어지기 전에요",
    ]))
    .replace(/탐색/gu, "확인")
    .replace(/은잔와/gu, "은잔과")
    .replace(/향를/gu, "향을")
    .replace(/타이밍를/gu, "타이밍을")
    .replace(/수상한 물건가/gu, "수상한 물건이")
    .replace(/수상한 물건를/gu, "수상한 물건을")
    .replace(/빈 줄 하나가 증거를 삼키겠습니다/gu, surfaceClauseVariant(`${turn.turnId}:evidence-tail`, "빈 줄 하나가 증거를 삼키겠습니다", [
      "빈 줄 하나가 일을 덮을 겁니다",
      "비어 있는 이름부터 사라질 겁니다",
      "그 줄이 닫히면 늦습니다",
      "장부가 먼저 입을 닫을 겁니다",
    ]));
}

function proseOutcomeFromSceneOutcome(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "말하지 못한 단서 하나가 방 안에 남았다";
  if (/\[[^\]]+\]|->|복선|state|delta|act_|evt_|신뢰 축|압력이|source/i.test(normalized)) {
    const trustMatch = /([^:>\[\]—]+?)와\s+([^:>\[\]—]+?)의\s+신뢰\s+축이\s+(-?\d+)/u.exec(normalized);
    if (trustMatch) {
      const left = shortName(cleanSurfaceText(trustMatch[1] ?? "누군가"));
      const right = shortName(cleanSurfaceText(trustMatch[2] ?? "상대"));
      const delta = Number.parseInt(trustMatch[3] ?? "0", 10);
      if (delta < 0) return `${pairPhrase(left, right)} 사이에 말로 풀 수 없는 의심이 남았다`;
      if (delta > 0) return `${pairPhrase(left, right)} 사이의 거리가 아주 조금 좁아졌다`;
      return `${topicPhrase(pairPhrase(left, right))} 서로의 위치만 다시 확인했다`;
    }
    if (/신뢰 축이 -|의심|경계|hostility|suspicion/i.test(normalized)) {
      return "둘 사이의 의심이 한 겹 더 두꺼워졌다";
    }
    if (/신뢰 축이 \+|도움|협력|dependency|trust/i.test(normalized)) {
      return "누군가는 마음속으로 한 걸음 더 가까이 다가섰다";
    }
    if (/접근|허락|문|기록|서고|권한/i.test(normalized)) {
      return "닫힌 문 하나가 아직 완전히 잠기지 않은 채 남았다";
    }
    return "눈에 띄지 않는 단서 하나가 방 안에 그대로 남았다";
  }
  return firstSentence(normalized);
}

function isGenericChapterTitle(title: string): boolean {
  return /^\d+화$/u.test(title.trim());
}

function readerSceneCue(sceneLog: SceneLog): string {
  if (sceneLog.title && !isGenericChapterTitle(sceneLog.title)) return sceneLog.title;
  const variants = [
    `${sceneLog.location}`,
    "그날의 대화",
    `${sceneLog.location}`,
    "그 자리",
    "방 안",
  ];
  return pick(`${sceneLog.sceneId}:reader-scene-cue`, variants);
}

function generatedSceneTitle(sceneLog: SceneLog): string {
  if (sceneLog.title && !isGenericChapterTitle(sceneLog.title)) return sceneLog.title;

  const locationTail = sceneLog.location.split(/\s+/u).at(-1) ?? sceneLog.location;
  const pressure = pressureBeatCue(sceneLog, `${sceneLog.sceneId}:title`);
  const purposeTitle: Record<string, string[]> = {
    establish_state: [`${locationTail}의 바뀐 자리`, `${pressure}의 아침`, `다시 놓인 ${pressure}`],
    information_discovery: [`${locationTail}의 접힌 기록`, `${objectPhrase(pressure)} 읽는 손`, `닫히기 전의 ${pressure}`],
    relationship_probe: [`${locationTail}의 낮은 질문`, `${pressure} 앞의 대답`, `서로를 재는 ${pressure}`],
    secret_pressure: [`${locationTail}의 말하지 않은 틈`, `${pressure}의 뒷면`, `숨은 ${pressure}`],
    advance_plot: [`${locationTail}의 방향 전환`, `${subjectPhrase(pressure)} 움직인 순간`, `다음 문으로 넘어간 ${pressure}`],
    foreshadowing: [`${locationTail}에 남은 징후`, `${pressure} 아래의 예고`, `아직 닫히지 않은 ${pressure}`],
    aftermath: [`${locationTail}의 남은 거리`, `${pressure} 뒤의 침묵`, `말이 멎은 뒤의 ${pressure}`],
  };
  const candidates = purposeTitle[sceneLog.scenePurpose] ?? [`${locationTail}의 ${pressure}`, `${pressure}가 남은 자리`];
  return pick(`${sceneLog.sceneId}:generated-title`, candidates);
}

function readerPressureFrame(sceneLog: SceneLog): string {
  const pressure = pressureCue(sceneLog);
  if (sceneLog.title && !isGenericChapterTitle(sceneLog.title)) {
    return `${sceneLog.title}의 ${pressure}`;
  }
  return `${sceneLog.location}의 ${pressure}`;
}

function softenRepeatedLocationMentions(sceneLog: SceneLog, text: string): string {
  const location = sceneLog.location.trim();
  if (!location) return text;
  let count = 0;
  const variants = ["그 자리", "방 안", "문 안쪽", "테이블 곁", "낮은 자리"];
  return text.replaceAll(location, () => {
    count += 1;
    if (count <= 1) return location;
    return variants[(count - 2) % variants.length] ?? "그 자리";
  });
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?。！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function collectForbiddenFacts(sceneLog: SceneLog): string[] {
  const facts = sceneLog.dialogueTurns.flatMap((turn) =>
    turn.renderableConstraints.forbiddenExplicitFacts
  );
  return Array.from(new Set<string>(facts)).filter((fact) => fact.trim().length > 0);
}

function maskForbiddenFacts(sceneLog: SceneLog, text: string): string {
  let masked = text;
  for (const fact of collectForbiddenFacts(sceneLog)) {
    masked = masked.split(fact).join("말하지 못한 속셈");
  }
  return masked;
}

function safeAllowedFactHint(turn: DialogueTurn): string {
  const allowed = turn.renderableConstraints.allowedRevealedFacts
    .filter((fact) => !turn.renderableConstraints.forbiddenExplicitFacts.includes(fact));
  const fact = allowed[stableIndex(`${turn.turnId}:fact`, allowed.length)];
  if (!fact) return "상황을 다시 확인하고 싶어요";

  if (fact.includes("믿을 수 없고")) {
    return "제가 아직 놓친 게 있는지 확인하고 싶어요";
  }
  if (fact.includes("경계심")) {
    return "오늘은 서로 조금 조심스러워지는 날인 것 같네요";
  }
  return firstSentence(fact).replace(/은\/는/g, "은");
}

function fallbackUtterance(turn: DialogueTurn): string {
  const speaker = shortName(turn.speakerName);
  const listener = shortName(turn.listenerNames[0] ?? "당신");
  const hint = safeAllowedFactHint(turn);
  const variants: Record<DialogueSpeechAct, string[]> = {
    probe: [
      `${listener}님, 방금 그 표정은 제가 모르는 이야기를 알고 계신다는 뜻일까요?`,
      `${listener}님은 늘 중요한 순간에 가장 조용해지시더군요.`,
      `제가 괜한 걱정을 하는 건지, ${listener}님께서 직접 말씀해 주시겠어요?`,
    ],
    deflect: [
      `그 이야기는 지금보다 차가 조금 식은 뒤에 해도 늦지 않겠지요.`,
      `오늘은 제 이야기가 아니라 이 자리의 예법이 먼저인 것 같네요.`,
      `그렇게까지 염려하실 일은 아닙니다.`,
    ],
    request_help: [
      `${listener}님, 지금은 이유를 묻지 말고 제 곁에 있어 주세요.`,
      `제가 직접 움직이기 어려운 일이 있어요. 조용히 도와주실 수 있나요?`,
      `오늘 이 방에서 나간 말은 여기까지만 머물러야 합니다.`,
    ],
    request_access: [
      `잠시 확인해야 할 것이 있습니다. 방해가 되지 않는 선에서 허락해 주시겠어요?`,
      `그 물건을 가까이서 볼 수 있다면 오해를 줄일 수 있을 것 같습니다.`,
      `예법에 어긋나지 않는 범위라면 제가 직접 살펴보겠습니다.`,
    ],
    maintain_mask: [
      `걱정해 주셔서 감사합니다. 저는 괜찮습니다.`,
      `이 정도 일로 자리를 흐릴 생각은 없습니다.`,
      `모두가 보는 자리이니, 웃는 얼굴이 제일 안전하겠지요.`,
    ],
    threaten_softly: [
      `가끔은 사소한 말 한마디가 아주 멀리까지 가더군요.`,
      `${listener}님께서도 오늘 일을 오래 기억하실 것 같습니다.`,
      `실수는 누구나 하지만, 같은 실수를 반복하면 선택이 되지요.`,
    ],
    confess_partial: [
      `제가 말할 수 있는 건 여기까지입니다.`,
      `모든 것을 아는 건 아니지만, 모르는 척할 만큼 어리석지도 않습니다.`,
      `어떤 일은 아직 이름을 붙이기 이릅니다.`,
    ],
    reassure: [
      `괜찮아요. 적어도 지금은 제가 흔들리지 않을 겁니다.`,
      `${listener}님이 걱정하는 일은 일어나지 않게 하겠습니다.`,
      `오늘은 그저 평소처럼 지나가면 됩니다.`,
    ],
    withhold: [
      `그 질문에는 아직 답하지 않는 편이 좋겠습니다.`,
      `제가 드릴 수 있는 대답은 ${hint}라는 것뿐입니다.`,
      `지금은 침묵이 더 예의에 맞겠지요.`,
    ],
  };

  const selected = pick(`${turn.turnId}:${speaker}:${turn.speechAct}`, variants[turn.speechAct]);
  return selected;
}

function renderDialogueLine(turn: DialogueTurn): RenderedDialogueLine {
  const existing = turn.draftStatus === "drafted" ? turn.utterance?.trim() : null;
  const utterance = existing || fallbackUtterance(turn);
  return {
    turnId: turn.turnId,
    sourceEventId: turn.sourceEventId,
    sourceActionLogIds: turn.sourceActionLogIds,
    speakerId: turn.speakerId,
    speakerName: turn.speakerName,
    listenerNames: turn.listenerNames,
    utterance: polishUtteranceForSurface(turn, utterance),
  };
}

function renderOpeningParagraph(sceneLog: SceneLog, worldBrain?: WorldBrain): string {
  const anchors = sceneLog.sensoryAnchors.filter((anchor) => anchor !== sceneLog.location);
  const firstAnchor = anchors[0] ?? "빛";
  const secondAnchor = anchors[1] ?? "정적";
  const thirdAnchor = anchors[2] ?? "문가";
  const pressure = readerPressureSentence(sceneLog);
  void worldBrain;

  const variants = [
    [
      `${sceneLog.location}의 아침은 지나치게 얌전했다.`,
      `책상 위의 ${firstAnchor}, 그 곁의 ${secondAnchor}. 둘 다 아무 일도 없었다는 듯 제자리를 지키고 있었다.`,
      `${ensureSentence(pressure)} 조용한 방일수록 작은 균열은 더 또렷하게 들리는 법이었다.`,
    ],
    [
      `${sceneLog.location}에는 먼저 ${firstAnchor}의 차가운 윤곽이 떠올랐다.`,
      `${topicPhrase(secondAnchor)} 쉽게 걷히지 않았고, ${thirdAnchor} 쪽의 기척만 아주 얇게 흔들렸다.`,
      ensureSentence(pressure),
      "누구도 먼저 잘못된 것을 가리키지 않았다.",
    ],
    [
      `${topicName(firstAnchor)} ${sceneLog.location}의 한쪽을 낮게 눌렀다.`,
      `${secondAnchor} 곁에 놓인 작은 사물들은 제자리를 지켰지만, 사람들의 시선은 이미 조금씩 어긋나 있었다.`,
      `${ensureSentence(pressure)} 평온한 표면 아래에서 질문 하나가 천천히 방향을 바꾸었다.`,
    ],
    [
      `${sceneLog.location}의 문턱을 넘기 전부터 ${topicName(secondAnchor)} 지나치게 가지런했다.`,
      `${firstAnchor}과 ${thirdAnchor} 사이로 남은 빛이 얇게 갈라졌고, 그 틈에 아무도 입 밖에 내지 않은 말이 고였다.`,
      `그날의 대화는 처음부터 안전한 자리를 갖지 못했다. ${ensureSentence(pressure)}`,
    ],
  ];

  return (variants[stableIndex(`${sceneLog.sceneId}:opening`, variants.length)] ?? variants[0]!)
    .filter(Boolean)
    .join(" ");
}

function renderEmotionalArcParagraph(sceneLog: SceneLog): string {
  const anchor = sceneLog.sensoryAnchors.find((value) => value !== sceneLog.location) ?? sceneLog.location;
  const pressureType = pressureCue(sceneLog);
  const titleCue = readerSceneCue(sceneLog);
  const pressureFrame = readerPressureFrame(sceneLog);
  const openingBeat = ensureSentence(toRenderableArcOpeningBeat(sceneLog, firstSentence(sceneLog.emotionalArc.start), anchor, pressureType));
  const variants = [
    `${openingBeat} 하지만 그 말은 아직 목소리가 되지 못했다. ${pressureFrame} 아래에서 살아남는 법은 먼저 알아차리고도 모르는 척하는 것이었다.`,
    `${openingBeat} ${sceneLog.location}에서 그 사실을 바로 말하는 사람은 없었다. 대신 ${pairPhrase(anchor, "문턱")}과 낮은 호흡이 먼저 서로의 위치를 재기 시작했다.`,
    `${openingBeat} 누군가는 이미 보았고, 누군가는 본 것을 숨겼다. ${titleCue}에서 말보다 먼저 움직인 것은 닫힌 문가의 기척이었다.`,
    `${openingBeat} 아직 이름 붙일 수 없는 단서가 ${sceneLog.location}의 ${anchor} 곁에 남았고, 그 단서는 말이 멈춘 뒤에야 더 선명해졌다.`,
    `${openingBeat} ${topicPhrase(pressureType)} 대답을 서두르게 만들지 않았다. 오히려 모두가 한 박자씩 늦게 움직이게 만들었다.`,
    `${openingBeat} ${pressureFrame} 아래에서 아무도 먼저 인정하지 않았지만, 이미 질문의 방향은 ${anchor} 쪽으로 조금 기울어 있었다.`,
  ];
  return variants[stableIndex(`${sceneLog.sceneId}:emotional-arc`, variants.length)] ?? variants[0]!;
}

function toRenderableArcOpeningBeat(sceneLog: SceneLog, value: string, anchor: string, pressureType: string): string {
  if (/\d+화에서\s+.+?의\s+흐름이\s+진전된다/u.test(value) || /.+?의\s+흐름이\s+진전된다/u.test(value)) {
    return pick(`${sceneLog.sceneId}:arc-flow-opening`, [
      `${topicPhrase(pressureType)} 방 안의 순서를 조금 바꿔 놓았다`,
      `${anchor} 곁에 남은 시선이 다음 말을 재촉했다`,
      `${sceneLog.location}의 정적은 전보다 얇아졌다`,
      "닫힌 문 너머의 기척이 먼저 다음 국면을 알렸다",
      "누군가 숨긴 이름 하나가 다시 방 안으로 돌아왔다",
      `${sceneLog.location}의 낮은 소음이 대답보다 먼저 흔들렸다`,
    ]);
  }
  if (/회귀\s+후|독살의\s+기억|시간\s+속성\s+마법|약혼\s+파기|거울\s+속\s+3년/u.test(value)) {
    return pick(`${sceneLog.sceneId}:return-opening:${sceneLog.chapter}`, [
      `${anchor} 곁에서 엘리시아는 되돌아온 아침의 감각을 조용히 눌러 삼켰다`,
      `엘리시아는 ${sceneLog.location}의 사물들이 전과 같은 자리에 놓였다는 사실부터 확인했다`,
      `다시 열린 시간은 큰 소리를 내지 않았고, ${anchor}만 전보다 차갑게 남아 있었다`,
      `엘리시아는 손끝에 닿은 ${anchor}를 보며 이번 아침이 전과 같지 않다는 것을 숨겼다`,
      `${sceneLog.location}의 낮은 빛 아래에서 엘리시아는 먼저 말하지 않고 남은 흔적을 세었다`,
      `거울보다 먼저 엘리시아를 붙잡은 것은 ${anchor} 곁에 남은 작은 어긋남이었다`,
      `아침은 다시 왔지만, 엘리시아는 같은 표정으로 같은 실수를 시작하지 않았다`,
      `${anchor}의 차가운 윤곽이 손끝에 닿자 엘리시아는 대답 대신 주변의 순서를 외웠다`,
    ]);
  }
  return toRenderableSurfaceBeat(value);
}

function toRenderableSurfaceBeat(value: string): string {
  return value
    .replace(/\d+화에서\s+.+?의\s+흐름이\s+진전된다/gu, "그날의 일은 조용히 다음 국면으로 넘어갔다")
    .replace(/.+?의\s+흐름이\s+진전된다/gu, "상황은 조용히 다음 국면으로 넘어갔다")
    .replace(/(.+?)\s+앞에서\s+인물들은\s+서로의\s+편인지\s+적인지\s+확인해야\s+하는\s+압박을\s+받는다/gu, "$1 앞에서 시선들이 서로의 편을 가늠했다")
    .replace(/(.+?)\s+앞에서\s+인물들은\s+서로의\s+편인지\s+적인지\s+확인해야\s+하는\s+자리에\s+놓인다/gu, "$1 앞에서 시선들이 서로의 편을 가늠했다")
    .replace(/장면의\s+핵심\s+압력이\s+된다/gu, "말하지 못한 조건으로 남는다")
    .replace(/엘리시아가\s+회귀\s+후\s+방\s+안의\s+단서를\s+확인하고,\s*시간\s+속성\s+마법을\s+각성하며,\s*약혼\s+파기를\s+위한\s+첫\s+수를\s+놓는다/gu, "엘리시아는 잔을 내려놓기 전, 방 안에 남은 흔적을 하나씩 눈에 담았다")
    .replace(/엘리시아가\s+회귀\s+후\s+상황을\s+파악하고,\s*숨겨진\s+시간\s+속성\s+마법을\s+각성하며,\s*약혼\s+파기를\s+위한\s+첫\s+수를\s+놓는다/gu, "엘리시아는 거울 속 낯선 아침을 지나, 손끝에 닿은 단서를 놓치지 않았다")
    .replace(/회귀\s+후/gu, "다시 열린 아침에")
    .replace(/시간\s+속성\s+마법을\s+각성하며/gu, "시계의 미세한 역행을 눈가에 담고")
    .replace(/약혼\s+파기를\s+위한\s+첫\s+수를\s+놓는다/gu, "약혼 반지 케이스에서 손을 거둔다")
    .replace(/숨겨진\s*/gu, "")
    .replace(/상황을 파악하고/gu, "방 안의 단서를 확인하고")
    .replace(/의도를 파악하려/gu, "시선을 떼지 않으려")
    .replace(/탐색/gu, "확인")
    .replace(/복수를 결심한다/gu, "잔을 내려놓고 첫 증거를 손끝에 남긴다")
    .replace(/결심(?:한다|했다|하고)?/gu, "손끝을 멈춘다")
    .replace(/\s+/gu, " ")
    .trim();
}

function lateSilenceBeat(name: string, seed: string): string {
  const who = shortName(name.trim());
  return pick(seed, [
    `${who}의 대답은 조금 늦게 왔다`,
    `${topicName(who)} 먼저 눈길을 내렸다`,
    `${who}의 숨이 짧게 멎었다`,
    `${topicName(who)} 바로 입을 열지 않았다`,
    `${who}의 손끝이 먼저 멈췄다`,
  ]);
}

function toRenderableHookBeat(value: string, speaker: string, listener: string, seed: string): string {
  const normalized = cleanSurfaceText(value);
  if (!normalized) return "";
  return normalized
    .replace(new RegExp(`${speaker}\\s+아우레아는\\s+먼저\\s+시선을\\s+거두고\\s+몸을\\s+돌린다`, "u"), `${topicName(speaker)} 먼저 시선을 거두고 몸을 돌렸다`)
    .replace(new RegExp(`${speaker}\\s+크레센트는\\s+먼저\\s+시선을\\s+거두고\\s+몸을\\s+돌린다`, "u"), `${topicName(speaker)} 먼저 시선을 거두고 몸을 돌렸다`)
    .replace(/([가-힣\s]+?)가\s+바로\s+답하지\s+않는\s+짧은\s+침묵/gu, (_match, name: string) =>
      lateSilenceBeat(String(name), `${seed}:silence-ga`)
    )
    .replace(/([가-힣\s]+?)이\s+바로\s+답하지\s+않는\s+짧은\s+침묵/gu, (_match, name: string) =>
      lateSilenceBeat(String(name), `${seed}:silence-i`)
    )
    .replace(/복도 쪽 소음이 멀어지며 말끝을 끊는다/gu, "복도 쪽 소음이 멀어지며 말끝을 끊었다")
    .replace(/의자 다리가 바닥을 낮게 긁고 멈춘다/gu, surfaceClauseVariant(`${seed}:chair-drag`, "의자 다리가 바닥을 낮게 긁고 멈췄다", [
      "의자 다리 하나가 마른 소리를 남겼다",
      "바닥에 닿은 의자 끝이 짧게 밀렸다",
      "나무 다리가 낮은 소리를 내고 멎었다",
      "의자 밑의 그림자가 조금 밀렸다",
    ]))
    .replace(/공기가 한 박자 낮아졌다/gu, surfaceClauseVariant(`${seed}:air-drop`, "공기가 한 박자 낮아졌다", [
      "방 안의 숨이 잠깐 낮아졌다",
      "말 사이의 공기가 얇게 가라앉았다",
      "대답 앞의 정적이 짧게 내려앉았다",
      "잔 가까이의 공기가 느리게 식었다",
    ]))
    .replace(/\s+/gu, " ")
    .trim() || lateSilenceBeat(listener, `${seed}:fallback-silence`);
}

function linePurposeAftereffect(value: string, speaker: string, listener: string): string {
  const normalized = cleanSurfaceText(value);
  if (!normalized) return "그 침묵은 다음 대답을 더 조심스럽게 만들었다.";
  if (/대화를 끊고|거리를 확보|후퇴/u.test(normalized)) {
    return `${topicName(listener)} 더 따라붙지 못했고, ${speaker}의 빈자리에 대답하지 못한 말만 남았다.`;
  }
  if (/회피|넘기/u.test(normalized)) {
    return `${topicName(listener)} 방금 비껴간 말을 다시 붙잡을지 잠깐 망설였다.`;
  }
  if (/태도|공적 응답|가면/u.test(normalized)) {
    return `${topicName(listener)} 그 차분한 표정 뒤에 남은 계산을 먼저 보았다.`;
  }
  if (/접근|명분|허락/u.test(normalized)) {
    return `${topicName(listener)} 허락의 폭을 좁히며 다음 말을 고르게 되었다.`;
  }
  if (/질문|압박|확인/u.test(normalized)) {
    return `${listener}의 침묵은 대답 대신 더 뚜렷한 경계가 되었다.`;
  }
  return `${topicName(listener)} 그 말의 끝보다 늦게 움직인 손을 보았다.`;
}

function reactionBeatForTurn(sceneLog: SceneLog, turn: DialogueTurn, index: number): string {
  const offset = stableIndex(`${sceneLog.sceneId}:reaction-order`, REACTION_BEATS.length);
  const turnOffset = stableIndex(`${turn.turnId}:reaction-turn`, 3);
  return REACTION_BEATS[(offset + index * 7 + turnOffset) % REACTION_BEATS.length]!;
}

function listenerDirectionPhrase(seed: string, listenerNames: string[]): string {
  if (listenerNames.length === 0) return "맞은편으로";
  const listeners = listenerNames.map(shortName);
  const formatted = formatList(listeners);
  const primary = listeners[0] ?? formatted;
  return pick(`${seed}:listener-direction`, [
    `${formatted} 쪽으로`,
    `${subjectPhrase(primary)} 있는 자리로`,
    `맞은편 ${primary}에게`,
    `${primary}의 시선 근처로`,
    `${primary} 앞의 빈자리로`,
  ]);
}

function listenerObjectPhrase(seed: string, listenerNames: string[]): string {
  if (listenerNames.length === 0) return "맞은편에";
  const listeners = listenerNames.map(shortName);
  const formatted = formatList(listeners);
  const primary = listeners[0] ?? formatted;
  return pick(`${seed}:listener-object`, [
    `${formatted}에게`,
    `${primary} 앞에서`,
    `맞은편 ${primary}에게`,
    `${primary}의 침묵에`,
    `${subjectPhrase(primary)} 듣는 자리에서`,
  ]);
}

function dialoguePauseBeat(seed: string, gesture: string): string {
  return pick(`${seed}:dialogue-pause`, [
    `${gesture} 말을 한 박자 늦췄다`,
    `${gesture} 시선을 잠깐 낮췄다`,
    `${gesture} 손끝을 멈췄다`,
    `${gesture} 말끝을 낮게 눌렀다`,
    `${gesture} 짧게 숨을 삼켰다`,
    `${gesture} 대답이 오기 전의 틈을 보았다`,
  ]);
}

function renderDialogueParagraph(sceneLog: SceneLog, turn: DialogueTurn, line: RenderedDialogueLine, index: number): string {
  const gestures = SPEECH_ACT_TONE[turn.speechAct];
  const gesture = gestures[(stableIndex(`${turn.turnId}:gesture`, gestures.length) + index) % gestures.length]!;
  const listenerDirection = listenerDirectionPhrase(turn.turnId, line.listenerNames);
  const listenerObject = listenerObjectPhrase(turn.turnId, line.listenerNames);
  const speaker = shortName(line.speakerName);
  const speakerTopic = topicName(line.speakerName);
  const reaction = reactionBeatForTurn(sceneLog, turn, index);
  const templateIndex = stableIndex(`${turn.turnId}:dialogue-template:${index}`, 6);
  const voiceLowering = pick(`${turn.turnId}:voice-lowering`, [
    "닿기 직전에 한 박자 낮아졌다",
    "닿는 순간 얇게 잠겼다",
    "가까워질수록 더 작아졌다",
    "도착하기 전에 숨을 한 번 삼켰다",
    "마지막 음절에서 살짝 눌렸다",
    "상대 앞에서 한 번 낮게 접혔다",
    "찻잔보다 늦게 내려앉았다",
    "문턱을 넘기 전에 짧게 멈췄다",
  ]);
  const afterSpeechBeat = pick(`${turn.turnId}:after-speech`, [
    `${listenerDirection} 시선을 거두지 않았다`,
    "눈길을 늦게 돌렸다",
    "손을 천천히 내렸다",
    "상대의 반응을 한 박자 더 기다렸다",
  ]);
  const afterSpeechLead = pick(`${turn.turnId}:after-speech-lead`, [
    "그 말 뒤에도",
    "대답이 비어 있는 사이",
    "짧은 침묵이 내려앉자",
    "말이 끝난 뒤에도",
  ]);
  const preSpeechAction = pick(`${turn.turnId}:pre-speech-action`, [
    `${listenerDirection} 시선을 올렸다`,
    `${listenerDirection} 고개를 조금 돌렸다`,
    `${listenerDirection} 손끝의 움직임을 멈췄다`,
    `${listenerDirection} 한 걸음 가까이 섰다`,
    `${listenerDirection} 문가의 기척을 먼저 확인했다`,
    `${listenerDirection} 대답이 오기 전의 정적을 살폈다`,
    `${listenerDirection} 잔 가장자리의 빛을 지나 보았다`,
    `${listenerDirection} 소매 끝을 정리했다`,
  ]);

  const pauseBeat = dialoguePauseBeat(turn.turnId, gesture);
  const templates = [
    `${speakerTopic} ${gesture} ${listenerDirection} 말했다. “${line.utterance}” ${reaction}`,
    `“${line.utterance}” ${speaker}의 목소리는 ${listenerObject} ${voiceLowering}. ${reaction}`,
    `${reaction} 그제야 ${speakerTopic} ${gesture} 말을 놓았다. “${line.utterance}”`,
    `${speakerTopic} ${pauseBeat}. “${line.utterance}” ${reaction}`,
    `“${line.utterance}” ${afterSpeechLead} ${speakerTopic} ${afterSpeechBeat}. ${reaction}`,
    `${speakerTopic} ${preSpeechAction}. ${gesture} 말을 건넸다. “${line.utterance}” ${reaction}`,
  ];

  return templates[templateIndex] ?? templates[0]!;
}

function absoluteShift(value: number | null | undefined): number {
  return Math.abs(value ?? 0);
}

function turnEditorialHeat(turn: DialogueTurn): number {
  const dynamics = turn.interactionDynamics;
  if (!dynamics) return 0;
  const relationship = dynamics.relationshipShift;
  const relationshipDelta = absoluteShift(relationship.trustDelta)
    + absoluteShift(relationship.suspicionDelta)
    + absoluteShift(relationship.dependencyDelta)
    + absoluteShift(relationship.hostilityDelta);
  const emotional = Math.min(absoluteShift(dynamics.emotionalShift.intensityDelta), 3) / 3;
  const power = Math.min(absoluteShift(dynamics.powerShift.delta), 3) / 3;
  const social = Math.min(relationshipDelta, 4) / 4;
  const interpretation = dynamics.targetInterpretations.length > 0 ? 1 : 0;
  const hidden = dynamics.hiddenIntention.trim().length > 0 || turn.hiddenIntent.trim().length > 0 ? 1 : 0;

  return Math.round((
    emotional * 0.3
    + power * 0.25
    + social * 0.25
    + interpretation * 0.1
    + hidden * 0.1
  ) * 100) / 100;
}

function editorialRenderModeForHeat(heat: number): SceneLogEditorialRenderMode {
  if (heat >= 0.82) return "spotlight";
  if (heat >= 0.62) return "expanded";
  return "normal";
}

function expansionReasonsForTurn(turn: DialogueTurn, heat: number): string[] {
  const dynamics = turn.interactionDynamics;
  if (!dynamics) return ["대사 해석 정보가 부족해 normal 처리"];

  const relationship = dynamics.relationshipShift;
  const relationshipDelta = absoluteShift(relationship.trustDelta)
    + absoluteShift(relationship.suspicionDelta)
    + absoluteShift(relationship.dependencyDelta)
    + absoluteShift(relationship.hostilityDelta);
  const reasons: string[] = [];

  if (absoluteShift(dynamics.emotionalShift.intensityDelta) >= 2) {
    reasons.push("감정 강도가 크게 이동");
  }
  if (absoluteShift(dynamics.powerShift.delta) >= 2) {
    reasons.push("권력/정보 우위가 크게 이동");
  }
  if (relationshipDelta >= 2) {
    reasons.push("신뢰/의심/의존 관계가 흔들림");
  }
  if (turn.informationWithheld.length > 0 || dynamics.hiddenIntention.trim().length > 0) {
    reasons.push("겉말과 숨은 의도가 분리됨");
  }
  if (dynamics.targetInterpretations.length > 0) {
    reasons.push("상대 해석과 반응을 장면화할 수 있음");
  }
  if (heat >= 0.82) {
    reasons.unshift("scene spotlight 후보");
  }

  return reasons.length > 0 ? reasons : ["흐름 연결용 normal 박자"];
}

function editorialExpansionPlansForScene(sceneLog: SceneLog): SceneLogEditorialExpansionPlan[] {
  return sceneLog.dialogueTurns.map((turn) => {
    const heat = turnEditorialHeat(turn);
    const renderMode = editorialRenderModeForHeat(heat);
    return SceneLogEditorialExpansionPlanSchema.parse({
      turnId: turn.turnId,
      sourceActionLogIds: turn.sourceActionLogIds,
      editorialHeat: heat,
      renderMode,
      expansionReasons: expansionReasonsForTurn(turn, heat),
      suggestedParagraphs: renderMode === "spotlight" ? 3 : renderMode === "expanded" ? 2 : 1,
    });
  });
}

function expandedTurnIdsForScene(sceneLog: SceneLog): Set<string> {
  const plansByTurnId = new Map(
    editorialExpansionPlansForScene(sceneLog).map((plan) => [plan.turnId, plan]),
  );
  const ranked = sceneLog.dialogueTurns
    .map((turn) => ({ turn, plan: plansByTurnId.get(turn.turnId) }))
    .filter(({ plan }) => plan && plan.renderMode !== "normal")
    .sort((left, right) => {
      const leftHeat = left.plan?.editorialHeat ?? 0;
      const rightHeat = right.plan?.editorialHeat ?? 0;
      if (rightHeat !== leftHeat) return rightHeat - leftHeat;
      return sceneLog.dialogueTurns.indexOf(left.turn) - sceneLog.dialogueTurns.indexOf(right.turn);
    });

  const topHeat = ranked[0]?.plan?.editorialHeat ?? 0;
  const expansionLimit = sceneLog.dialogueTurns.length >= 6 ? 2 : 1;
  const selected: typeof ranked = [];
  const selectedSpeakers = new Set<string>();

  for (const candidate of ranked) {
    const heat = candidate.plan?.editorialHeat ?? 0;
    const isFirst = selected.length === 0;
    const isStrongSecond = heat >= 0.74 || topHeat - heat <= 0.08;
    const addsSpeakerContrast = !selectedSpeakers.has(candidate.turn.speakerId);

    if (isFirst || (selected.length < expansionLimit && isStrongSecond && addsSpeakerContrast)) {
      selected.push(candidate);
      selectedSpeakers.add(candidate.turn.speakerId);
    }
    if (selected.length >= expansionLimit) break;
  }

  return new Set(selected.map(({ turn }) => turn.turnId));
}

function renderEditorialExpansionParagraph(sceneLog: SceneLog, turn: DialogueTurn, index: number): string {
  const dynamics = turn.interactionDynamics;
  if (!dynamics) return "";

  const speaker = shortName(turn.speakerName);
  const listener = turn.listenerNames[0] ? shortName(turn.listenerNames[0]) : "상대";
  const hooks = dynamics.writerHooks;
  const gesture = toRenderableHookBeat(hooks.gesture, speaker, listener, `${turn.turnId}:gesture`);
  const silence = toRenderableHookBeat(hooks.silence, speaker, listener, `${turn.turnId}:silence`);
  const sensoryCue = toRenderableHookBeat(hooks.sensoryCue, speaker, listener, `${turn.turnId}:sensory`);
  const linePurpose = cleanSurfaceText(hooks.linePurpose);
  const targetAfter = cleanSurfaceText(dynamics.emotionalShift.targetAfter ?? "");
  const actorAfter = cleanSurfaceText(dynamics.emotionalShift.actorAfter);
  const axis = powerAxisLabel(dynamics.powerShift.axis);
  const heat = turnEditorialHeat(turn);
  const pressure = pressureBeatCue(sceneLog, turn.turnId);
  const concreteCue = /공기.*한 박자.*(?:무겁|가라앉)|공기가.*가라앉/u.test(sensoryCue)
    ? pick(`${turn.turnId}:concrete-expansion-cue`, [
      "서류 모서리의 그림자가 잠깐 흔들렸다.",
      "테이블 모서리에 닿은 소매 끝이 미세하게 접혔다.",
      "문가의 그림자가 한 뼘 늦게 움직였다.",
      "촛농이 굳어 가는 가장자리에 빛이 걸렸다.",
      "의자 다리 하나가 마른 소리를 남겼다.",
      "봉투의 봉인 끈이 느슨하게 내려앉았다.",
    ])
    : sensoryCue;
  const concreteCueSentence = ensureSentence(concreteCue || "잔 안쪽의 빛이 잠깐 흔들렸다.");
  const purposeAftereffect = linePurposeAftereffect(linePurpose, speaker, listener);
  const reachBeat = pick(`${turn.turnId}:reach-beat`, [
    `${topicName(speaker)} 방금 한 말이 어디까지 닿았는지 확인하듯 ${listener}의 얼굴을 보았다.`,
    `${topicName(speaker)} 말끝이 남긴 자리를 재듯 ${listener} 쪽으로 시선을 올렸다.`,
    `${topicName(speaker)} 대답이 돌아오기 전의 틈을 놓치지 않으려 ${objectPhrase(listener)} 보았다.`,
    `${topicName(speaker)} 한마디를 더 얹지 않고 ${listener}의 반응만 기다렸다.`,
    `${topicName(speaker)} 잔 가장자리에서 손을 거두며 ${listener}의 표정을 살폈다.`,
  ]);
  const targetReactionBeat = targetAfter
    ? pick(`${turn.turnId}:target-after-beat`, [
      `${listener}의 표정에는 ${targetAfter}이 먼저 지나갔다.`,
      `${listener} 쪽에서는 ${targetAfter}이 대답보다 먼저 드러났다.`,
      `${topicName(listener)} 그 말을 듣고 ${targetAfter}을 숨기지 못했다.`,
      `${listener}의 눈가에 ${targetAfter}이 짧게 스쳤다.`,
    ])
    : `${topicName(listener)} 바로 반응하지 않았다.`;
  const variants = [
    [
      gesture ? ensureSentence(gesture) : `${topicName(speaker)} 손끝을 늦게 거두었다.`,
      silence ? ensureSentence(silence) : ensureSentence(lateSilenceBeat(listener, `${turn.turnId}:missing-silence`)),
      `${concreteCueSentence} ${purposeAftereffect}`,
    ],
    [
      `${concreteCueSentence} ${reachBeat}`,
      targetReactionBeat,
      `${topicPhrase(pressure)} 그 짧은 틈에서 방향을 바꾸었다.`,
    ],
    [
      gesture ? ensureSentence(gesture) : `${topicName(speaker)} 자세를 흐트러뜨리지 않았다.`,
      `${axis ? `${subjectPhrase(axis)} 기울어진 순간` : "힘의 방향이 바뀐 순간"}, ${topicPhrase(actorAfter || "닫아 둔 계산")} 더는 완전히 숨겨지지 않았다.`,
      `${topicName(listener)} 그 변화를 들은 척하지 않았지만, 다음 말의 폭은 이미 좁아져 있었다.`,
    ],
    [
      pick(`${turn.turnId}:pressure-remains`, [
        `${topicPhrase(pressure)} 말이 멈춘 뒤에야 더 또렷해졌다.`,
        `${topicPhrase(pressure)} 잔 가장자리의 빛처럼 오래 식지 않았다.`,
        `${pressure} 탓에 대답은 한 박자 늦게 돌아왔다.`,
        `${pressure}의 흔적이 테이블 위에 남았다.`,
      ]),
      silence ? ensureSentence(silence) : `${speaker}와 ${listener} 사이에 짧은 틈이 생겼다.`,
      `${heat >= 0.78 ? "그 틈은 작은 실수가 아니라 다음 수를 바꾸는 신호였다." : "그 틈 뒤로 말의 폭이 조금 좁아졌다."}`,
    ],
  ];

  return (variants[(stableIndex(`${turn.turnId}:editorial-expansion:${index}`, variants.length))] ?? variants[0]!)
    .filter(Boolean)
    .join(" ");
}

function powerAxisLabel(axis: string): string {
  const normalized = cleanSurfaceText(axis);
  if (normalized === "social") return "예법의 무게";
  if (normalized === "information") return "정보의 방향";
  if (normalized === "emotional") return "감정의 균형";
  if (normalized === "access") return "허락의 범위";
  if (normalized === "authority") return "권위의 선";
  return normalized || "힘의 방향";
}

function renderSubtextParagraph(sceneLog: SceneLog): string {
  const names = sceneLog.participantNames.map(shortName);
  const first = names[0] ?? "누군가";
  const second = names[1] ?? "상대";
  const third = sceneLog.participantNames[2];
  const anchor = sceneLog.sensoryAnchors.find((value) => value !== sceneLog.location) ?? "잔";
  const pressureType = pressureCue(sceneLog);
  const titleCue = readerSceneCue(sceneLog);

  const variants = [
    [
      `${first}는 웃지도, 찡그리지도 않았다.`,
      `${second}의 숨이 아주 짧게 멈춘 것을 보았기 때문이다.`,
      third ? `${topicName(third)} 그 사이에서 시선을 낮췄다. ${sceneLog.location}의 ${objectPhrase(pressureType)} 모두가 알고 있었다.` : "그 사이에서 침묵은 또 하나의 대답이 되었다.",
    ],
    [
      `${first}는 대답을 서두르지 않았다.`,
      `${second}이 먼저 시선을 거두는 순간을 놓치지 않았기 때문이다.`,
      third ? `${topicName(third)} ${anchor} 곁에서 장갑 끝을 접었고, 그 작은 움직임이 ${titleCue}의 편을 갈랐다.` : "남은 사람들은 각자 다른 이유로 말을 아꼈다.",
    ],
    [
      `${second}의 말은 부드러웠지만, ${first}는 그 말보다 늦게 움직인 손을 보았다.`,
      third ? `${topicName(third)} 그 틈을 알아차리고도 끼어들지 않았다.` : "끼어들 수 있는 사람은 없었다.",
      `잠깐의 예의가 지나가자, ${titleCue}에는 더 불편한 질서만 남았다.`,
    ],
    [
      `${first}는 ${anchor}에서 손을 떼지 않았다.`,
      `${second}이 말을 고르는 동안, ${topicPhrase(pressureType)} 오히려 더 또렷해졌다.`,
      third ? `${topicName(third)} 그 변화를 보고도 모른 척했다.` : "모른 척하는 쪽이 더 안전했다.",
    ],
    [
      `${second}의 호흡이 한 번 짧아졌고, ${first}는 그 짧은 틈을 기억해 두었다.`,
      third ? `${topicName(third)} ${sceneLog.location}의 가장 조용한 쪽으로 시선을 피했다.` : "남은 침묵이 대답을 대신했다.",
      `${topicPhrase(titleCue)} 아직 끝나지 않았고, 방 안의 순서는 조금 바뀌었다.`,
    ],
  ];

  return (variants[stableIndex(`${sceneLog.sceneId}:subtext`, variants.length)] ?? variants[0]!).join(" ");
}

function renderOutcomeParagraph(sceneLog: SceneLog): string {
  const outcome = hideTechnicalIds(proseOutcomeFromSceneOutcome(sceneLog.sceneOutcome));
  const anchor = sceneLog.sensoryAnchors.find((value) => value !== sceneLog.location) ?? "창빛";
  const pressureType = pressureCue(sceneLog);
  const titleCue = readerSceneCue(sceneLog);
  const variants = [
    `대화는 끝난 것처럼 보였지만, 아무것도 끝나지 않았다. ${ensureSentence(outcome)} 엘리시아는 그 사실을 얼굴에 올리지 않은 채 잔을 내려놓았다. ${topicPhrase(`${titleCue}의 ${pressureType}`)} 아직 식지 않았다.`,
    `말소리가 잦아든 뒤에도 ${sceneLog.location}에는 결과가 남았다. ${ensureSentence(outcome)} 엘리시아는 ${anchor} 쪽으로 잔을 조금 밀어 두었고, 누구도 그 작은 거리를 다시 좁히지 않았다.`,
    `마지막 대답이 사라진 자리에서 방 안의 순서는 조금 바뀌어 있었다. ${ensureSentence(outcome)} ${anchor} 아래 놓인 물건들은 그대로였지만, 같은 자리에 선 사람은 없었다.`,
    `그 장면은 조용히 닫혔다. ${ensureSentence(outcome)} 그러나 닫힌 것은 ${sceneLog.location}의 대화뿐이었고, ${topicPhrase(pressureType)} 다음 사람의 손끝으로 넘어갔다.`,
    `그 자리에 남은 것은 대답이 아니었다. ${ensureSentence(outcome)} 그래서 아무도 먼저 일어나지 못했고, ${anchor} 곁의 정적만 한 번 더 깊어졌다.`,
    `누군가는 이 장면이 끝났다고 믿고 싶어 했다. ${ensureSentence(outcome)} 하지만 ${topicPhrase(`${sceneLog.location}의 ${pressureType}`)} 말이 멈춘 뒤에야 제 모양을 드러냈다.`,
    `${titleCue}의 끝은 선언보다 작은 움직임으로 남았다. ${ensureSentence(outcome)} ${anchor}에 걸린 빛이 한 번 흔들린 뒤에야 사람들은 각자의 표정을 다시 고쳤다.`,
    `누구도 방금의 말을 다시 설명하지 않았다. ${ensureSentence(outcome)} 문가의 기척이 멀어질수록 ${topicPhrase(pressureType)} 더 작고 분명한 흔적으로 남았다.`,
    `마지막 침묵은 예의처럼 보였지만, 이미 다음 장면의 방향을 정하고 있었다. ${ensureSentence(outcome)} ${anchor} 곁의 손들이 같은 속도로 물러나지 못했다.`,
    `그날의 장면은 큰 소리 없이 방향을 틀었다. ${ensureSentence(outcome)} ${sceneLog.location}에 남은 것은 닫힌 문보다 늦게 사라지는 시선들이었다.`,
    `먼저 움직인 사람은 없었다. ${ensureSentence(outcome)} 다만 ${anchor} 아래 놓인 작은 그림자가 전보다 다른 쪽으로 기울어 있었다.`,
    `말은 멎었지만 장면의 무게는 곧장 사라지지 않았다. ${ensureSentence(outcome)} ${topicPhrase(titleCue)} 다음 사람이 들어오기 전까지 낮게 가라앉아 있었다.`,
  ];
  return variants[(stableIndex(`${sceneLog.sceneId}:outcome`, variants.length) + sceneLog.chapter) % variants.length] ?? variants[0]!;
}

function buildTraceComments(sceneLog: SceneLog, dialogueLines: RenderedDialogueLine[]): string[] {
  return [
    `<!-- sceneLogId: ${sceneLog.sceneId} -->`,
    `<!-- sourceEventIds: ${sceneLog.sourceEventIds.join(", ")} -->`,
    `<!-- dialogueTurnIds: ${dialogueLines.map((line) => line.turnId).join(", ")} -->`,
  ];
}

function hasExactTextLeak(text: string, fact: string): boolean {
  const normalizedFact = fact.replace(/\s+/g, " ").trim();
  if (!normalizedFact) return false;
  return text.replace(/\s+/g, " ").includes(normalizedFact);
}

export function validateRenderedScene(params: {
  sceneLog: SceneLog;
  text: string;
  dialogueLines: RenderedDialogueLine[];
}): SceneLogRenderViolation[] {
  const sceneLog = SceneLogSchema.parse(params.sceneLog);
  const text = params.text;
  const dialogueLines = z.array(RenderedDialogueLineSchema).parse(params.dialogueLines);
  const violations: SceneLogRenderViolation[] = [];

  if (!text.trim()) {
    violations.push({
      code: "empty_rendered_text",
      severity: "error",
      message: "렌더링된 본문이 비어 있습니다.",
    });
  }

  const dialogueByTurnId = new Map(dialogueLines.map((line) => [line.turnId, line]));
  for (const turn of sceneLog.dialogueTurns) {
    const line = dialogueByTurnId.get(turn.turnId);
    if (!line) {
      violations.push({
        code: "missing_dialogue_line",
        severity: "error",
        message: `대화 턴 ${turn.turnId}에 대응하는 렌더링 대사가 없습니다.`,
        turnId: turn.turnId,
        sourceEventId: turn.sourceEventId,
      });
      continue;
    }

    if (line.sourceEventId !== turn.sourceEventId || !sceneLog.sourceEventIds.includes(line.sourceEventId)) {
      violations.push({
        code: "missing_source_event",
        severity: "error",
        message: `대화 턴 ${turn.turnId}의 sourceEventId가 SceneLog 원본 사건과 연결되지 않습니다.`,
        turnId: turn.turnId,
        sourceEventId: line.sourceEventId,
      });
    }

    for (const fact of turn.renderableConstraints.forbiddenExplicitFacts) {
      if (hasExactTextLeak(line.utterance, fact) || hasExactTextLeak(text, fact)) {
        violations.push({
          code: "forbidden_fact_leak",
          severity: "error",
          message: `금지된 직접 정보가 본문에 노출되었습니다: ${fact}`,
          turnId: turn.turnId,
          sourceEventId: turn.sourceEventId,
        });
      }
    }
  }

  return violations;
}

export function renderSceneLogToProse(input: SceneLogRenderInput): SceneLogRenderResult {
  const parsed = SceneLogRenderInputSchema.parse(input);
  const sceneLog = parsed.sceneLog;
  const options = SceneLogRenderOptionsSchema.parse(parsed.options ?? {});
  const dialogueLines = sceneLog.dialogueTurns.map(renderDialogueLine);
  const editorialExpansionPlans = editorialExpansionPlansForScene(sceneLog);
  const expandedTurnIds = expandedTurnIdsForScene(sceneLog);
  const dialogueParagraphs = sceneLog.dialogueTurns.flatMap((turn, index) => {
    const line = dialogueLines.find((candidate) => candidate.turnId === turn.turnId);
    const renderedLine = line ?? renderDialogueLine(DialogueTurnSchema.parse(turn));
    const paragraphs = [renderDialogueParagraph(sceneLog, turn, renderedLine, index)];
    if (expandedTurnIds.has(turn.turnId)) {
      paragraphs.push(renderEditorialExpansionParagraph(sceneLog, turn, index));
    }
    return paragraphs;
  });
  const bodyParagraphs = [
    renderOpeningParagraph(sceneLog, parsed.worldBrain),
    renderEmotionalArcParagraph(sceneLog),
    ...dialogueParagraphs,
    renderSubtextParagraph(sceneLog),
    renderOutcomeParagraph(sceneLog),
  ].filter((paragraph) => paragraph.trim().length > 0);

  const sections = [
    ...(options.includeTraceComments ? buildTraceComments(sceneLog, dialogueLines) : []),
    ...(options.includeTitle ? [`# ${sceneLog.chapter}화. ${generatedSceneTitle(sceneLog)}`] : []),
    ...bodyParagraphs,
  ];
  const text = `${cleanRenderedSurfaceText(
    softenRepeatedLocationMentions(sceneLog, maskForbiddenFacts(sceneLog, sections.join("\n\n")))
      .replace(/탐색/gu, "확인"),
  )}\n`;
  const violations = validateRenderedScene({ sceneLog, text, dialogueLines });

  return SceneLogRenderResultSchema.parse({
    text,
    dialogueLines,
    report: {
      sceneId: sceneLog.sceneId,
      chapter: sceneLog.chapter,
      sourceEventIds: sceneLog.sourceEventIds,
      sourceActionLogIds: sceneLog.sourceActionLogIds,
      dialogueLineCount: dialogueLines.length,
      paragraphCount: bodyParagraphs.length,
      actionLogCoverage: sceneLog.sourceActionLogIds.length === 0
        ? 1
        : new Set(dialogueLines.flatMap((line) => line.sourceActionLogIds)).size / sceneLog.sourceActionLogIds.length,
      editorialExpansionCount: expandedTurnIds.size,
      expandedTurnIds: [...expandedTurnIds],
      editorialExpansionPlans,
      violations,
    },
  });
}

export function renderSceneLogsToProse(input: SceneLogBatchRenderInput): SceneLogBatchRenderResult {
  const parsed = SceneLogBatchRenderInputSchema.parse(input);
  const scenes = parsed.sceneLogs.map((sceneLog) =>
    renderSceneLogToProse({
      sceneLog,
      worldBrain: parsed.worldBrain,
      options: parsed.options,
    })
  );
  const violations = scenes.flatMap((scene) => scene.report.violations);

  return SceneLogBatchRenderResultSchema.parse({
    scenes,
    report: {
      sceneCount: parsed.sceneLogs.length,
      renderedChapterCount: scenes.length,
      dialogueLineCount: scenes.reduce((sum, scene) => sum + scene.report.dialogueLineCount, 0),
      paragraphCount: scenes.reduce((sum, scene) => sum + scene.report.paragraphCount, 0),
      violationCount: violations.length,
      errorCount: violations.filter((violation) => violation.severity === "error").length,
      warningCount: violations.filter((violation) => violation.severity === "warning").length,
      chapters: scenes.map((scene) => scene.report),
    },
  });
}
