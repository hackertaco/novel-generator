import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { DialogueTurn, SceneLog } from "@/lib/sim/scene-log";

import type { WorldEpisodeWindow } from "./episode-selector";
import type { WorldLogEditorialMap, WorldLogSceneEditorialDecision } from "./world-log-editorial-map";

export const EpisodeDraftRenderReportSchema = z.object({
  episodeNumber: z.number().int().positive(),
  sourceSceneCount: z.number().int().nonnegative(),
  sourceActionLogCount: z.number().int().nonnegative(),
  renderedActionLogCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  dialogueLineCount: z.number().int().nonnegative(),
  outputCharacterCount: z.number().int().nonnegative(),
  sourceActionLogCoverage: z.number().min(0).max(1),
  treatments: z.array(z.object({
    sceneId: z.string(),
    narrativeTreatment: z.string(),
    suggestedWordBudget: z.number().int().positive(),
  })),
});

export interface RenderEpisodeDraftFromWorldLogInput {
  episodeWindow: WorldEpisodeWindow;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  worldLogEditorialMap?: WorldLogEditorialMap;
}

export interface EpisodeDraftRenderResult {
  text: string;
  report: z.infer<typeof EpisodeDraftRenderReportSchema>;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

function truncate(value: string, maxLength: number): string {
  const cleaned = value.trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function hasFinalConsonant(value: string): boolean {
  const char = Array.from(value.trim()).at(-1);
  if (!char) return false;
  const code = char.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

function topic(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "은" : "는"}`;
}

function shortName(name: string): string {
  return name
    .replace(/엘리시아 크레센트/g, "엘리시아")
    .replace(/세레나 크레센트/g, "세레나")
    .replace(/카이젠 아우레아/g, "카이젠")
    .replace(/라엘 아우레아/g, "라엘");
}

function cleanProse(value: string): string {
  return value
    .replace(/엘리시아 크레센트/gu, "엘리시아")
    .replace(/세레나 크레센트/gu, "세레나")
    .replace(/카이젠 아우레아/gu, "카이젠")
    .replace(/라엘 아우레아/gu, "라엘")
    .replace(/크레센트 공작가/gu, "공작가")
    .replace(/공작가 응접실/gu, "응접실")
    .replace(/공작가 문서 보관실/gu, "문서 보관실")
    .replace(/공작가 하인 통로/gu, "하인 통로")
    .replace(/\[(?:plant|hint|reveal)\]\s*[a-z0-9_:-]+[^—\n]*—\s*/giu, "")
    .replace(/\bfs_[a-z0-9_:-]+\b/giu, "은빛 단서")
    .replace(/\[pressure:[^\]]+\]/gu, "")
    .replace(/\([^)]*근거:[^)]*\)/gu, "")
    .replace(/관찰 단서:\s*/gu, "")
    .replace(/월드 조건:\s*/gu, "")
    .replace(/직전 follow-up pressure:\s*/gu, "")
    .replace(/은\/는/gu, "은")
    .replace(/이\/가/gu, "이")
    .replace(/을\/를/gu, "을")
    .replace(/해야 한다/gu, "해야 했다")
    .replace(/선택해야 했다/gu, "선택을 미뤘다")
    .replace(/준비해야 했다/gu, "손끝을 멈췄다")
    .replace(/의도를 역으로 읽을 수 있다/gu, "말끝을 다시 헤아렸다")
    .replace(/의도/gu, "말끝")
    .replace(/숨겨진|숨은/gu, "말하지 않은")
    .replace(/결심/gu, "굳힌 시선")
    .replace(/굳힌 시선한다/gu, "시선을 굳혔다")
    .replace(/복수를 시선을 굳혔다/gu, "복수의 방향을 정했다")
    .replace(/결정/gu, "선택")
    .replace(/압박/gu, "좁아진 거리")
    .replace(/긴장감/gu, "짧은 정적")
    .replace(/마음속/gu, "침묵 아래")
    .replace(/머릿속/gu, "침묵 아래")
    .replace(/다음 행동/gu, "다음 말")
    .replace(/다음 움직임/gu, "다음 말")
    .replace(/움직임을 움직/gu, "한 걸음 움직")
    .replace(/공기가 가라앉았다/gu, "잔 가장자리의 물기가 식었다")
    .replace(/공기가 무겁게 내려앉았다/gu, "잔 가장자리의 물기가 식었다")
    .replace(/침묵이 깊어졌다/gu, "잔이 받침에 닿았다")
    .replace(/다음 순간/gu, "그때")
    .replace(/얇은 의미/gu, "짧은 정적")
    .replace(/잔 받침 소리/gu, "잔 받침")
    .replace(/향 냄새/gu, "향")
    .replace(/침묵을 증거처럼 남/gu, "말끝을 낮게 남")
    .replace(/빈틈을/gu, "틈을")
    .replace(/움직임만 좇는다/gu, "시선을 좇는다")
    .replace(/이름 하나를$/gu, "이름 하나를 붙잡고")
    .replace(/소리은/gu, "소리는")
    .replace(/말끝가/gu, "말끝이")
    .replace(/엘리시아은/gu, "엘리시아는")
    .replace(/엘리시아을/gu, "엘리시아를")
    .replace(/엘리시아과/gu, "엘리시아와")
    .replace(/세레나은/gu, "세레나는")
    .replace(/세레나을/gu, "세레나를")
    .replace(/세레나과/gu, "세레나와")
    .replace(/라엘는/gu, "라엘은")
    .replace(/라엘를/gu, "라엘을")
    .replace(/라엘와/gu, "라엘과")
    .replace(/카이젠는/gu, "카이젠은")
    .replace(/카이젠를/gu, "카이젠을")
    .replace(/카이젠와/gu, "카이젠과")
    .replace(/마리안는/gu, "마리안은")
    .replace(/마리안를/gu, "마리안을")
    .replace(/마리안와/gu, "마리안과")
    .replace(/향가/gu, "향이")
    .replace(/골라야 한다/gu, "골라야 했다")
    .replace(/\s+/gu, " ")
    .trim();
}

function stripActorLead(actorName: string, text: string): string {
  const actor = shortName(actorName);
  return text
    .replace(new RegExp(`^${actor}(?:은|는|이|가)\\s*`, "u"), "")
    .trim();
}

function mainActionCue(value: string): string {
  return value.split(/,\s*/u)[0]?.trim() ?? value;
}

function firstClause(value: string, maxLength = 88): string {
  const cleaned = cleanProse(value).split(/[;。]/u)[0]?.trim() ?? "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function pairPhrase(left: string, right: string): string {
  if (!left || !right) return left || right || "두 사람";
  if (left === right) return left;
  return `${left}와 ${right}`;
}

function motifFromOutcome(value: string): string {
  const cleaned = cleanProse(value);
  if (/가면 아래/u.test(cleaned)) return "반듯한 미소 아래에서 다른 얼굴이 스쳤다";
  if (/겨울 장미/u.test(cleaned)) return "차가운 장미 향처럼 오래된 비밀이 문틈에 남았다";
  if (/독살|독초/u.test(cleaned)) return "잔 끝에 닿은 쓴 향이 오래 남았다";
  if (/시계|거꾸로/u.test(cleaned)) return "멈춘 시계처럼 시간이 한 박자 뒤틀렸다";
  if (/봉인|문서|기록|장부/u.test(cleaned)) return "닫힌 기록 하나가 아직 완전히 잠기지 않았다";
  return chooseVariant(cleaned, [
    "눈에 띄지 않는 단서 하나가 방 안에 남았다",
    "말하지 않은 이름 하나가 다음 문턱으로 넘어갔다",
    "아직 닫히지 않은 흔적이 사람들 사이에 남았다",
    "누군가의 침묵이 다음 질문의 모양을 바꾸었다",
    "드러나지 않은 균열 하나가 조용히 자리를 옮겼다",
  ]);
}

function proseOutcomeFromSceneOutcome(value: string): string {
  const normalized = cleanProse(value);
  if (!normalized) return "말하지 못한 단서 하나가 방 안에 남았다";

  const trustMatch = /([^:>\[\]—]+?)(?:와|과)\s+([^:>\[\]—]+?)의\s+신뢰\s+축이\s+(-?\d+)/u.exec(normalized);
  if (trustMatch) {
    const left = shortName(cleanProse(trustMatch[1] ?? "누군가"));
    const right = shortName(cleanProse(trustMatch[2] ?? "상대"));
    const delta = Number.parseInt(trustMatch[3] ?? "0", 10);
    const relationship = delta < 0
      ? `${pairPhrase(left, right)} 사이에 말로 풀 수 없는 의심이 남았다`
      : delta > 0
        ? `${pairPhrase(left, right)} 사이의 거리가 아주 조금 좁아졌다`
        : `${pairPhrase(left, right)}는 서로의 위치만 다시 확인했다`;
    return `${motifFromOutcome(normalized)}. ${relationship}`;
  }

  if (/\[[^\]]+\]|->|복선|state|delta|act_|evt_|신뢰 축|압력이|source/i.test(normalized)) {
    return motifFromOutcome(normalized);
  }
  return firstClause(normalized, 96);
}

function isGenericArcStart(value: string): boolean {
  return /회귀 후 상황을 파악|약혼 파기를 위한 첫 수|시간 속성 마법을 각성/u.test(value);
}

function concreteOpeningFromScene(sceneLog: SceneLog): string {
  const location = cleanProse(sceneLog.location);
  const seed = `${sceneLog.sceneId}:${sceneLog.scenePurpose}:${location}`;
  if (location.includes("마법탑")) {
    return chooseVariant(seed, [
      "봉인 위의 흐린 빛이 손등 가까이에서 한 번 떨렸다",
      "실험 회랑의 낮은 발소리가 닫힌 기록 앞에서 멈췄다",
      "결계 너머의 은빛이 말보다 먼저 문턱을 건드렸다",
    ]);
  }
  if (location.includes("황궁")) {
    return chooseVariant(seed, [
      "황궁의 문서 냄새가 봉인 끈 아래에서 차갑게 올라왔다",
      "의례용 촛불이 아직 마르지 않은 도장 위에서 흔들렸다",
      "문서실의 낮은 정적이 누가 먼저 기록을 보았는지 묻고 있었다",
    ]);
  }
  if (location.includes("라벤더")) {
    return chooseVariant(seed, [
      "별궁의 창빛 아래에서 부르지 않은 이름 하나가 잔 가장자리에 남았다",
      "라벤더 향이 닫힌 명단의 빈칸을 천천히 덮었다",
      "작은 연회실의 웃음은 문턱을 넘기 전에 먼저 식었다",
    ]);
  }
  if (location.includes("뒤뜰") || location.includes("회랑")) {
    return chooseVariant(seed, [
      "회랑 끝 발소리가 한 박자 어긋나자 명단의 빈칸이 다시 떠올랐다",
      "뒤뜰의 낮은 바람이 말하지 않은 이름을 문가로 밀어 넣었다",
      "젖은 돌바닥 위로 누가 먼저 움직였는지 알 수 없는 흔적이 남았다",
    ]);
  }
  return chooseVariant(seed, [
    "닫힌 문 안쪽에서 아직 부르지 않은 이름이 먼저 흔들렸다",
    "은잔의 그림자가 낮게 기울고 대답하지 않은 말이 남았다",
    "문턱의 정적이 누구의 허락도 기다리지 않고 길어졌다",
  ]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function withoutSceneLocation(sceneLog: SceneLog, value: string): string {
  const cleaned = cleanProse(value);
  const location = cleanProse(sceneLog.location);
  return cleaned
    .replace(new RegExp(`^${escapeRegExp(location)}(?:의|에서|에는|에)?\\s*`, "u"), "")
    .replace(new RegExp(`\\b${escapeRegExp(location)}(?:의|에서|에는|에)?\\s*`, "gu"), "")
    .replace(/\s+/gu, " ")
    .trim();
}

function variantIndex(seed: string, size: number): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % Math.max(1, size);
}

function chooseVariant(seed: string, values: string[]): string {
  return values[variantIndex(seed, values.length)] ?? values[0] ?? "";
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?。！？]$|[.!?。！？][”"]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sceneLogsForWindow(window: WorldEpisodeWindow, sceneLogs: SceneLog[]): SceneLog[] {
  const sceneIds = new Set(window.sourceSceneIds);
  return sceneLogs.filter((sceneLog) => sceneIds.has(sceneLog.sceneId));
}

function actionLogsForWindow(window: WorldEpisodeWindow, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const actionIds = new Set(window.sourceActionLogIds);
  return actionLogs.filter((log) => actionIds.has(log.logId));
}

function actionLogsForScene(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const sourceIds = new Set(sceneLog.sourceActionLogIds);
  return actionLogs.filter((log) => sourceIds.has(log.logId));
}

function dialogueTurnsByActionLogId(sceneLog: SceneLog): Map<string, DialogueTurn> {
  const result = new Map<string, DialogueTurn>();
  for (const turn of sceneLog.dialogueTurns) {
    for (const logId of turn.sourceActionLogIds) {
      result.set(logId, turn);
    }
  }
  return result;
}

function decisionsBySceneId(map: WorldLogEditorialMap | undefined): Map<string, WorldLogSceneEditorialDecision> {
  return new Map((map?.chapters ?? []).map((decision) => [decision.sceneId, decision]));
}

function bridgeForScene(sceneLog: SceneLog, index: number): string {
  const anchor = sceneLog.sensoryAnchors[index % Math.max(1, sceneLog.sensoryAnchors.length)] ?? sceneLog.location;
  const location = cleanProse(sceneLog.location);
  const cleanAnchor = cleanProse(anchor);
  if (index === 0) {
    const anchorLine = cleanAnchor === location ? location : `${location}의 ${cleanAnchor}`;
    const opening = isGenericArcStart(sceneLog.emotionalArc.start)
      ? concreteOpeningFromScene(sceneLog)
      : firstClause(sceneLog.emotionalArc.start, 110);
    return `${anchorLine} 위로 낮은 빛이 걸렸다. ${sentence(opening)}`;
  }
  return `문이 열릴 때 ${cleanAnchor}의 그림자가 먼저 넘어왔다. ${sentence(proseOutcomeFromSceneOutcome(sceneLog.sceneOutcome))}`;
}

function genericTitle(value: string | undefined): boolean {
  const title = value?.trim() ?? "";
  return title.length === 0
    || /^\d+화$/u.test(title)
    || /^chapter\s*\d+$/iu.test(title)
    || /^episode\s*\d+$/iu.test(title);
}

function titleFromPurpose(sceneLog: SceneLog, seed: string): string {
  const location = cleanProse(sceneLog.location);
  const locationHint = location.includes("마법탑")
    ? "마법탑"
    : location.includes("황궁")
      ? "황궁"
      : location.includes("하인 통로")
        ? "하인 통로"
        : "";
  const purposeTitles: Record<string, string[]> = {
    establish_state: ["두 번째 아침", "다시 열린 응접실", "돌아온 아침의 이름"],
    information_discovery: ["명단의 빈칸", "장부 끝의 이름", "증언이 닫히기 전에"],
    relationship_probe: ["눈길의 값", "허락의 선", "서로의 문턱"],
    secret_pressure: ["닫힌 문장의 대가", "비밀이 남긴 자리", "말하지 않은 이름"],
    foreshadowing: ["거꾸로 도는 시계", "흐린 봉인의 빛", "먼저 움직인 그림자"],
    advance_plot: ["문턱의 허락", "기록이 열리는 순간", "한 걸음의 권한"],
    aftermath: ["남은 이름", "식은 잔의 증언", "끝나지 않은 대답"],
  };
  const base = chooseVariant(seed, purposeTitles[sceneLog.scenePurpose] ?? [
    "닫히지 않은 흔적",
    "남겨진 질문",
    "문턱 위의 이름",
  ]);
  if (!locationHint || base.includes(locationHint)) return base;
  if (sceneLog.scenePurpose === "information_discovery" || sceneLog.scenePurpose === "foreshadowing") {
    return `${locationHint}의 ${base}`;
  }
  return base;
}

function deriveEpisodeTitle(window: WorldEpisodeWindow, sceneLogs: SceneLog[]): string {
  const firstNonGeneric = sceneLogs.find((sceneLog) => !genericTitle(sceneLog.title))?.title;
  if (firstNonGeneric) return cleanProse(firstNonGeneric);
  const importantScene = sceneLogs.find((sceneLog) =>
    sceneLog.scenePurpose === "advance_plot"
    || sceneLog.scenePurpose === "secret_pressure"
    || sceneLog.scenePurpose === "foreshadowing"
  ) ?? sceneLogs[0];
  if (!importantScene) return `Episode ${window.episodeNumber}`;
  return titleFromPurpose(importantScene, `episode-title:${window.episodeNumber}:${window.startChapter}:${window.endChapter}`);
}

function targetReactionLine(log: CharacterActionLog): string {
  const target = log.targetNames[0];
  const targetLabel = target ? shortName(target) : "";
  const rawReaction = firstClause(log.actualEffect.targetReaction, 88);
  const reaction = normalizeReactionLine(rawReaction, targetLabel, log.logId);
  if (!target) return reaction || "대답 대신 잔 받침이 짧게 울렸다.";
  if (!reaction) return `${shortName(target)}은 대답보다 먼저 시선을 돌렸다.`;
  if (reaction.startsWith(shortName(target))) return reaction;
  return `${topic(shortName(target))} ${reaction}`;
}

function followUpLine(log: CharacterActionLog): string {
  const target = shortName(log.targetNames[0] ?? log.actorName);
  const followUp = normalizeFollowUpLine(firstClause(log.actualEffect.followUpActionSeed, 90), target, log.logId);
  if (!followUp) return "그 자리에 닫히지 않은 말이 하나 남았다.";
  return followUp;
}

function repeatedUtteranceVariant(utterance: string, occurrenceIndex: number, seed: string): string {
  if (occurrenceIndex <= 0) return utterance;
  if (utterance.includes("과한 선택은 당신에게 어울리지 않습니다")) {
    return chooseVariant(`${seed}:repeat:${occurrenceIndex}`, [
      utterance.replace("과한 선택은 당신에게 어울리지 않습니다", "그 선택은 당신에게 너무 무겁습니다"),
      utterance.replace("과한 선택은 당신에게 어울리지 않습니다", "그만큼은 당신답지 않습니다"),
      utterance.replace("과한 선택은 당신에게 어울리지 않습니다", "여기서 더 밀어붙이면 당신만 다칩니다"),
    ]);
  }
  if (utterance.includes("이 판에 끼어들 명분이 생긴 것 같은데요")) {
    return chooseVariant(`${seed}:repeat:${occurrenceIndex}`, [
      utterance.replace("이 판에 끼어들 명분이 생긴 것 같은데요", "이제 이 판에 들어설 이유가 생겼군요"),
      utterance.replace("이 판에 끼어들 명분이 생긴 것 같은데요", "말을 멈추기엔 판이 이미 열렸습니다"),
      utterance.replace("이 판에 끼어들 명분이 생긴 것 같은데요", "이제 물러설 명분이 더 적어졌습니다"),
    ]);
  }
  const clauses = utterance.split(/(?<=\.)\s+/u).filter(Boolean);
  if (clauses.length > 1) {
    const [first, ...rest] = occurrenceIndex % 2 === 0 ? clauses : [...clauses.slice(1), clauses[0]!];
    return [first, ...rest].join(" ");
  }
  return `${utterance} 이번에는 목소리가 더 낮았다.`;
}

function speakerIdLike(turn: DialogueTurn | undefined, name: string): boolean {
  const speaker = `${turn?.speakerId ?? ""} ${turn?.speakerName ?? ""}`;
  return speaker.includes(name);
}

function hasListener(turn: DialogueTurn | undefined, name: string): boolean {
  return (turn?.listenerNames ?? []).some((listenerName) => shortName(listenerName).includes(name));
}

function sentencePrefixIfMissing(utterance: string, prefix: string, pattern: RegExp): string {
  if (pattern.test(utterance)) return utterance;
  return `${prefix}${utterance}`;
}

function cleanupVoiceStyleArtifacts(utterance: string): string {
  return utterance
    .replace(/공작 영애님,\s*크레센트 영애[,.]\s*/gu, "공작 영애님, ")
    .replace(/공작 영애님,\s*([^.!?。！？]{1,90})크레센트 영애[,.]\s*/gu, "공작 영애님, $1")
    .replace(/형님,\s*카이젠[,.]\s*/gu, "형님, ")
    .replace(/언니,\s*엘리시아[,.]\s*/gu, "언니, ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function styleUtteranceForSpeaker(turn: DialogueTurn | undefined, utterance: string, seed: string): string {
  void seed;
  if (!turn || !utterance) return utterance;

  if (speakerIdLike(turn, "elysia") || speakerIdLike(turn, "엘리시아")) {
    let styled = utterance;
    if (hasListener(turn, "라엘")) {
      styled = sentencePrefixIfMissing(styled, "황태자 전하, ", /전하|라엘/u);
    }
    if (hasListener(turn, "세레나")) {
      styled = sentencePrefixIfMissing(styled, "언니, ", /언니|세레나/u);
    }
    return cleanupVoiceStyleArtifacts(styled
      .replace(/제가 먼저 말보다 멈춘 쪽을 봐야겠습니다/gu, "제가 먼저 확인하겠습니다")
      .replace(/다음 말은 신중히 고르세요/gu, "말은 신중히 고르세요"));
  }

  if (speakerIdLike(turn, "kaizen") || speakerIdLike(turn, "카이젠")) {
    let styled = utterance
      .replace(/제가 먼저/gu, "내가 먼저")
      .replace(/봐야겠습니다/gu, "보죠")
      .replace(/확인하겠습니다/gu, "확인하죠")
      .replace(/정하죠/gu, "정해 보죠")
      .replace(/어렵네요/gu, "그냥 넘기긴 어렵네요");
    if (hasListener(turn, "엘리시아")) {
      styled = sentencePrefixIfMissing(styled, "공작 영애님, ", /공작 영애|엘리시아/u);
    }
    if (hasListener(turn, "라엘")) {
      styled = sentencePrefixIfMissing(styled, "형님, ", /형님|라엘/u);
    }
    return cleanupVoiceStyleArtifacts(styled);
  }

  if (speakerIdLike(turn, "serena") || speakerIdLike(turn, "세레나")) {
    let styled = utterance
      .replace(/제가 먼저/gu, "제가 볼게요")
      .replace(/확인하겠습니다/gu, "확인해 볼게요")
      .replace(/그 선은 넘지 않겠습니다/gu, "저는 그 선을 넘고 싶지 않아요");
    if (hasListener(turn, "엘리시아")) {
      styled = sentencePrefixIfMissing(styled, "언니, ", /언니|엘리시아/u);
    }
    return cleanupVoiceStyleArtifacts(styled);
  }

  if (speakerIdLike(turn, "rael") || speakerIdLike(turn, "라엘")) {
    let styled = utterance
      .replace(/제가 먼저/gu, "제가 정리하겠습니다")
      .replace(/제가 보기엔/gu, "제가 보기에는")
      .replace(/됐고,/gu, "그보다,");
    if (hasListener(turn, "엘리시아")) {
      styled = sentencePrefixIfMissing(styled, "엘리시아 양, ", /엘리시아 양|크레센트 영애|전하/u);
    }
    return cleanupVoiceStyleArtifacts(styled);
  }

  if (speakerIdLike(turn, "marian") || speakerIdLike(turn, "마리안")) {
    let styled = utterance
      .replace(/제가 확인하겠습니다/gu, "제가 확인할게요")
      .replace(/제가 움직일게요/gu, "제가 움직일게요")
      .replace(/잠깐만 기다려 주세요/gu, "잠깐만 기다려 주세요")
      .replace(/혼자 처리할 일이 아닙니다/gu, "혼자 처리하실 일 아니에요")
      .replace(/기록을 말로 정하기 전에 움직인 손부터 보겠습니다/gu, "말보다 손부터 볼게요");
    if (hasListener(turn, "엘리시아")) {
      styled = sentencePrefixIfMissing(styled, "아가씨, ", /아가씨|엘리시아/u);
    }
    return cleanupVoiceStyleArtifacts(styled);
  }

  return cleanupVoiceStyleArtifacts(utterance);
}

function normalizeReactionLine(value: string, target: string, seed: string): string {
  const subject = target || "상대";
  if (!value) return "";
  if (value.includes("질문이") && value.includes("향한다고 판단한다")) {
    return chooseVariant(seed, [
      "질문 뒤에 놓인 계산을 알아차렸다.",
      "묻는 말보다 그 말이 겨냥한 자리를 먼저 보았다.",
      "대답의 모양을 바꾸려는 손길을 눈치챘다.",
    ]);
  }
  if (value.includes("접근 허락의 명분과 위험")) {
    return chooseVariant(seed, [
      "허락할 명분과 뒤따를 위험을 함께 재었다.",
      "열어 줄 문과 막아야 할 시선을 나란히 놓았다.",
      "허가 뒤에 붙을 감시자의 얼굴을 떠올렸다.",
    ]);
  }
  if (value.includes("회피된 화제를 추궁")) {
    return chooseVariant(seed, [
      "되돌아온 질문을 바로 받지 못하고 시선을 낮췄다.",
      "막힌 대답 앞에서 손끝만 멈췄다.",
      "더 묻는 순간 판이 바뀐다는 걸 알았다.",
    ]);
  }
  if (value.includes("도움 요청을 받아들이는 대신 대가")) {
    return chooseVariant(seed, [
      "내밀어진 도움의 값을 먼저 계산했다.",
      "호의와 빚 사이의 선을 조용히 그었다.",
      "손을 잡기 전에 잃을 것을 먼저 떠올렸다.",
    ]);
  }
  if (value.includes("끊긴 대화 뒤에 남은 정보")) {
    return chooseVariant(seed, [
      "끊어진 말 뒤의 정보를 따로 접어 두었다.",
      "멈춘 대화가 남긴 방향을 기억했다.",
      "끝나지 않은 대답을 다른 이름 아래 숨겼다.",
    ]);
  }
  if (value.includes("무너지지 않는 표정")) {
    return chooseVariant(seed, [
      "흔들리지 않는 얼굴을 보고 의심의 방향을 틀었다.",
      "너무 반듯한 미소에서 다른 균열을 찾았다.",
      "가라앉은 표정 뒤쪽으로 질문을 옮겼다.",
    ]);
  }
  if (value.includes("관찰을 알아차리고")) {
    return chooseVariant(seed, [
      "쏟아지는 시선을 눈치채고 말의 폭을 좁혔다.",
      "누가 보고 있는지 깨닫고 숨을 고르게 놓았다.",
      "드러난 버릇을 손끝 아래로 감췄다.",
    ]);
  }
  if (value.includes("되묻는 좁아진 거리")) {
    return "되묻는 시선 앞에서 질문의 근거를 감췄다.";
  }
  if (/질문에 공개 답변과 회피/u.test(value)) {
    return chooseVariant(seed, [
      "답을 내놓기 전에 잔 가장자리를 한 번 눌렀다.",
      "말문을 열 듯하다가 시선을 먼저 돌렸다.",
      "대답할 자리를 비워 둔 채 숨을 골랐다.",
      "질문을 받은 방향 대신 문가의 그림자를 보았다.",
    ]);
  }
  return value;
}

function normalizeFollowUpLine(value: string, target: string, seed: string): string {
  if (!value) return "";
  if (value.includes("비껴간 화제를 다시 열 수 있는 증거")) {
    return chooseVariant(seed, [
      `${topic(target)} 빠진 이름을 다시 짚었다.`,
      `${topic(target)} 남은 흔적을 다음 질문으로 넘겼다.`,
      `${topic(target)} 대답 대신 장부의 빈칸을 기억했다.`,
    ]);
  }
  if (value.includes("접근을 허락할 범위와 감시 조건")) {
    return chooseVariant(seed, [
      `${topic(target)} 허락의 선과 감시자를 동시에 재었다.`,
      `${topic(target)} 열어 줄 곳과 막아 둘 시선을 갈라 놓았다.`,
      `${topic(target)} 한 걸음의 권한에 조건을 붙였다.`,
      `${topic(target)} 문턱의 폭과 따라붙을 눈길을 따로 세었다.`,
      `${topic(target)} 허락 하나에도 물러설 길을 남겼다.`,
      `${topic(target)} 들어올 사람과 닫아 둘 기록을 갈랐다.`,
    ]);
  }
  if (value.includes("끊긴 대화 뒤 남은 단서")) {
    return chooseVariant(seed, [
      `${topic(target)} 남은 단서를 다른 통로로 넘겼다.`,
      `${topic(target)} 끝난 대화의 빈자리를 따로 접어 두었다.`,
      `${topic(target)} 다음 확인자를 침묵 아래에 골랐다.`,
      `${topic(target)} 말이 끊긴 자리에 남은 이름을 기억했다.`,
      `${topic(target)} 멈춘 대답을 다른 사람의 입으로 확인하려 했다.`,
      `${topic(target)} 방금 닫힌 문장을 다음 질문으로 남겼다.`,
    ]);
  }
  if (value.includes("협력 조건을 정하거나 도움 요청을 거절")) {
    return chooseVariant(seed, [
      `${topic(target)} 도움의 값을 정하기 전까지 손을 잡지 않았다.`,
      `${topic(target)} 호의가 빚이 되기 전에 조건을 세웠다.`,
      `${topic(target)} 받아들일 몫과 끊어 낼 몫을 나눴다.`,
    ]);
  }
  if (value.includes("가면을 깨뜨릴")) {
    return chooseVariant(seed, [
      `${topic(target)} 그 미소를 흔들 단서 하나가 더 필요했다.`,
      `${topic(target)} 반듯한 얼굴에 금을 낼 질문을 남겨 두었다.`,
      `${topic(target)} 웃음 뒤쪽의 균열을 기다리기로 했다.`,
    ]);
  }
  if (value.includes("노출된 습관")) {
    return chooseVariant(seed, [
      `${topic(target)} 드러난 버릇을 감추고 덫으로 바꾸었다.`,
      `${topic(target)} 방금 보인 손짓을 다음 판의 미끼로 삼았다.`,
      `${topic(target)} 읽힌 습관을 다른 신호로 덮었다.`,
    ]);
  }
  if (value.includes("자기 질문의 출처")) {
    return chooseVariant(seed, [
      `${topic(target)} 질문의 출처를 감출 우회로를 찾았다.`,
      `${topic(target)} 어디서 들었는지부터 숨겼다.`,
      `${topic(target)} 근거 대신 예법을 앞세웠다.`,
      `${topic(target)} 물음의 시작점을 다른 이름 뒤에 감췄다.`,
    ]);
  }
  if (/질문에 공개 답변과 회피/u.test(value)) {
    return chooseVariant(seed, [
      `${topic(target)} 답을 내놓기 전에 잔 가장자리를 한 번 눌렀다.`,
      `${topic(target)} 말문을 열 듯하다가 시선을 먼저 돌렸다.`,
      `${topic(target)} 대답할 자리를 비워 둔 채 숨을 골랐다.`,
      `${topic(target)} 질문을 받은 방향 대신 문가의 그림자를 보았다.`,
      `${topic(target)} 말을 삼키고 손끝으로 잔 받침을 밀었다.`,
      `${topic(target)} 대답 대신 턱 끝의 각도만 바꾸었다.`,
    ]);
  }
  return value;
}

function renderActionParagraph(input: {
  log: CharacterActionLog;
  turn?: DialogueTurn;
  sceneLog: SceneLog;
  actionIndex: number;
  utteranceOccurrenceIndex: number;
}): string {
  const seed = `${input.log.logId}:${input.log.tick}:${input.actionIndex}`;
  const actor = shortName(input.log.actorName);
  const visible = mainActionCue(stripActorLead(input.log.actorName, firstClause(input.log.visibleBehavior, 96)));
  const utterance = input.turn?.utterance
    ? repeatedUtteranceVariant(
      styleUtteranceForSpeaker(input.turn, cleanProse(input.turn.utterance), seed),
      input.utteranceOccurrenceIndex,
      seed,
    )
    : "";
  const hook = input.turn?.interactionDynamics?.writerHooks;
  const sensory = input.actionIndex % 2 === 0
    ? withoutSceneLocation(input.sceneLog, hook?.sensoryCue ?? input.sceneLog.sensoryAnchors[0] ?? "")
    : "";
  const gesture = cleanProse(hook?.gesture ?? visible);
  const reaction = targetReactionLine({ ...input.log, logId: seed });
  const followUp = followUpLine({ ...input.log, logId: seed });

  const firstSentence = compact([
    `${topic(actor)} ${visible || gesture}`,
    sensory ? `${sensory}` : undefined,
  ]).join(". ");
  const dialogueSentence = utterance
    ? `“${utterance}”`
    : `${topic(actor)} 말을 아끼고 ${gesture || "손끝을 멈췄다"}.`;

  return [
    sentence(firstSentence),
    sentence(dialogueSentence),
    sentence(`${reaction} ${followUp}`),
  ].join(" ");
}

function compressedActionClause(log: CharacterActionLog): string {
  const actor = shortName(log.actorName);
  const target = log.targetNames[0] ? shortName(log.targetNames[0]) : "";
  let visible = truncate(mainActionCue(stripActorLead(log.actorName, firstClause(log.visibleBehavior, 70))), 34);
  if (target) {
    visible = visible
      .replace(new RegExp(`${escapeRegExp(target)}\\s+쪽으로\\s*`, "gu"), "")
      .replace(/^\s*쪽으로\s*/gu, "")
      .trim();
  }
  if (!visible) return `${topic(actor)} 말을 아꼈다`;
  if (!target) return `${topic(actor)} ${visible}`;

  const bridge = chooseVariant(`${log.logId}:compressed-target-bridge`, [
    `${target} 앞에서`,
    `${target}에게`,
    `${target} 곁에서`,
    `${target} 쪽을 살피며`,
    `${target}의 말끝을 따라`,
    `${target}와 거리를 둔 채`,
    `${target}의 시선을 피해`,
    `${target} 앞에 선 채`,
    `${target}에게서 눈을 떼지 않고`,
    `${target}를 지나치듯 보며`,
  ]);
  return `${topic(actor)} ${bridge} ${visible}`;
}

function groupedSentences(clauses: string[], seed: string): string[] {
  void seed;
  const sentences: string[] = [];
  for (let index = 0; index < clauses.length; index += 1) {
    sentences.push(sentence(clauses[index] ?? ""));
  }
  return sentences;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function montageParagraph(input: {
  sceneLog: SceneLog;
  logs: CharacterActionLog[];
  seed: string;
}): string[] {
  if (input.logs.length === 0) return [];
  const clauses = input.logs.map(compressedActionClause);
  return chunk(clauses, 3).map((group, index) => {
    const prefix = chooseVariant(`${input.seed}:montage-prefix:${index}`, [
      "그 사이",
      "말이 오가지 않는 동안",
      "시선이 다른 쪽으로 옮겨 갈 때",
      "누구도 먼저 자리를 뜨지 않는 사이",
    ]);
    const cleaned = group.map((clause) => clause.replace(/\.$/u, ""));
    const first = cleaned[0] ? sentence(`${prefix} ${cleaned[0]}`) : "";
    const rest = cleaned.slice(1).map(sentence).join(" ");
    return compact([first, rest]).join(" ");
  });
}

function selectedSceneActionLogs(input: {
  logs: CharacterActionLog[];
  decision?: WorldLogSceneEditorialDecision;
  treatment: string;
}): Set<string> {
  const selected = new Set<string>();
  for (const logId of input.decision?.keyActionLogIds ?? []) {
    selected.add(logId);
  }
  const budget = input.treatment === "full_scene" ? 7 : 5;
  const ranked = input.logs
    .slice()
    .sort((left, right) => {
      const leftScore = Math.abs(left.actualEffect.scenePressureDelta)
        + left.actualEffect.stateDeltas.length * 0.25
        + Object.values(left.trustDeltas).reduce((sum, value) => sum + Math.abs(value), 0);
      const rightScore = Math.abs(right.actualEffect.scenePressureDelta)
        + right.actualEffect.stateDeltas.length * 0.25
        + Object.values(right.trustDeltas).reduce((sum, value) => sum + Math.abs(value), 0);
      return rightScore - leftScore || left.tick - right.tick;
    });
  for (const log of ranked.slice(0, budget)) {
    selected.add(log.logId);
  }
  const first = input.logs[0]?.logId;
  const last = input.logs.at(-1)?.logId;
  if (first) selected.add(first);
  if (last) selected.add(last);
  return selected;
}

function compressedSceneSection(input: {
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
  index: number;
  utteranceOccurrences: Map<string, number>;
}): string[] {
  const logs = actionLogsForScene(input.sceneLog, input.actionLogs)
    .sort((left, right) => left.tick - right.tick);
  const bridge = bridgeForScene(input.sceneLog, input.index);
  const clauses = logs.map(compressedActionClause);
  const representativeTurn = input.sceneLog.dialogueTurns.find((turn) => turn.utterance);
  const utteranceKey = representativeTurn?.utterance ? cleanProse(representativeTurn.utterance) : "";
  const occurrenceIndex = utteranceKey ? input.utteranceOccurrences.get(utteranceKey) ?? 0 : 0;
  if (utteranceKey) input.utteranceOccurrences.set(utteranceKey, occurrenceIndex + 1);
  const quote = representativeTurn?.utterance
    ? chooseVariant(`${input.sceneLog.sceneId}:compressed-quote:${occurrenceIndex}`, [
      `그중 ${shortName(representativeTurn.speakerName)}의 말만 방 안에 남았다. “${repeatedUtteranceVariant(cleanProse(representativeTurn.utterance), occurrenceIndex, input.sceneLog.sceneId)}”`,
      `마지막으로 남은 목소리는 ${shortName(representativeTurn.speakerName)}의 것이었다. “${repeatedUtteranceVariant(cleanProse(representativeTurn.utterance), occurrenceIndex, input.sceneLog.sceneId)}”`,
      `${shortName(representativeTurn.speakerName)}은 낮게 선을 그었다. “${repeatedUtteranceVariant(cleanProse(representativeTurn.utterance), occurrenceIndex, input.sceneLog.sceneId)}”`,
    ])
    : "대답 대신 낮은 정적만 남았다.";
  const closing = chooseVariant(`${input.sceneLog.sceneId}:compressed-closing`, [
    "그 말 뒤로 장부의 빈칸이 더 선명해졌다.",
    "문턱의 정적은 다음 확인을 재촉했다.",
    "누구도 먼저 눈을 떼지 못했다.",
    "남은 이름 하나가 다음 질문으로 넘어갔다.",
  ]);
  const actionSentences = groupedSentences(clauses, `${input.sceneLog.sceneId}:compressed-groups`);
  const summary = compact([
    actionSentences.slice(0, Math.ceil(actionSentences.length / 2)).join(" "),
    actionSentences.slice(Math.ceil(actionSentences.length / 2)).join(" "),
    `${quote} ${closing}`,
  ]);
  return [bridge, ...summary];
}

function renderSceneSection(input: {
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
  decision?: WorldLogSceneEditorialDecision;
  index: number;
  utteranceOccurrences: Map<string, number>;
}): string[] {
  const turnsByLogId = dialogueTurnsByActionLogId(input.sceneLog);
  const logs = actionLogsForScene(input.sceneLog, input.actionLogs)
    .sort((left, right) => left.tick - right.tick);
  if (input.decision?.narrativeTreatment === "compressed_scene" || input.decision?.narrativeTreatment === "summary_bridge") {
    return compressedSceneSection({
      sceneLog: input.sceneLog,
      actionLogs: input.actionLogs,
      index: input.index,
      utteranceOccurrences: input.utteranceOccurrences,
    });
  }
  const bridge = bridgeForScene(input.sceneLog, input.index);
  const treatment = input.decision?.narrativeTreatment ?? "expanded_scene";
  const selectedLogIds = selectedSceneActionLogs({
    logs,
    decision: input.decision,
    treatment,
  });
  const paragraphs: string[] = [bridge];
  let skippedLogs: CharacterActionLog[] = [];

  const flushSkippedLogs = (actionIndex: number): void => {
    if (skippedLogs.length === 0) return;
    paragraphs.push(...montageParagraph({
      sceneLog: input.sceneLog,
      logs: skippedLogs,
      seed: `${input.sceneLog.sceneId}:montage:${actionIndex}`,
    }));
    skippedLogs = [];
  };

  logs.forEach((log, actionIndex) => {
    if (!selectedLogIds.has(log.logId)) {
      skippedLogs.push(log);
      return;
    }
    flushSkippedLogs(actionIndex);
    const turn = turnsByLogId.get(log.logId);
    const utteranceKey = turn?.utterance ? cleanProse(turn.utterance) : "";
    const occurrenceIndex = utteranceKey ? input.utteranceOccurrences.get(utteranceKey) ?? 0 : 0;
    if (utteranceKey) input.utteranceOccurrences.set(utteranceKey, occurrenceIndex + 1);
    paragraphs.push(renderActionParagraph({
      log,
      turn,
      sceneLog: input.sceneLog,
      actionIndex,
      utteranceOccurrenceIndex: occurrenceIndex,
    }));
  });
  flushSkippedLogs(logs.length);
  return paragraphs;
}

export function renderEpisodeDraftFromWorldLog(
  input: RenderEpisodeDraftFromWorldLogInput,
): EpisodeDraftRenderResult {
  const sceneLogs = sceneLogsForWindow(input.episodeWindow, input.sceneLogs);
  const actionLogs = actionLogsForWindow(input.episodeWindow, input.actionLogs);
  const decisionMap = decisionsBySceneId(input.worldLogEditorialMap);
  const utteranceOccurrences = new Map<string, number>();
  const paragraphs = sceneLogs.flatMap((sceneLog, index) =>
    renderSceneSection({
      sceneLog,
      actionLogs,
      decision: decisionMap.get(sceneLog.sceneId),
      index,
      utteranceOccurrences,
    })
  );
  const title = deriveEpisodeTitle(input.episodeWindow, sceneLogs);
  const body = paragraphs
    .map((paragraph) => cleanProse(paragraph))
    .filter(Boolean)
    .join("\n\n");
  const text = `# ${input.episodeWindow.episodeNumber}화. ${title}\n\n${body}\n`;
  const renderedActionIds = new Set(actionLogs.map((log) => log.logId));
  const dialogueLineCount = (text.match(/[“"][^”"]{1,180}[”"]/gu) ?? []).length;
  const report = EpisodeDraftRenderReportSchema.parse({
    episodeNumber: input.episodeWindow.episodeNumber,
    sourceSceneCount: sceneLogs.length,
    sourceActionLogCount: input.episodeWindow.sourceActionLogIds.length,
    renderedActionLogCount: input.episodeWindow.sourceActionLogIds.filter((id) => renderedActionIds.has(id)).length,
    paragraphCount: paragraphs.length,
    dialogueLineCount,
    outputCharacterCount: text.length,
    sourceActionLogCoverage: renderedActionIds.size / Math.max(1, input.episodeWindow.sourceActionLogIds.length),
    treatments: sceneLogs.map((sceneLog) => {
      const decision = decisionMap.get(sceneLog.sceneId);
      return {
        sceneId: sceneLog.sceneId,
        narrativeTreatment: decision?.narrativeTreatment ?? "normal",
        suggestedWordBudget: decision?.suggestedWordBudget ?? 600,
      };
    }),
  });

  return { text, report };
}
