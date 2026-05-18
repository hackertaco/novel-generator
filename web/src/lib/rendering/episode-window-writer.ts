import { z } from "zod";

import { getAgent } from "@/lib/agents/llm-agent";
import { sanitize } from "@/lib/agents/rule-guard";
import type { TokenUsage } from "@/lib/agents/types";
import { getModelForTier, selectModelTier } from "@/lib/llm/tier";
import type { NovelSeed } from "@/lib/schema/novel";
import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";
import type { WorldBrain } from "@/lib/sim/world-brain";

import { buildEditorialPlan, type EditorialPlan } from "./editorial-planner";
import {
  compressEpisodePromptSource,
  formatCompressedEpisodePromptSource,
} from "./episode-prompt-compressor";
import type { WorldEpisodeWindow } from "./episode-selector";
import { validateNarrativeProse } from "./narrative-prose-validator";
import type { WorldLogEditorialMap } from "./world-log-editorial-map";

const ZERO_USAGE: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
};

const EPISODE_WINDOW_WRITER_SYSTEM = [
  "너는 월드 타임라인 로그에서 선택된 episode window를 독자용 소설 한 편으로 번역하는 렌더러다.",
  "세계관, 사건, 비밀, 인과를 새로 만들지 않는다.",
  "여러 scene이 들어와도 보고서처럼 나열하지 말고 하나의 episode 호흡으로 연결한다.",
  "내부 동기와 비밀은 설명하지 말고 행동, 대사, 침묵, 거리, 감각으로만 보인다.",
  "출력은 소설 본문만 쓴다.",
].join("\n");

export const EpisodeWindowWriterReportSchema = z.object({
  episodeNumber: z.number().int().positive(),
  timelineIndex: z.number().int().nonnegative(),
  model: z.string(),
  promptCharacterCount: z.number().int().nonnegative(),
  outputCharacterCount: z.number().int().nonnegative(),
  sourceSceneCount: z.number().int().nonnegative(),
  sourceActionLogCount: z.number().int().nonnegative(),
  sourceDialogueTurnCount: z.number().int().nonnegative(),
  compression: z.object({
    detailedActionLogCount: z.number().int().nonnegative(),
    summarizedActionLogCount: z.number().int().nonnegative(),
    coveredActionLogRatio: z.number().min(0).max(1),
    promptSourceCharacterCount: z.number().int().nonnegative(),
  }),
  violationCount: z.number().int().nonnegative(),
  violations: z.array(z.string()),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    cost_usd: z.number().nonnegative(),
  }),
});

export interface BuildEpisodeWindowWriterPromptInput {
  seed: NovelSeed;
  worldBrain: WorldBrain;
  episodeWindow: WorldEpisodeWindow;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  editorialPlans?: EditorialPlan[];
  worldLogEditorialMap?: WorldLogEditorialMap;
  previousEpisodeEnding?: string;
  repairContext?: {
    previousDraft: string;
    qaSummary: string;
  };
}

export interface WriteEpisodeWindowNovelInput extends BuildEpisodeWindowWriterPromptInput {
  model?: string;
  maxTokens?: number;
}

export interface EpisodeWindowWriterResult {
  text: string;
  prompt: string;
  report: z.infer<typeof EpisodeWindowWriterReportSchema>;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

function actionLogsForScene(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const sourceIds = new Set(sceneLog.sourceActionLogIds);
  const bySourceIds = actionLogs.filter((log) => sourceIds.has(log.logId));
  if (bySourceIds.length > 0) return bySourceIds;
  return actionLogs.filter((log) => log.chapter === sceneLog.chapter);
}

function sceneLogsForWindow(window: WorldEpisodeWindow, sceneLogs: SceneLog[]): SceneLog[] {
  const sourceSceneIds = new Set(window.sourceSceneIds);
  return sceneLogs.filter((sceneLog) => sourceSceneIds.has(sceneLog.sceneId));
}

function actionLogsForWindow(window: WorldEpisodeWindow, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const sourceActionLogIds = new Set(window.sourceActionLogIds);
  return actionLogs.filter((log) => sourceActionLogIds.has(log.logId));
}

function collectForbiddenFacts(sceneLogs: SceneLog[], actionLogs: CharacterActionLog[]): string[] {
  return compact([
    ...sceneLogs.flatMap((sceneLog) =>
      sceneLog.dialogueTurns.flatMap((turn) => [
        ...turn.informationWithheld,
        ...turn.renderableConstraints.forbiddenExplicitFacts,
      ])
    ),
    ...actionLogs.flatMap((log) => [
      log.privateState.hiddenGoal,
      ...log.privateState.knownFacts.slice(0, 4),
    ]),
  ]).filter((fact) => fact.length >= 4);
}

function maskForbiddenFacts(value: string, forbiddenFacts: string[]): string {
  return forbiddenFacts.reduce((text, fact) => text.split(fact).join("그 일"), value);
}

function stripVoiceSamples(voiceGuidance: string[]): string[] {
  return voiceGuidance
    .filter((line) => !line.includes("\"") && !line.includes("'"))
    .slice(0, 3);
}

function formatEpisodeWindow(window: WorldEpisodeWindow): string {
  return [
    `episodeNumber: ${window.episodeNumber}`,
    `timelineIndex: ${window.timelineIndex}`,
    `timelineRange: ch${window.startChapter}~ch${window.endChapter}`,
    `selectionScore: ${window.selectionScore}`,
    `sourceSceneIds: ${window.sourceSceneIds.join(", ")}`,
    `sourceActionLogIds: ${window.sourceActionLogIds.join(", ")}`,
    `primaryCharacterIds: ${window.primaryCharacterIds.join(", ")}`,
    `선택 이유: ${window.selectionReasons.join(" / ")}`,
    `편집 의도: ${window.editorialIntent}`,
  ].join("\n");
}

function formatTreatmentPolicy(map: WorldLogEditorialMap | undefined, sceneLogs: SceneLog[]): string {
  const decisionsBySceneId = new Map((map?.chapters ?? []).map((chapter) => [chapter.sceneId, chapter]));
  const lines = sceneLogs.map((sceneLog) => {
    const decision = decisionsBySceneId.get(sceneLog.sceneId);
    if (!decision) {
      return `- ${sceneLog.sceneId}: normal / 내부 beat plan 기준`;
    }
    return `- ${sceneLog.sceneId}: ${decision.narrativeTreatment}, ${decision.suggestedWordBudget}자`;
  });

  return [
    `처리: full_scene=길게, expanded_scene=대사/반응 확장, compressed_scene=원인/결과만 짧게, summary_bridge=연결.`,
    ...lines,
  ].join("\n");
}

function formatCast(sceneLogs: SceneLog[], worldBrain: WorldBrain, safe: (value: string) => string): string {
  const characterIds = Array.from(new Set(sceneLogs.flatMap((sceneLog) => sceneLog.participantIds)));
  return characterIds
    .map((characterId) => worldBrain.characterMinds[characterId])
    .filter(Boolean)
    .map((mind) => [
      `- ${mind.name} (${mind.role})`,
      `  말투: ${stripVoiceSamples(mind.voiceRules).map(safe).join(" / ") || "장면 로그의 대사 후보 우선"}`,
    ].join("\n"))
    .join("\n");
}

function validationLines(text: string, forbiddenFacts: string[]): string[] {
  return validateNarrativeProse({ text, forbiddenFacts }).violations
    .map((violation) => `${violation.ruleId}: ${violation.message} 예문="${violation.excerpt}"`);
}

function shortenCastNames(text: string): string {
  return removeSurfacePolishResidue(text
    .replace(/엘리시아 크레센트/g, "엘리시아")
    .replace(/세레나 크레센트/g, "세레나")
    .replace(/카이젠 아우레아/g, "카이젠")
    .replace(/라엘 아우레아/g, "라엘")
    .replace(/([가-힣]+)은\/는/g, "$1은")
    .replace(/([가-힣]+)이\/가/g, "$1이")
    .replace(/([가-힣]+)을\/를/g, "$1을")
    .replace(/엘리시아은/g, "엘리시아는")
    .replace(/세레나은/g, "세레나는")
    .replace(/카이젠는/g, "카이젠은")
    .replace(/카이젠가/g, "카이젠이")
    .replace(/라엘는/g, "라엘은")
    .replace(/라엘가/g, "라엘이")
    .replace(/마리안가/g, "마리안이")
    .replace(/다음 반응을 준비한다/g, "시선을 거두지 않았다")
    .replace(/낮게 끊겼다/g, "짧게 멎었다")
    .replace(/잔 받침 소리으로/g, "잔 받침이 낮게 울리며")
    .replace(/말끝였다/g, "말끝이었다"));
}

function removeSurfacePolishResidue(text: string): string {
  return text
    .replace(/[^.。\n]{0,25}공기(?:는|가)?[^.。\n]{0,25}(?:가라앉|내려앉)[^.。\n]*[.。]?/gu, "은잔 가장자리에 물기가 맺혔다.")
    .replace(/침묵(?:은|이)?[^.。\n]{0,40}(?:깊어|이어|남|흐르|고조|탐색|의미)[^.。\n]*[.。]?/gu, "잔이 받침에 닿았다.")
    .replace(/다음\s*움직임을\s*움직임(?:하기|해야 했다|해야만 했다)?/gu, "문고리를 쥐어야 했다")
    .replace(/다음\s*움직임을\s*움직[^\s.。\n]*/gu, "문고리를 쥐었다")
    .replace(/다음\s*움직임을\s*준비[^\s.。\n]*/gu, "문고리를 쥐었다")
    .replace(/다음\s*움직임을\s*기다[^\s.。\n]*/gu, "잔을 내려놓았다")
    .replace(/다음\s*순간을\s*준비[^\s.。\n]*/gu, "문고리를 쥐었다")
    .replace(/다음\s*말을\s*준비[^\s.。\n]*/gu, "잔을 내려놓았다")
    .replace(/다음\s*순간/gu, "그때")
    .replace(/어떤\s*선택을\s*하실\s*건가요[?？]?/gu, "대답은 지금 듣겠습니다.")
    .replace(/어떻게\s*생각하나요[?？]?/gu, "문을 열어 두겠습니다.")
    .replace(/시선을\s*한\s*번에\s*모아\s*받[^\s.。\n]*/gu, "시선을 피하지 않았다")
    .replace(/탐색했다/gu, "살폈다")
    .replace(/탐색하는/gu, "살피는")
    .replace(/탐색/gu, "살핌")
    .replace(/움직임을\s*움직[^\s.。\n]*/gu, "한 걸음 나섰다")
    .replace(/움직임하기/gu, "움직이기")
    .replace(/다음\s*움직임/gu, "다음 말")
    .replace(/잔\s*받침\s*소리(?:은|는|이|가|을|를|로|만)?/gu, "잔 받침")
    .replace(/얇은\s*의미/gu, "짧은 정적")
    .replace(/짧은\s*정적를/gu, "짧은 정적을")
    .replace(/짧은\s*정적가/gu, "짧은 정적이")
    .replace(/말밑를/gu, "말끝을")
    .replace(/말밑가/gu, "말끝이")
    .replace(/말밑은/gu, "말끝은")
    .replace(/말밑을/gu, "말끝을")
    .replace(/말끝가/gu, "말끝이")
    .replace(/말끝를/gu, "말끝을")
    .replace(/소리은/gu, "소리는")
    .replace(/소리을/gu, "소리를");
}

export function polishGenreSurface(text: string): string {
  return removeSurfacePolishResidue(text
    .replace(/그 안에 숨겨진 의도가 느껴졌다/g, "말끝이 한 박자 늦게 떨어졌다")
    .replace(/그 속에 숨겨진 의도를 읽어내기엔 어려웠다/g, "말끝의 빈틈은 쉽게 잡히지 않았다")
    .replace(/그 속에 숨겨진 의도를 감지했다/g, "그 말끝의 빈틈을 놓치지 않았다")
    .replace(/칼날이 숨겨져 있었다/g, "칼날처럼 닫혔다")
    .replace(/감춰진 무언가/g, "닫힌 말끝")
    .replace(/감춰진 진지함/g, "낮게 가라앉은 시선")
    .replace(/그 속에 감춰진 본성을 감지했다/g, "그 미소가 한 박자 늦게 닫히는 것을 보았다")
    .replace(/감춰진 말밑/g, "닫힌 말끝")
    .replace(/감지했다/g, "보았다")
    .replace(/감춰둔 생각/g, "닫아 둔 말끝")
    .replace(/무언가를 감추려는 듯한 기색/g, "말끝을 닫는 기색")
    .replace(/그 안에 숨겨진 날카로움/g, "그 말끝의 얇은 날")
    .replace(/경계심이 숨겨져 있었다/g, "시선이 날카롭게 멈췄다")
    .replace(/숨겨져 있었다/g, "잔 가장자리에 걸려 있었다")
    .replace(/그 속에 감춰진 무게는 분명했다/g, "말끝이 낮게 닫혔다")
    .replace(/그 안에 감춰진 말끝/g, "그 말끝")
    .replace(/어떤 의미가 숨겨져 있는지 망설임하지 않았다/g, "말끝을 오래 끌지 않았다")
    .replace(/그 안에는 은근한 도전이 스며 있었다/g, "찻잔 가장자리에서 손톱이 한 번 멈췄다")
    .replace(/그 안에 숨겨진 단호함이 ([^.。\n]+?)를 겨냥했다/g, "말끝의 얇은 날이 $1 쪽으로 향했다")
    .replace(/그 안에 숨겨진 무언가가 [^.。\n]+/g, "말끝이 한 박자 늦게 닫혔다")
    .replace(/그 안에 깃든 의도는 명확했다/g, "찻잔 가장자리의 손끝이 멈췄다")
    .replace(/그 안에는 미묘한 압박이 담겨 있었다/g, "말끝이 낮게 눌렸다")
    .replace(/그 안에 담긴 무게가 ([^.。\n]+?)를 다시금 압박했다/g, "말끝이 $1의 잔 받침을 짧게 울렸다")
    .replace(/그 안에 담긴 진심은 또렷했다/g, "손을 거두지 못한 채 시선만 흔들렸다")
    .replace(/그 속에 담긴 냉소는 [^.。\n]+/g, "말끝이 차갑게 닫혔다")
    .replace(/그 속에 담긴 의도는 [^.。\n]+/g, "말끝의 빈틈은 쉽게 닫히지 않았다")
    .replace(/그 속에는 무언가 다른 의미가 담겨 있는 듯했다/g, "그 말끝은 가볍게 닫히지 않았다")
    .replace(/숨은 의도를 가늠하려는 듯/g, "말끝을 붙드는 듯")
    .replace(/의도가 엿보였다/g, "말끝이 한 박자 늦게 닫혔다")
    .replace(/진의를 파악하려 했다/g, "눈꺼풀을 천천히 내렸다")
    .replace(/비밀을 파헤치려는 듯했다/g, "시선을 오래 거두지 않았다")
    .replace(/의미를 파악하고 있었다/g, "끝나지 않은 말에 시선을 세웠다")
    .replace(/자신이 해야 할 일을 명확히 알고 있었다/g, "은잔을 밀었다")
    .replace(/다음 행동을 준비했다/g, "소매 안쪽에 손을 숨겼다")
    .replace(/다음 행동을 기다리는 듯했다/g, "문턱 앞에 멈췄다")
    .replace(/다음 행동을 준비하고 있었다/g, "문고리를 쥐었다")
    .replace(/다음 행동을 준비해야 했다/g, "문고리를 쥐어야 했다")
    .replace(/다음에 해야 할 일을 머릿속에 그렸다/g, "문고리를 쥐었다")
    .replace(/더 깊은 생각에 잠겨 있는 듯했다/g, "은잔 가장자리에 시선을 고정했다")
    .replace(/당신이 결정해야 할 문제죠/g, "이제 당신 차례죠")
    .replace(/선택을 요구하는 무언의 압력이 있었다/g, "한 걸음 앞으로 밀어붙였다")
    .replace(/기대감이 담겨 있었다/g, "시선이 떨어지지 않았다")
    .replace(/기대가 서려 있었다/g, "시선이 떨어지지 않았다")
    .replace(/감춰진 의미/g, "늦게 닫힌 말끝")
    .replace(/은근한 긴장이 묻어 있었다/g, "잔 받침이 짧게 울렸다")
    .replace(/그가 원하는 것이 무엇인지 알고 있었다/g, "그의 시선이 문 쪽으로 먼저 움직이는 것을 보았다")
    .replace(/움직일 때가 되었음을 직감했다/g, "문 쪽으로 먼저 발끝을 돌렸다")
    .replace(/확고한 무엇인가가/g, "짧은 발소리가")
    .replace(/확신이 있었다/g, "발끝이 멈추지 않았다")
    .replace(/자신의 생각을 숨기며/g, "시선을 내리깐 채")
    .replace(/곰곰이 생각했다/g, "잔 가장자리를 엄지로 눌렀다")
    .replace(/예견하며/g, "앞질러 보며")
    .replace(/다음에 어떤 말을 해야 할지 생각했다/g, "잔 가장자리를 엄지로 눌렀다")
    .replace(/대답을 준비하기 시작했다/g, "문 쪽으로 시선을 옮겼다")
    .replace(/다음 행동을 움직여야 했다/g, "문고리를 쥐어야 했다")
    .replace(/다음 행동을 움직여야만 했다/g, "문고리를 쥐어야만 했다")
    .replace(/이제는 움직여야 할 때임을 깨달았다/g, "소매 안쪽에 손을 넣었다")
    .replace(/깨달았다/g, "눈을 들었다")
    .replace(/머릿속을 맴돌았다/g, "귓가에 남았다")
    .replace(/주저 없이 움직임을 내리고/g, "주저 없이 한 걸음 나서고")
    .replace(/움직임을 내리고/g, "한 걸음 나서고")
    .replace(/모든 것이 그녀의 손에 달려 있었다/g, "은잔이 그녀의 손 안에서 차갑게 식었다")
    .replace(/무언의 잔 받침 소리은/g, "말없는 잔 받침 소리는")
    .replace(/무언의/g, "말없는")
    .replace(/다음 움직임이 정해져 있었다/g, "발끝이 문 쪽으로 돌아섰다")
    .replace(/다음 행동이 모든 것을 움직일 것이었다/g, "은잔이 받침 위에서 낮게 밀렸다")
    .replace(/다음에 어떤 행동을 할지 기다리고 있었다/g, "잔 가장자리에서 시선을 거두지 않았다")
    .replace(/다음에 어떤 말을 할지 기다렸다/g, "말끝을 기다리며 잔을 내려놓았다")
    .replace(/다음 행동을 망설임했다/g, "잔 가장자리에 손끝을 멈췄다")
    .replace(/망설임하기 시작했다/g, "숨을 낮게 끊었다")
    .replace(/망설임하지 않았다/g, "오래 끌지 않았다")
    .replace(/생각에 잠긴 듯/g, "말을 고르듯")
    .replace(/다음 행동/g, "다음 말")
    .replace(/망설임하듯/g, "잠시")
    .replace(/망설임했다/g, "멈췄다")
    .replace(/마음을 다잡았다/g, "숨을 낮게 끊었다")
    .replace(/움직임할/g, "움직일")
    .replace(/움직임을 내려야 했다/g, "잔을 들어야 했다")
    .replace(/당신이 움직임할 일입니다/g, "당신이 직접 움직일 일입니다")
    .replace(/잔 받침 소리로 다가왔다/g, "잔 받침을 낮게 울렸다")
    .replace(/또 다른 잔 받침 소리로 다가왔다/g, "잔 받침을 다시 낮게 울렸다")
    .replace(/얇은 날카로운 말끝/g, "얇은 말끝")
    .replace(/무언가를 요구하는 강한 의지가 숨어 있었다/g, "잔 가장자리를 누르는 힘이 남았다")
    .replace(/말끝을 붙들려고 애썼지만/g, "찻잔 가장자리에 시선을 고정했지만")
    .replace(/본능적으로 알았다/g, "잔을 조금 더 높이 들었다")
    .replace(/직감했다/g, "손끝을 멈췄다")
    .replace(/그가 원하는 것이 무엇인지 알 수 있었다/g, "그의 시선이 문 쪽으로 먼저 움직이는 것을 보았다")
    .replace(/그가 원하는 대답을 찾고 있었다/g, "그의 잔 가장자리에 머문 손끝을 보았다")
    .replace(/숨겨진 의도를 읽어내려 했다/g, "말끝을 오래 붙들었다")
    .replace(/의도를 읽어내려 했다/g, "말끝을 오래 붙들었다")
    .replace(/의도를 파악하려 애썼다/g, "말끝을 오래 붙들었다")
    .replace(/의도를 파악했다/g, "말끝을 붙들었다")
    .replace(/압박감을? 느꼈다/g, "잔 받침이 손끝 아래서 짧게 밀렸다")
    .replace(/긴장감이 방 안을 감돌았다/g, "잔 받침이 작게 울렸다")
    .replace(/긴장감이 더욱 짙어졌다/g, "말소리가 한 박자 끊겼다")
    .replace(/긴장감은 뚜렷했다/g, "침묵이 한 치 더 가까워졌다")
    .replace(/긴장감이 감도는 방 안에서/g, "낮은 정적만 남은 방 안에서")
    .replace(/긴장감/g, "짧은 정적")
    .replace(/결단을 내리기 위해 한 걸음 앞으로 나아갔다/g, "한 걸음 앞으로 나가 문고리에 손을 올렸다")
    .replace(/한 걸음 앞으로 나아가기로 결심했다/g, "한 걸음 앞으로 나가 은잔을 밀었다")
    .replace(/결단을 기다리며/g, "다음 말을 기다리며")
    .replace(/결단이 담겨 있었다/g, "말끝이 짧게 닫혔다")
    .replace(/결단을 인정하는 듯했다/g, "고개를 천천히 끄덕였다")
    .replace(/결단/g, "굳힌 태도")
    .replace(/선택의 순간/g, "잔이 식는 순간")
    .replace(/마음속/g, "침묵 아래")
    .replace(/운명을 바꿀/g, "되돌릴 수 없는")
    .replace(/다음 행동을 고민하기 시작했다/g, "문 쪽으로 시선을 옮겼다")
    .replace(/다음에 해야 할 일을 생각하며/g, "손끝으로 은잔을 밀며")
    .replace(/다음 행동을 결정해야 할 순간이 다가오고 있음을 알아차렸다/g, "손끝이 잔 받침을 밀어낼 차례가 왔다")
    .replace(/다음에 해야 할 대응을 준비하고 있었다/g, "잔 받침을 엄지로 눌렀다")
    .replace(/생각에 잠겼다/g, "시선을 내렸다")
    .replace(/순간을 기다렸다/g, "손을 소매 안쪽에 숨겼다")
    .replace(/잔 받침 소리이/g, "얇은 기척이")
    .replace(/잔 받침 소리을/g, "잔 받침 소리를")
    .replace(/고민해야/g, "정해야")
    .replace(/고민/g, "망설임")
    .replace(/의도를/g, "말끝을")
    .replace(/의도가/g, "말끝이")
    .replace(/의도는/g, "말끝은")
    .replace(/의도/g, "말끝")
    .replace(/진의/g, "속뜻")
    .replace(/파악하려/g, "붙들려")
    .replace(/숨겨진/g, "얇은")
    .replace(/숨은/g, "말하지 않은")
    .replace(/그 안에 담긴/g, "말끝에 남은")
    .replace(/담긴/g, "남은")
    .replace(/무엇을 꾀하는지 붙들려 했다/g, "손끝이 멈춘 이유를 따라갔다")
    .replace(/말끝에 남은 말끝은/g, "말끝은")
    .replace(/말밑를/g, "말밑을")
    .replace(/기다렸다\. 이제 ([^.\n]+?)가 움직일 차례였다\./g, "한 걸음 물러나 문 쪽을 열었다.")
    .replace(/움직일 차례였다/g, "문고리를 쥘 차례였다")
    .replace(/결심/g, "굳힌 시선")
    .replace(/결정해야/g, "정해야")
    .replace(/결정/g, "선택")
    .replace(/압박/g, "좁아진 거리")
    .replace(/기대감/g, "떨어지지 않는 시선")
    .replace(/느껴졌다/g, "남았다")
    .replace(/느꼈다/g, "알아차렸다"));
}

export function buildEpisodeWindowWriterPrompt(input: BuildEpisodeWindowWriterPromptInput): string {
  const selectedSceneLogs = sceneLogsForWindow(input.episodeWindow, input.sceneLogs);
  const selectedActionLogs = actionLogsForWindow(input.episodeWindow, input.actionLogs);
  const forbiddenFacts = collectForbiddenFacts(selectedSceneLogs, selectedActionLogs);
  const safe = (value: string): string => maskForbiddenFacts(value, forbiddenFacts);
  const editorialPlansBySceneId = new Map(
    (input.editorialPlans ?? []).map((plan) => [plan.sceneId, plan]),
  );
  const editorialPlans = selectedSceneLogs.map((sceneLog) => {
    const sceneActionLogs = actionLogsForScene(sceneLog, selectedActionLogs);
    return editorialPlansBySceneId.get(sceneLog.sceneId)
      ?? buildEditorialPlan({ sceneLog, actionLogs: sceneActionLogs });
  });
  const compressedSource = compressEpisodePromptSource({
    episodeWindow: input.episodeWindow,
    sceneLogs: selectedSceneLogs,
    actionLogs: selectedActionLogs,
    editorialPlans,
    worldLogEditorialMap: input.worldLogEditorialMap,
    safe,
  });
  const totalBudget = selectedSceneLogs.reduce((sum, sceneLog) => {
    const worldDecision = input.worldLogEditorialMap?.chapters.find((chapter) =>
      chapter.sceneId === sceneLog.sceneId
    );
    if (worldDecision) return sum + worldDecision.suggestedWordBudget;
    const sceneActionLogs = actionLogsForScene(sceneLog, selectedActionLogs);
    const plan = editorialPlansBySceneId.get(sceneLog.sceneId)
      ?? buildEditorialPlan({ sceneLog, actionLogs: sceneActionLogs });
    return sum + plan.totalSuggestedWordBudget;
  }, 0);
  const targetCharacters = Math.max(1800, Math.min(6000, totalBudget));

  return [
    `# 임무`,
    `${input.seed.title}의 월드 타임라인에서 선택된 episode window 하나를 소설 본문 한 편으로 쓴다.`,
    `이 입력은 chapter가 아니라 timeline에서 뽑은 window다. 여러 scene이 들어오면 하나의 episode 호흡으로 이어 붙인다.`,
    ``,
    `# EpisodeWindow`,
    safe(formatEpisodeWindow(input.episodeWindow)),
    ``,
    input.previousEpisodeEnding
      ? [`# 직전 episode 끝`, safe(polishGenreSurface(input.previousEpisodeEnding)), `반복하지 말고 끊긴 행동 직후부터 이어 쓴다.`].join("\n")
      : "",
    ``,
    input.repairContext
      ? [
          `# QA repair context`,
          `이전 초안은 아래 QA를 통과하지 못했다. 사건/인과/비밀은 유지하되 문장은 다시 쓴다.`,
          `이전 초안 문장을 재사용하지 않는다.`,
          `QA evidence 단어/표현은 본문에 한 번도 쓰지 않는다.`,
          `QA: ${safe(input.repairContext.qaSummary)}`,
          ``,
          `## 이전 초안`,
          safe(polishGenreSurface(input.repairContext.previousDraft)),
        ].join("\n")
      : "",
    ``,
    `# 등장인물 말투`,
    formatCast(selectedSceneLogs, input.worldBrain, safe) || "- 없음",
    ``,
    `# Compressed Source Bundle`,
    `아래 sourceActionLogId는 모두 근거 색인이다. 본문에는 ID를 절대 노출하지 않는다.`,
    `Detailed Beats는 길게 장면화하고, Summary Beats는 원인/결과가 보이도록 짧게 접는다.`,
    ``,
    `# World Log Editorial Treatment`,
    formatTreatmentPolicy(input.worldLogEditorialMap, selectedSceneLogs),
    ``,
    `# Treatment contract`,
    `full_scene은 길게, expanded_scene은 핵심 대사/반응 중심, compressed_scene은 원인/결과만 짧게, summary_bridge는 한 단락 연결로 처리한다.`,
    formatCompressedEpisodePromptSource(compressedSource),
    ``,
    `# coverage contract`,
    `- Detailed Beat마다 actor 행동/대사/침묵을 둔다.`,
    `- Summary Beat도 actor 별칭과 결과 압력을 남긴다.`,
    `- 원인 행동과 상대 반응은 지우지 않는다.`,
    `- 단일 scene도 요약 금지: 8문단, 대사8, turn5 이상.`,
    ``,
    `# good genre fiction contract`,
    `- 욕망/방해/우위 반전을 행동으로 보인다.`,
    `- 각 문단은 새 정보/거절/거래/물건 이동/거리 변화/공개 망신/출입 차단 중 하나로 상태를 바꿔야 한다.`,
    `- 시선/침묵/다음 움직임만 돌면 가짜 소설이다.`,
    `- "느꼈다", "고민했다", "의도를 파악했다", "결단했다", "선택의 순간", "마음속" 같은 해설 금지.`,
    `- 대사는 설명이 아니라 압박/회피/거래/경고여야 한다.`,
    `- 빈 대사 금지: "어떤 선택을 하실 건가요?", "어떻게 생각하나요?", "더 말하지 않겠습니다".`,
    `- 3~5문단마다 turn을 둔다. 정보/거절/물건/거리 변화로 압력을 바꾼다.`,
    `- 끝은 고민/기다림이 아니라 지금 해야 하는 구체 행동으로 닫는다.`,
    ``,
    `# surface blacklist`,
    `본문 금지: 느꼈다, 느껴졌다, 고민, 의도를 파악, 결단, 선택의 순간, 마음속, 긴장감, 압박감, 공기가 가라앉았다, 공기가 무겁게 내려앉았다, 침묵이 깊어졌다, 다음 순간, 다음 말을 준비, 다음 움직임, 얇은 의미, 시선을 모아 받았다.`,
    `빈 질문 금지: "어떤 선택을 하실 건가요?", "어떻게 생각하나요?", "더 말하지 않겠습니다".`,
    `같은 뜻은 물건/몸/대사로 바꾼다.`,
    ``,
    `# scene seam contract`,
    `- scene 경계를 "그 아침이 지나고", "그리고 [장소]", "장소만 바뀌었을 뿐"처럼 설명하지 않는다.`,
    `- 장소 전환은 문을 여는 손, 물건, 따라붙은 시선, 끊긴 대사의 다음 호흡으로 시작한다.`,
    ``,
    `# episode 구성 규칙`,
    `1. scene id 순서를 유지하되, scene 경계는 독자가 못 느끼게 자연스럽게 잇는다.`,
    `2. scene의 setup/escalation/inflection/fallout은 episode 호흡으로 재배치한다.`,
    `3. spotlight 로그는 길게, summary 로그는 짧게 처리한다.`,
    `4. action log는 행동/대사/침묵/감각 중 하나로 나타나야 한다.`,
    `5. 관계 변화는 수치 대신 거리, 호칭, 말 끊김, 손동작으로 보인다.`,
    `6. 새 사건, 새 단서, 새 비밀, 새 능력, 새 인과를 추가하지 않는다.`,
    ``,
    `# 금지`,
    `- 내부 ID, source id, action log, scene id, roleMission, agentRole 같은 메타어 노출 금지.`,
    `- 마음속, 의도, 숨겨진, 진심, 계산, 결심, 깨달음, 긴장감 같은 해설어 금지.`,
    `- 비공개 사실/숨은 목표 직접 설명 금지.`,
    ``,
    `# 출력`,
    `- 소설 본문만.`,
    `- 권장 분량: ${targetCharacters}자, 하한 ${Math.floor(targetCharacters * 0.85)}자. 8문단/대사8/감각·행동14 이상.`,
    `- 끝은 설명이 아니라 다음 행동을 부르는 압력으로 닫는다.`,
  ].filter((section) => section.trim().length > 0).join("\n\n");
}

export async function writeEpisodeWindowNovel(
  input: WriteEpisodeWindowNovelInput,
): Promise<EpisodeWindowWriterResult> {
  const selectedSceneLogs = sceneLogsForWindow(input.episodeWindow, input.sceneLogs);
  const selectedActionLogs = actionLogsForWindow(input.episodeWindow, input.actionLogs);
  const prompt = buildEpisodeWindowWriterPrompt(input);
  const editorialPlansBySceneId = new Map(
    (input.editorialPlans ?? []).map((plan) => [plan.sceneId, plan]),
  );
  const editorialPlans = selectedSceneLogs.map((sceneLog) => {
    const sceneActionLogs = actionLogsForScene(sceneLog, selectedActionLogs);
    return editorialPlansBySceneId.get(sceneLog.sceneId)
      ?? buildEditorialPlan({ sceneLog, actionLogs: sceneActionLogs });
  });
  const compression = compressEpisodePromptSource({
    episodeWindow: input.episodeWindow,
    sceneLogs: selectedSceneLogs,
    actionLogs: selectedActionLogs,
    editorialPlans,
    worldLogEditorialMap: input.worldLogEditorialMap,
    safe: (value) => value,
  }).diagnostics;
  const model = input.model
    ?? process.env.NOVEL_EPISODE_WRITER_MODEL
    ?? process.env.NOVEL_WRITER_MODEL
    ?? getModelForTier(selectModelTier(input.seed, input.episodeWindow.startChapter));
  const result = await getAgent().call({
    prompt,
    system: EPISODE_WINDOW_WRITER_SYSTEM,
    model,
    temperature: 0.55,
    maxTokens: input.maxTokens ?? 12000,
    taskId: `episode-window-writer-${input.episodeWindow.episodeNumber}`,
  });
  const text = shortenCastNames(polishGenreSurface(sanitize(result.data))).trim();
  const forbiddenFacts = collectForbiddenFacts(selectedSceneLogs, selectedActionLogs);
  const violations = validationLines(text, forbiddenFacts);

  return {
    text: `${text}\n`,
    prompt,
    report: EpisodeWindowWriterReportSchema.parse({
      episodeNumber: input.episodeWindow.episodeNumber,
      timelineIndex: input.episodeWindow.timelineIndex,
      model: result.model,
      promptCharacterCount: prompt.length,
      outputCharacterCount: text.length,
      sourceSceneCount: selectedSceneLogs.length,
      sourceActionLogCount: selectedActionLogs.length,
      sourceDialogueTurnCount: selectedSceneLogs.reduce((sum, sceneLog) =>
        sum + sceneLog.dialogueTurns.length, 0),
      compression: {
        detailedActionLogCount: compression.detailedActionLogCount,
        summarizedActionLogCount: compression.summarizedActionLogCount,
        coveredActionLogRatio: compression.coveredActionLogRatio,
        promptSourceCharacterCount: compression.promptSourceCharacterCount,
      },
      violationCount: violations.length,
      violations,
      usage: result.usage ?? ZERO_USAGE,
    }),
  };
}
