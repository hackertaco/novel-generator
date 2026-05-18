import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";

import type { WorldEpisodeWindow } from "./episode-selector";
import type { WorldLogEditorialMap } from "./world-log-editorial-map";
import { validateNarrativeProse } from "./narrative-prose-validator";

const StringListSchema = z.array(z.string());

export const NovelOutputQAIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  evidence: StringListSchema,
});

export const NovelOutputQAMetricSchema = z.object({
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()),
});

export const NovelOutputQAReportSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["pass", "warn", "fail"]),
  metrics: z.object({
    sourceCoverage: NovelOutputQAMetricSchema,
    metaLeakSafety: NovelOutputQAMetricSchema,
    repetitionControl: NovelOutputQAMetricSchema,
	    sceneSeam: NovelOutputQAMetricSchema,
	    characterAgency: NovelOutputQAMetricSchema,
	    sourceStateDeltaGrounding: NovelOutputQAMetricSchema,
	    treatmentCompliance: NovelOutputQAMetricSchema,
	    novelness: NovelOutputQAMetricSchema,
	    dramaticVariation: NovelOutputQAMetricSchema,
	  }),
  issues: z.array(NovelOutputQAIssueSchema),
});

export const NovelOutputCorpusEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  text: z.string(),
  verdict: z.enum(["pass", "warn", "fail"]).optional(),
  score: z.number().min(0).max(1).optional(),
});

export const NovelOutputCorpusQAReportSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["pass", "warn", "fail"]),
  episodeCount: z.number().int().nonnegative(),
  repeatedOpeningSkeletons: z.array(z.object({
    value: z.string(),
    count: z.number().int().positive(),
    episodeNumbers: z.array(z.number().int().positive()),
  })),
  repeatedEndingSkeletons: z.array(z.object({
    value: z.string(),
    count: z.number().int().positive(),
    episodeNumbers: z.array(z.number().int().positive()),
  })),
  repeatedDialogueOpenings: z.array(z.object({
    value: z.string(),
    count: z.number().int().positive(),
  })),
  repeatedGestureSkeletons: z.array(z.object({
    value: z.string(),
    count: z.number().int().positive(),
  })),
  notes: z.array(z.string()),
});

export type NovelOutputQAIssue = z.infer<typeof NovelOutputQAIssueSchema>;
export type NovelOutputQAMetric = z.infer<typeof NovelOutputQAMetricSchema>;
export type NovelOutputQAReport = z.infer<typeof NovelOutputQAReportSchema>;
export type NovelOutputCorpusEpisode = z.infer<typeof NovelOutputCorpusEpisodeSchema>;
export type NovelOutputCorpusQAReport = z.infer<typeof NovelOutputCorpusQAReportSchema>;

export interface EvaluateNovelOutputQAInput {
  text: string;
  episodeWindow: WorldEpisodeWindow;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  worldLogEditorialMap?: WorldLogEditorialMap;
}

export interface EvaluateNovelOutputCorpusQAInput {
  episodes: NovelOutputCorpusEpisode[];
}

const METRIC_WEIGHTS = {
  sourceCoverage: 0.21,
  metaLeakSafety: 0.14,
  repetitionControl: 0.11,
  sceneSeam: 0.1,
  characterAgency: 0.14,
  sourceStateDeltaGrounding: 0.09,
  treatmentCompliance: 0.08,
  novelness: 0.05,
  dramaticVariation: 0.08,
} as const;

const META_LEAK_PATTERNS = [
  /sourceActionLogId/u,
  /sourceActionLogIds/u,
  /action log/iu,
  /ActionLog/u,
  /scene_log_/u,
  /act_ch/u,
  /roleMission/u,
  /agentRole/u,
  /hiddenGoal/u,
  /evt_world_/u,
];

const REPORT_STYLE_TRANSITION_PATTERNS = [
  /그\s*아침이\s*지나고/u,
  /그리고\s*(황궁|마법탑|공작가|다음|이후)/u,
  /장소만\s*바뀌/u,
  /이후\s*(황궁|마법탑|공작가|다음)/u,
  /다음\s*장면/u,
  /시간이\s*흘러/u,
];

const ACTION_BRIDGE_PATTERNS = [
  /문이\s*열릴\s*때/u,
  /문을\s*열/u,
  /계단을\s*오르/u,
  /발소리/u,
  /복도/u,
  /길을\s*열/u,
  /따라붙/u,
  /뒤를\s*따/u,
  /안쪽으로\s*더\s*들어가/u,
  /손을\s*들/u,
];

const ABSTRACT_TELLING_PATTERNS = [
  /느꼈다/u,
  /느껴졌다/u,
  /고민/u,
  /생각에\s*잠겼/u,
  /생각에\s*잠겨/u,
  /생각하며/u,
  /의도(?:는|가|를|의)?/u,
  /의도(?:를|가)?\s*파악/u,
  /진의/u,
  /의미를\s*파악/u,
  /파악하려/u,
  /숨(?:은|겨진|겨져)/u,
  /감춰진|감춰둔|감추려/u,
  /감지했다/u,
  /비밀을\s*파헤치/u,
  /그\s*안에\s*담긴/u,
  /담긴\s*(?:무게|진심|의미)/u,
  /요구가\s*담겨/u,
  /기운이\s*깃들/u,
  /탐색/u,
  /읽어내려/u,
  /각자의\s*생각/u,
  /게임은\s*이제\s*시작/u,
  /기대감이\s*담겨/u,
  /결단/u,
  /결심/u,
  /결정/u,
  /결정해야/u,
  /명확히\s*알고\s*있었/u,
  /무엇인지\s*알\s*수\s*있었/u,
  /본능적으로\s*알/u,
  /직감/u,
  /깨달/u,
  /머릿속/u,
  /움직임(?:할|을\s*내려야)/u,
  /움직임을\s*내리/u,
  /무언의/u,
  /선택의\s*순간/u,
  /마음속/u,
  /운명을\s*바꿀/u,
  /긴장감/u,
  /압박감|압박/u,
  /모든\s*것이\s*그\s*순간/u,
  /다음\s*행동/u,
  /다음에\s*어떤\s*(?:행동|말)/u,
  /망설임했다/u,
  /망설임하기/u,
  /마음을\s*다잡/u,
  /다잡았다/u,
  /다음\s*행동을\s*고민/u,
  /다음\s*행동을\s*결정/u,
  /다음\s*행동을\s*준비/u,
  /다음에\s*해야\s*할/u,
  /순간을\s*기다렸/u,
];

const CONCRETE_ACTION_PATTERNS = [
  /손끝/u,
  /찻잔/u,
  /잔/u,
  /문/u,
  /소매/u,
  /고개/u,
  /시선/u,
  /걸음/u,
  /숨/u,
  /입술/u,
  /목소리/u,
  /침묵/u,
  /내려놓/u,
  /물러/u,
  /다가/u,
  /가로막/u,
  /건넸/u,
  /쥐었/u,
];

const TURN_PATTERNS = [
  /그러나/u,
  /대신/u,
  /그때/u,
  /한\s*박자/u,
  /말을\s*끊/u,
  /대답\s*대신/u,
  /고개를\s*저/u,
  /잔을\s*내려놓/u,
  /문이\s*열/u,
  /물러섰/u,
  /다가섰/u,
];

const PSEUDO_SCENE_FILLER_PATTERNS = [
  /공기(?:는|가)?[^.。\n]{0,20}가라앉/u,
  /침묵(?:은|이)?[^.。\n]{0,30}(깊어|이어|남|흐르|고조|탐색|의미)/u,
  /다음\s*움직임/u,
  /다음\s*순간/u,
  /다음\s*말을\s*준비/u,
  /다음\s*순간을\s*준비/u,
  /어떤\s*선택을\s*하실\s*건가요/u,
  /어떻게\s*생각하나요/u,
  /얇은\s*의미/u,
  /시선을\s*한\s*번에\s*모아\s*받/u,
  /반응할\s*이유가\s*생긴다/u,
  /잔\s*받침\s*소리(?:로|가|를)?[^.。\n]{0,20}(다가|얽|남)/u,
];

const SURFACE_POLISH_ARTIFACT_PATTERNS = [
  /소리은/u,
  /말밑를/u,
  /말끝가/u,
  /움직임을\s*움직/u,
  /움직임하기/u,
  /잔\s*받침\s*소리/u,
  /얇은\s*의미/u,
  /다음\s*움직임/u,
  /라엘와|카이젠와|마리안와/u,
  /은잔와|교대을|봉쇄을|봉쇄은|제약를|빈틈을/u,
  /다고,/u,
  /(?:린|한)고,/u,
];

const MECHANICAL_DIALOGUE_STAGING_PATTERNS = [
  /쪽으로[^.。\n]{0,60}입을\s*열었다/gu,
  /입을\s*열었다\.\s*[“"][^”"]+[”"]/gu,
  /쪽으로[^.。\n]{0,40}(흐트러지지 않은 미소로|목소리를 낮춰|손끝을|말을 고르듯)[^.。\n]{0,40}입을\s*열었다/gu,
];

const HUMAN_READABILITY_ARTIFACT_PATTERNS = [
  /판세\s*재정의의\s*여파로/gu,
  /(?:출입\s*봉쇄|증언\s*분기|기록\s*감사|파벌\s*거래|징후\s*재출현|후폭풍\s*정리)의\s*여파로/gu,
  /대답은\s*한\s*번이면\s*됩니다/gu,
  /피하지\s*않으셔도\s*됩니다/gu,
  /제가\s*나서겠습니다\.\s*당신은\s*말만\s*아끼시면\s*됩니다/gu,
  /잠깐\s*숨을\s*골랐다/gu,
  /대답보다\s*오래\s*남았다/gu,
  /그\s*단서는\s*대답보다\s*오래\s*방\s*안에\s*머물렀다/gu,
  /기록이\s*닫히기\s*전에요/gu,
  /이름이\s*바뀌기\s*전에요/gu,
  /공작\s*영애님,\s*크레센트\s*영애/gu,
  /형님,\s*카이젠/gu,
  /언니,\s*엘리시아/gu,
  /그래서\s*방\s*안의\s*질문은\s*한\s*사람에게만\s*머물지\s*않았다/gu,
  /그\s*작은\s*움직임들이\s*모여\s*다음\s*대답의\s*폭을\s*좁혔다/gu,
  /누가\s*먼저\s*흔들렸는지는\s*끝내\s*말로\s*정리되지\s*않았다/gu,
  /남은\s*사람들은\s*같은\s*침묵을\s*서로\s*다른\s*뜻으로\s*가져갔다/gu,
  /회귀\s*후\s*상황을\s*파악/gu,
  /약혼\s*파기를\s*위한\s*첫\s*수/gu,
  /해야\s*했다/gu,
  /골라야\s*했다/gu,
  /정해야\s*했다/gu,
  /시선을\s*둔다/gu,
  /길을\s*연다/gu,
  /말끝을\s*되받는다/gu,
  /틈을\s*줄인다/gu,
  /침묵을\s*고른다/gu,
  /향를|타이밍를|수상한\s*물건가/gu,
];

const DRAMATIC_BEAT_PATTERNS = {
  physical: /손끝|고개|걸음|등을|몸을|잔을|문을|시선을|입술|손을/u,
  sensory: /빛|소리|냄새|공기|커튼|바닥|창빛|촛농|재가|그림자/u,
  socialShift: /따라붙지|물러|다가|막았|허락|경계|의심|웃지|모른 척/u,
  consequence: /남았다|바뀌|좁아|열렸|닫혔|넘어갔|돌아왔|재촉/u,
  interruption: /끊|멈췄|늦었|한 박자|정적|침묵/u,
  speech: /[“"][^”"]{1,160}[”"]/u,
} as const;

const KOREAN_PARTICLES = /(은|는|이|가|을|를|과|와|에게|께|에서|으로|로|도|만|의)$/u;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.|죠\.|군요\.|니다\.)\s+|\n+/u)
    .map(normalizeText)
    .filter(Boolean);
}

function quotedDialogues(text: string): string[] {
  return (text.match(/[“"][^”"]{1,160}[”"]/gu) ?? [])
    .map((line) => normalizeText(line.replace(/^[“"]|[”"]$/gu, "")))
    .filter(Boolean);
}

function wordTokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.replace(KOREAN_PARTICLES, ""))
    .filter((token) => token.length >= 2);
}

function excerptAround(text: string, needle: string): string {
  const index = text.indexOf(needle);
  if (index < 0) return needle;
  return normalizeText(text.slice(Math.max(0, index - 45), Math.min(text.length, index + needle.length + 45)));
}

function selectedSceneLogs(window: WorldEpisodeWindow, sceneLogs: SceneLog[]): SceneLog[] {
  const ids = new Set(window.sourceSceneIds);
  return sceneLogs.filter((sceneLog) => ids.has(sceneLog.sceneId));
}

function selectedActionLogs(window: WorldEpisodeWindow, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const ids = new Set(window.sourceActionLogIds);
  return actionLogs.filter((log) => ids.has(log.logId));
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => entityMentioned(text, value));
}

function entityAliases(name: string): string[] {
  const normalized = normalizeText(name);
  const parts = normalized.split(/\s+/u).filter(Boolean);
  return Array.from(new Set([
    normalized,
    parts[0] ?? "",
    parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
  ].filter((value) => value.length >= 2)));
}

function entityMentioned(text: string, name: string): boolean {
  return entityAliases(name).some((alias) => text.includes(alias));
}

function actorActionPattern(actorName: string): RegExp {
  const aliasPattern = entityAliases(actorName).map(escapeRegExp).join("|");
  return new RegExp(`(?:${aliasPattern}).{0,90}(말했다|물었다|바라보|고개|손|웃|입|걸음|시선|대답|움직|내려놓|돌렸|들었다|멈췄|열었다|닫았다)`, "u");
}

function actionCueTerms(log: CharacterActionLog): string[] {
  const source = [
    log.action.type,
    log.visibleBehavior,
    log.actualEffect.targetReaction,
    log.actualEffect.followUpActionSeed,
    log.intendedEffect,
  ].join(" ");
  return wordTokens(source)
    .filter((token) => ![
      "에게",
      "반응",
      "이유",
      "생긴다",
      "행동",
      "준비한다",
      "즉시",
      "믿지",
      "않고",
    ].includes(token))
    .slice(0, 8);
}

function evaluateSourceCoverage(text: string, logs: CharacterActionLog[]): NovelOutputQAMetric {
  const covered = logs.filter((log) => {
    const actorCovered = entityMentioned(text, log.actorName);
    const targetCovered = log.targetNames.length === 0 || hasAny(text, log.targetNames);
    const cueTerms = actionCueTerms(log);
    const cueCoverage = cueTerms.filter((term) => text.includes(term)).length;
    return actorCovered && (targetCovered || cueCoverage >= 2) && cueCoverage >= 1;
  });

  return NovelOutputQAMetricSchema.parse({
    score: round3(covered.length / Math.max(1, logs.length)),
    weight: METRIC_WEIGHTS.sourceCoverage,
    details: {
      coveredActionLogCount: covered.length,
      sourceActionLogCount: logs.length,
      uncoveredActionLogIds: logs
        .filter((log) => !covered.includes(log))
        .map((log) => log.logId),
    },
  });
}

function evaluateMetaLeakSafety(text: string): NovelOutputQAMetric {
  const leaks = META_LEAK_PATTERNS
    .map((pattern) => pattern.exec(text)?.[0])
    .filter((value): value is string => Boolean(value));
  const proseViolations = validateNarrativeProse({ text }).violations
    .filter((violation) => violation.category === "internal_source_leak");
  const leakCount = leaks.length + proseViolations.length;

  return NovelOutputQAMetricSchema.parse({
    score: leakCount === 0 ? 1 : 0,
    weight: METRIC_WEIGHTS.metaLeakSafety,
    details: {
      leakCount,
      leaks,
      proseViolations,
    },
  });
}

function repeatedPhrases(text: string): Array<{ phrase: string; count: number }> {
  const sentenceList = sentences(text);
  const counts = new Map<string, number>();

  for (const sentence of sentenceList) {
    const tokens = wordTokens(sentence);
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index + size <= tokens.length; index += 1) {
        const phrase = tokens.slice(index, index + size).join(" ");
        if (phrase.length < 5) continue;
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 3)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((left, right) => right.count - left.count || left.phrase.localeCompare(right.phrase))
    .slice(0, 12);
}

function countedRepeats(values: string[], minCount: number): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized.length < 4) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= minCount)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function readerParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) =>
      paragraph.length > 0
      && !paragraph.startsWith("#")
      && !paragraph.startsWith("<!--")
    );
}

function firstReaderSentence(text: string): string {
  return sentences(readerParagraphs(text)[0] ?? "")[0] ?? "";
}

function lastReaderSentence(text: string): string {
  const paragraph = readerParagraphs(text).at(-1) ?? "";
  return sentences(paragraph).at(-1) ?? "";
}

function sentenceSkeleton(value: string): string {
  return normalizeText(value)
    .replace(/[“"][^”"]{1,180}[”"]/gu, "\"...\"")
    .replace(/(?:엘리시아|세레나|카이젠|라엘|마리안)(?:\s+(?:크레센트|아우레아))?/gu, "{인물}")
    .replace(/(?:크레센트 공작가|황궁 아우레아|마법탑 알카나|라벤더 별궁)(?:\s+[가-힣]+)?/gu, "{장소}")
    .replace(/(?:은잔|약혼 반지 케이스|은시계|장부|명단|서류|찻잔|문손잡이|벽난로|커튼)/gu, "{사물}")
    .replace(/\d+화/gu, "{회차}")
    .replace(/\s+/gu, " ")
    .trim();
}

function countedEpisodeSkeletonRepeats(
  episodes: NovelOutputCorpusEpisode[],
  extract: (text: string) => string,
  minCount: number,
): Array<{ value: string; count: number; episodeNumbers: number[] }> {
  const bySkeleton = new Map<string, number[]>();
  for (const episode of episodes) {
    const skeleton = sentenceSkeleton(extract(episode.text));
    if (skeleton.length < 8) continue;
    bySkeleton.set(skeleton, [...(bySkeleton.get(skeleton) ?? []), episode.episodeNumber]);
  }

  return Array.from(bySkeleton.entries())
    .filter(([, episodeNumbers]) => episodeNumbers.length >= minCount)
    .map(([value, episodeNumbers]) => ({
      value,
      count: episodeNumbers.length,
      episodeNumbers,
    }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, 12);
}

function gestureSkeletons(text: string): string[] {
  return sentences(text)
    .map(sentenceSkeleton)
    .filter((sentence) =>
      /시선|손끝|목소리|숨|침묵|고개|문가|창빛|소매|잔/u.test(sentence)
      && sentence.length >= 10
    );
}

function dialogueOpening(value: string): string {
  const stripped = value
    .replace(/^[가-힣A-Za-z\s]{2,14}(?:님|전하|영애|아가씨|언니|형님|공작)?[,，]\s*/u, "")
    .replace(/^(?:그렇게|그|저|제가|저는|오늘은|지금은)\s+/u, "")
    .trim();
  const boundary = stripped.search(/[,.?!。！？]/u);
  const clause = boundary > 0 ? stripped.slice(0, boundary) : stripped;
  return clause.slice(0, 24).trim();
}

function beatCategoriesForSentence(sentence: string): string[] {
  return Object.entries(DRAMATIC_BEAT_PATTERNS)
    .filter(([, pattern]) => pattern.test(sentence))
    .map(([category]) => category);
}

function evaluateRepetitionControl(text: string): NovelOutputQAMetric {
  const repeats = repeatedPhrases(text);
  const sentenceCount = Math.max(1, sentences(text).length);
  const repeatPressure = repeats.reduce((sum, item) => sum + item.count - 2, 0);
  const score = clamp(1 - repeatPressure / Math.max(8, sentenceCount * 0.45));

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.repetitionControl,
    details: {
      repeatedPhraseCount: repeats.length,
      repeatPressure,
      repeatedPhrases: repeats,
    },
  });
}

function evaluateSceneSeam(text: string, sceneLogs: SceneLog[]): NovelOutputQAMetric {
  if (sceneLogs.length <= 1) {
    return NovelOutputQAMetricSchema.parse({
      score: 1,
      weight: METRIC_WEIGHTS.sceneSeam,
      details: { sceneCount: sceneLogs.length, seamCount: 0 },
    });
  }

  const reportStyleTransitions = REPORT_STYLE_TRANSITION_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const sourceAnchors = sceneLogs.flatMap((sceneLog) => [
    sceneLog.location,
    sceneLog.atmosphere,
    ...sceneLog.sensoryAnchors,
  ]);
  const anchorMentions = sourceAnchors.filter((anchor) =>
    anchor.length >= 2 && text.includes(anchor)
  ).length;
  const actionBridgeHits = ACTION_BRIDGE_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const anchorScore = clamp(anchorMentions / Math.max(1, sceneLogs.length * 2));
  const actionBridgeScore = clamp(actionBridgeHits.length / Math.max(1, sceneLogs.length - 1));
  const penalty = Math.min(0.55, reportStyleTransitions.length * 0.2);
  const score = clamp(0.45 + anchorScore * 0.25 + actionBridgeScore * 0.35 - penalty);

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.sceneSeam,
    details: {
      sceneCount: sceneLogs.length,
      seamCount: sceneLogs.length - 1,
      anchorMentions,
      actionBridgeHits,
      reportStyleTransitions,
    },
  });
}

function evaluateCharacterAgency(text: string, logs: CharacterActionLog[]): NovelOutputQAMetric {
  const byActor = new Map<string, CharacterActionLog[]>();
  for (const log of logs) {
    byActor.set(log.actorName, [...(byActor.get(log.actorName) ?? []), log]);
  }

  const actorReports = Array.from(byActor.entries()).map(([actorName, actorLogs]) => {
    const mentioned = entityMentioned(text, actorName);
    const cueTerms = Array.from(new Set(actorLogs.flatMap(actionCueTerms)));
    const cueHits = cueTerms.filter((term) => text.includes(term)).length;
    const speechOrAction = actorActionPattern(actorName).test(text);
    const score = clamp((mentioned ? 0.35 : 0) + Math.min(0.45, cueHits * 0.09) + (speechOrAction ? 0.2 : 0));
    return {
      actorName,
      sourceActionLogCount: actorLogs.length,
      cueHits,
      mentioned,
      speechOrAction,
      score: round3(score),
    };
  });

  const score = actorReports.reduce((sum, report) => sum + report.score, 0) / Math.max(1, actorReports.length);

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.characterAgency,
    details: {
      actorCount: actorReports.length,
      actorReports,
    },
  });
}

function evaluateSourceStateDeltaGrounding(window: WorldEpisodeWindow, logs: CharacterActionLog[]): NovelOutputQAMetric {
  const sourceStateDeltaIds = window.sourceStateDeltaIds ?? [];
  const logDeltaIds = new Set(logs.flatMap((log) =>
    (log.actualEffect.stateDeltas ?? []).map((delta) => `${log.logId}:${delta.deltaId}`)
  ));
  const coveredWindowDeltaIds = sourceStateDeltaIds.filter((deltaId) => logDeltaIds.has(deltaId));
  const logsWithConcreteDeltas = logs.filter((log) => (log.actualEffect.stateDeltas ?? []).length > 0);
  const enoughWindowDeltas = sourceStateDeltaIds.length >= Math.max(3, logs.length * 3);
  const sourceDeltaCoverage = coveredWindowDeltaIds.length / Math.max(1, sourceStateDeltaIds.length);
  const logDeltaCoverage = logsWithConcreteDeltas.length / Math.max(1, logs.length);
  const score = clamp((sourceDeltaCoverage * 0.45) + (logDeltaCoverage * 0.35) + (enoughWindowDeltas ? 0.2 : 0));

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.sourceStateDeltaGrounding,
    details: {
      sourceStateDeltaCount: sourceStateDeltaIds.length,
      coveredWindowStateDeltaCount: coveredWindowDeltaIds.length,
      sourceActionLogCount: logs.length,
      logsWithConcreteDeltas: logsWithConcreteDeltas.length,
      enoughWindowDeltas,
    },
  });
}

function evaluateTreatmentCompliance(input: {
  text: string;
  episodeWindow: WorldEpisodeWindow;
  worldLogEditorialMap?: WorldLogEditorialMap;
}): NovelOutputQAMetric {
  const decisions = (input.worldLogEditorialMap?.chapters ?? [])
    .filter((decision) => input.episodeWindow.sourceSceneIds.includes(decision.sceneId));
  if (decisions.length === 0) {
    return NovelOutputQAMetricSchema.parse({
      score: 1,
      weight: METRIC_WEIGHTS.treatmentCompliance,
      details: {
        mode: input.worldLogEditorialMap ? "no_matching_decisions" : "not_provided",
        decisionCount: 0,
      },
    });
  }

  const paragraphCount = readerParagraphs(input.text).length;
  const dialogueCount = quotedDialogues(input.text).length;
  const characterCount = normalizeText(input.text).length;
  const totalBudget = decisions.reduce((sum, decision) => sum + decision.suggestedWordBudget, 0);
  const importantCount = decisions.filter((decision) =>
    decision.narrativeTreatment === "full_scene" || decision.narrativeTreatment === "expanded_scene"
  ).length;
  const bridgeCount = decisions.filter((decision) => decision.narrativeTreatment === "summary_bridge").length;
  const compressedCount = decisions.filter((decision) => decision.narrativeTreatment === "compressed_scene").length;
  const minimumParagraphs = decisions.reduce((sum, decision) => {
    if (decision.narrativeTreatment === "full_scene") return sum + 8;
    if (decision.narrativeTreatment === "expanded_scene") return sum + 5;
    if (decision.narrativeTreatment === "compressed_scene") return sum + 2;
    return sum + 1;
  }, 0);
  const minimumDialogues = decisions.reduce((sum, decision) => {
    if (decision.narrativeTreatment === "full_scene") return sum + 6;
    if (decision.narrativeTreatment === "expanded_scene") return sum + 3;
    if (decision.narrativeTreatment === "compressed_scene") return sum + 1;
    return sum;
  }, 0);
  const minimumCharacters = decisions.reduce((sum, decision) => {
    if (decision.narrativeTreatment === "full_scene") return sum + 900;
    if (decision.narrativeTreatment === "expanded_scene") return sum + 560;
    if (decision.narrativeTreatment === "compressed_scene") return sum + 230;
    return sum + 90;
  }, 0);
  const maximumCharacters = decisions.reduce((sum, decision) => {
    if (decision.narrativeTreatment === "full_scene") return sum + 2600;
    if (decision.narrativeTreatment === "expanded_scene") return sum + 1700;
    if (decision.narrativeTreatment === "compressed_scene") return sum + 850;
    return sum + 360;
  }, 0);
  const paragraphScore = clamp(paragraphCount / Math.max(1, minimumParagraphs));
  const dialogueScore = minimumDialogues === 0 ? 1 : clamp(dialogueCount / minimumDialogues);
  const lengthFloorScore = clamp(characterCount / Math.max(1, minimumCharacters));
  const overExpansionPenalty = characterCount > maximumCharacters
    ? clamp((characterCount - maximumCharacters) / Math.max(600, maximumCharacters))
    : 0;
  const bridgeOverExpansionPenalty = bridgeCount > 0 && importantCount === 0 && characterCount > maximumCharacters * 1.2
    ? 0.25
    : 0;
  const score = clamp(
    paragraphScore * 0.28
    + dialogueScore * 0.24
    + lengthFloorScore * 0.32
    + (importantCount > 0 ? 0.16 : 0.1)
    - overExpansionPenalty * 0.45
    - bridgeOverExpansionPenalty,
  );

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.treatmentCompliance,
    details: {
      decisionCount: decisions.length,
      treatments: decisions.map((decision) => decision.narrativeTreatment),
      totalSuggestedBudget: totalBudget,
      characterCount,
      paragraphCount,
      dialogueCount,
      minimumParagraphs,
      minimumDialogues,
      minimumCharacters,
      maximumCharacters,
      fullOrExpandedCount: importantCount,
      compressedCount,
      summaryBridgeCount: bridgeCount,
      overExpansionPenalty: round3(overExpansionPenalty + bridgeOverExpansionPenalty),
    },
  });
}

function evaluateNovelness(text: string): NovelOutputQAMetric {
  const sentenceList = sentences(text);
  const dialogueCount = (text.match(/[“"][^”"]{1,120}[”"]/gu) ?? []).length;
  const paragraphCount = text.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim().length > 0).length;
  const sensoryHits = (text.match(/공기|빛|소리|손끝|시선|잔|창|숨|문턱|바닥|커튼|정적/gu) ?? []).length;
  const abstractTellingHits = ABSTRACT_TELLING_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const concreteActionHits = CONCRETE_ACTION_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const turnHits = TURN_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const pseudoSceneFillerHits = PSEUDO_SCENE_FILLER_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const surfacePolishArtifactHits = SURFACE_POLISH_ARTIFACT_PATTERNS
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0]);
  const mechanicalDialogueStagingHits = MECHANICAL_DIALOGUE_STAGING_PATTERNS
    .flatMap((pattern) => [...text.matchAll(pattern)])
    .map((match) => match[0]);
  const humanReadabilityArtifactHits = HUMAN_READABILITY_ARTIFACT_PATTERNS
    .flatMap((pattern) => [...text.matchAll(pattern)])
    .map((match) => match[0]);
  const finalParagraph = text.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim().length > 0).at(-1) ?? "";
  const weakEnding = /고민|기다렸|선택해야|결정을\s*내려야|생각이\s*굳어/u.test(finalParagraph);
  const averageSentenceLength = normalizeText(text).length / Math.max(1, sentenceList.length);
  const dialogueScore = clamp(dialogueCount / 8);
  const paragraphScore = clamp(paragraphCount / 8);
  const sensoryScore = clamp(sensoryHits / 14);
  const concreteActionScore = clamp(concreteActionHits.length / 18);
  const turnScore = clamp(turnHits.length / 5);
  const rhythmScore = averageSentenceLength >= 25 && averageSentenceLength <= 95 ? 1 : 0.65;
  const abstractPenalty = Math.min(0.35, abstractTellingHits.length * 0.035 + (weakEnding ? 0.12 : 0));
  const fillerPenalty = Math.min(0.45, pseudoSceneFillerHits.length * 0.08);
  const surfacePolishPenalty = Math.min(0.4, surfacePolishArtifactHits.length * 0.08);
  const mechanicalDialoguePenalty = Math.min(0.35, Math.max(0, mechanicalDialogueStagingHits.length - 1) * 0.09);
  const humanReadabilityPenalty = Math.min(0.4, humanReadabilityArtifactHits.length * 0.08);
  const score = clamp(
    dialogueScore * 0.22
    + paragraphScore * 0.16
    + sensoryScore * 0.17
    + concreteActionScore * 0.18
    + turnScore * 0.14
    + rhythmScore * 0.13
	    - abstractPenalty
	    - fillerPenalty
	    - surfacePolishPenalty
	    - mechanicalDialoguePenalty
	    - humanReadabilityPenalty,
  );

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.novelness,
    details: {
      dialogueCount,
      paragraphCount,
      sensoryHits,
      concreteActionHitCount: concreteActionHits.length,
      turnHitCount: turnHits.length,
      abstractTellingHits,
      pseudoSceneFillerHits,
      surfacePolishArtifactHits,
      mechanicalDialogueStagingHits,
      humanReadabilityArtifactHits,
      weakEnding,
      sentenceCount: sentenceList.length,
      averageSentenceLength: round3(averageSentenceLength),
    },
  });
}

function evaluateDramaticVariation(text: string): NovelOutputQAMetric {
  const sentenceList = sentences(text);
  const dialogues = quotedDialogues(text);
  const repeatedDialogueLines = countedRepeats(dialogues, 2);
  const repeatedDialogueOpenings = countedRepeats(dialogues.map(dialogueOpening), 3);
  const beatCategoryCounts = sentenceList.reduce<Record<string, number>>((accumulator, sentence) => {
    for (const category of beatCategoriesForSentence(sentence)) {
      accumulator[category] = (accumulator[category] ?? 0) + 1;
    }
    return accumulator;
  }, {});
  const distinctBeatCategories = Object.keys(beatCategoryCounts).length;
  const dominantBeatCount = Math.max(0, ...Object.values(beatCategoryCounts));
  const dominantBeatRate = sentenceList.length === 0 ? 0 : dominantBeatCount / sentenceList.length;
  const dialogueRepeatPenalty = Math.min(
    0.45,
    repeatedDialogueLines.reduce((sum, item) => sum + item.count - 1, 0) * 0.1,
  );
  const openingRepeatPenalty = Math.min(
    0.35,
    repeatedDialogueOpenings.reduce((sum, item) => sum + item.count - 2, 0) * 0.07,
  );
  const beatDiversityScore = clamp(distinctBeatCategories / 5);
  const dominancePenalty = Math.max(0, dominantBeatRate - 0.58) * 0.8;
  const score = clamp(0.25 + beatDiversityScore * 0.55 - dialogueRepeatPenalty - openingRepeatPenalty - dominancePenalty);

  return NovelOutputQAMetricSchema.parse({
    score: round3(score),
    weight: METRIC_WEIGHTS.dramaticVariation,
    details: {
      dialogueCount: dialogues.length,
      repeatedDialogueLines,
      repeatedDialogueOpenings,
      beatCategoryCounts,
      distinctBeatCategories,
      dominantBeatRate: round3(dominantBeatRate),
      dialogueRepeatPenalty: round3(dialogueRepeatPenalty),
      openingRepeatPenalty: round3(openingRepeatPenalty),
      dominancePenalty: round3(dominancePenalty),
    },
  });
}

function issuesFromMetrics(input: {
  text: string;
  metrics: NovelOutputQAReport["metrics"];
}): NovelOutputQAIssue[] {
  const issues: NovelOutputQAIssue[] = [];

  if (input.metrics.metaLeakSafety.score < 1) {
    issues.push({
      code: "meta_leak",
      severity: "error",
      message: "독자용 본문에 내부 source/meta 값이 노출됐다.",
      evidence: (input.metrics.metaLeakSafety.details.leaks as string[] | undefined) ?? [],
    });
  }
  if (input.metrics.sourceCoverage.score < 0.75) {
    issues.push({
      code: "low_source_coverage",
      severity: "warning",
      message: "월드 로그가 본문에 충분히 번역되지 않았다.",
      evidence: ((input.metrics.sourceCoverage.details.uncoveredActionLogIds as string[] | undefined) ?? []).slice(0, 8),
    });
  }
  if (input.metrics.repetitionControl.score < 0.75) {
    const repeats = (input.metrics.repetitionControl.details.repeatedPhrases as Array<{ phrase: string; count: number }> | undefined) ?? [];
    issues.push({
      code: "surface_repetition",
      severity: "warning",
      message: "반복 어구가 많아 문장 표면이 단조롭다.",
      evidence: repeats.slice(0, 5).map((repeat) => `${repeat.phrase} x${repeat.count}`),
    });
  }
  if (input.metrics.sceneSeam.score < 0.75) {
    const transitions = (input.metrics.sceneSeam.details.reportStyleTransitions as string[] | undefined) ?? [];
    issues.push({
      code: "visible_scene_seam",
      severity: "warning",
      message: "scene 전환이 episode 내부 장면보다 보고서식 연결처럼 보인다.",
      evidence: transitions.map((transition) => excerptAround(input.text, transition)).slice(0, 5),
    });
  }
  if (input.metrics.characterAgency.score < 0.75) {
    issues.push({
      code: "weak_character_agency",
      severity: "warning",
      message: "인물의 독립 행동성이 본문에서 약하게 보인다.",
      evidence: [],
    });
  }
  if (input.metrics.sourceStateDeltaGrounding.score < 0.8) {
    issues.push({
      code: "weak_source_state_delta_grounding",
      severity: "warning",
      message: "episode window가 충분한 source state delta에 근거하지 않았다.",
      evidence: [
        `sourceStateDeltaCount=${String(input.metrics.sourceStateDeltaGrounding.details.sourceStateDeltaCount ?? 0)}`,
        `coveredWindowStateDeltaCount=${String(input.metrics.sourceStateDeltaGrounding.details.coveredWindowStateDeltaCount ?? 0)}`,
      ],
    });
  }
  if (input.metrics.treatmentCompliance.score < 0.75) {
    issues.push({
      code: "weak_editorial_treatment_compliance",
      severity: "warning",
      message: "월드 로그 편집 지도에서 길게/짧게 처리하라고 한 장면 분량 계약을 충분히 지키지 못했다.",
      evidence: [
        `treatments=${String((input.metrics.treatmentCompliance.details.treatments as string[] | undefined)?.join(",") ?? "")}`,
        `paragraphs=${String(input.metrics.treatmentCompliance.details.paragraphCount ?? 0)}/${String(input.metrics.treatmentCompliance.details.minimumParagraphs ?? 0)}`,
        `dialogues=${String(input.metrics.treatmentCompliance.details.dialogueCount ?? 0)}/${String(input.metrics.treatmentCompliance.details.minimumDialogues ?? 0)}`,
        `chars=${String(input.metrics.treatmentCompliance.details.characterCount ?? 0)}`,
      ],
    });
  }
  const abstractTellingHits = (input.metrics.novelness.details.abstractTellingHits as string[] | undefined) ?? [];
  const pseudoSceneFillerHits = (input.metrics.novelness.details.pseudoSceneFillerHits as string[] | undefined) ?? [];
  const surfacePolishArtifactHits = (input.metrics.novelness.details.surfacePolishArtifactHits as string[] | undefined) ?? [];
  const mechanicalDialogueStagingHits = (input.metrics.novelness.details.mechanicalDialogueStagingHits as string[] | undefined) ?? [];
  const humanReadabilityArtifactHits = (input.metrics.novelness.details.humanReadabilityArtifactHits as string[] | undefined) ?? [];
  const novelnessDetails = input.metrics.novelness.details as Record<string, unknown>;
  const hasMinimumSceneDensity = Number(novelnessDetails.dialogueCount ?? 0) >= 4
    && Number(novelnessDetails.paragraphCount ?? 0) >= 5
    && Number(novelnessDetails.concreteActionHitCount ?? 0) >= 16
    && Number(novelnessDetails.sensoryHits ?? 0) >= 12
    && Number(novelnessDetails.turnHitCount ?? 0) >= 1
    && abstractTellingHits.length === 0
    && novelnessDetails.weakEnding !== true;
  if (input.metrics.novelness.score < 0.75 && !hasMinimumSceneDensity) {
    issues.push({
      code: "low_novelness",
      severity: "warning",
      message: "본문이 장면 prose로 충분히 밀도 있게 구성되지 않았다.",
      evidence: abstractTellingHits.slice(0, 8),
    });
  }
  if (input.metrics.novelness.score >= 0.75 && abstractTellingHits.length > 0) {
    issues.push({
      code: "abstract_telling_surface",
      severity: "warning",
      message: "장면 prose 안에 해설식 감정/의도 표현이 남아 있다.",
      evidence: abstractTellingHits.slice(0, 8),
    });
  }
  if (pseudoSceneFillerHits.length >= 2) {
    issues.push({
      code: "pseudo_scene_filler",
      severity: "warning",
      message: "사건 전진 없이 침묵/공기/다음 움직임 같은 분위기 표현으로 장면을 채웠다.",
      evidence: pseudoSceneFillerHits.slice(0, 8),
    });
  }
  if (surfacePolishArtifactHits.length > 0) {
    issues.push({
      code: "surface_polish_artifact",
      severity: "warning",
      message: "조사 오류나 deterministic polish 잔재가 독자용 문장에 남아 있다.",
      evidence: surfacePolishArtifactHits.slice(0, 8),
    });
  }
  if (mechanicalDialogueStagingHits.length >= 3) {
    issues.push({
      code: "mechanical_dialogue_staging",
      severity: "warning",
      message: "대사 문단이 같은 무대지시 구문으로 반복되어 소설보다 로그 번역처럼 보인다.",
      evidence: mechanicalDialogueStagingHits.slice(0, 8),
    });
  }
  if (humanReadabilityArtifactHits.length > 0) {
    issues.push({
      code: "human_readability_artifact",
      severity: "warning",
      message: "사람이 읽으면 바로 기계적이라고 느낄 반복 대사/서술 패턴이 남아 있다.",
      evidence: humanReadabilityArtifactHits.slice(0, 8),
    });
  }
  if (input.metrics.dramaticVariation.score < 0.75) {
    const repeatedLines = (input.metrics.dramaticVariation.details.repeatedDialogueLines as Array<{ value: string; count: number }> | undefined) ?? [];
    const repeatedOpenings = (input.metrics.dramaticVariation.details.repeatedDialogueOpenings as Array<{ value: string; count: number }> | undefined) ?? [];
    issues.push({
      code: "low_dramatic_variation",
      severity: "warning",
      message: "대사 시작/장면 박자가 반복되어 episode가 같은 감정 리듬으로 읽힌다.",
      evidence: [
        ...repeatedLines.slice(0, 4).map((item) => `${item.value} x${item.count}`),
        ...repeatedOpenings.slice(0, 4).map((item) => `${item.value}... x${item.count}`),
      ],
    });
  }

  return issues.map((issue) => NovelOutputQAIssueSchema.parse(issue));
}

export function evaluateNovelOutputQA(input: EvaluateNovelOutputQAInput): NovelOutputQAReport {
  const sceneLogs = selectedSceneLogs(input.episodeWindow, input.sceneLogs);
  const actionLogs = selectedActionLogs(input.episodeWindow, input.actionLogs);
  const metrics = {
    sourceCoverage: evaluateSourceCoverage(input.text, actionLogs),
    metaLeakSafety: evaluateMetaLeakSafety(input.text),
    repetitionControl: evaluateRepetitionControl(input.text),
    sceneSeam: evaluateSceneSeam(input.text, sceneLogs),
    characterAgency: evaluateCharacterAgency(input.text, actionLogs),
    sourceStateDeltaGrounding: evaluateSourceStateDeltaGrounding(input.episodeWindow, actionLogs),
    treatmentCompliance: evaluateTreatmentCompliance({
      text: input.text,
      episodeWindow: input.episodeWindow,
      worldLogEditorialMap: input.worldLogEditorialMap,
    }),
    novelness: evaluateNovelness(input.text),
    dramaticVariation: evaluateDramaticVariation(input.text),
  };
  const score = round3(Object.values(metrics).reduce((sum, metric) =>
    sum + metric.score * metric.weight, 0));
  const issues = issuesFromMetrics({ text: input.text, metrics });
  const verdict = metrics.metaLeakSafety.score < 1 || score < 0.6
    ? "fail"
    : score < 0.82 || issues.length > 0
      ? "warn"
      : "pass";

  return NovelOutputQAReportSchema.parse({
    score,
    verdict,
    metrics,
    issues,
  });
}

export function evaluateNovelOutputCorpusQA(input: EvaluateNovelOutputCorpusQAInput): NovelOutputCorpusQAReport {
  const episodes = z.array(NovelOutputCorpusEpisodeSchema).parse(input.episodes)
    .filter((episode) => episode.text.trim().length > 0);
  const episodeCount = episodes.length;
  const openingRepeatThreshold = Math.max(4, Math.ceil(episodeCount * 0.2));
  const endingRepeatThreshold = Math.max(4, Math.ceil(episodeCount * 0.2));
  const allDialogues = episodes.flatMap((episode) => quotedDialogues(episode.text));
  const allGestureSkeletons = episodes.flatMap((episode) => gestureSkeletons(episode.text));
  const dialogueRepeatThreshold = Math.max(5, Math.ceil(allDialogues.length * 0.08));
  const gestureRepeatThreshold = Math.max(6, Math.ceil(allGestureSkeletons.length * 0.06));
  const repeatedOpeningSkeletons = countedEpisodeSkeletonRepeats(
    episodes,
    firstReaderSentence,
    openingRepeatThreshold,
  );
  const repeatedEndingSkeletons = countedEpisodeSkeletonRepeats(
    episodes,
    lastReaderSentence,
    endingRepeatThreshold,
  );
  const repeatedDialogueOpenings = countedRepeats(
    allDialogues.map((dialogue) => sentenceSkeleton(dialogueOpening(dialogue))),
    dialogueRepeatThreshold,
  );
  const repeatedGestureSkeletons = countedRepeats(
    allGestureSkeletons,
    gestureRepeatThreshold,
  );
  const openingPenalty = Math.min(0.3, repeatedOpeningSkeletons.reduce((sum, item) =>
    sum + Math.max(0, item.count - openingRepeatThreshold + 1) * 0.04, 0));
  const endingPenalty = Math.min(0.3, repeatedEndingSkeletons.reduce((sum, item) =>
    sum + Math.max(0, item.count - endingRepeatThreshold + 1) * 0.04, 0));
  const dialoguePenalty = Math.min(0.25, repeatedDialogueOpenings.reduce((sum, item) =>
    sum + Math.max(0, item.count - dialogueRepeatThreshold + 1) * 0.025, 0));
  const gesturePenalty = Math.min(0.25, repeatedGestureSkeletons.reduce((sum, item) =>
    sum + Math.max(0, item.count - gestureRepeatThreshold + 1) * 0.025, 0));
  const score = round3(clamp(1 - openingPenalty - endingPenalty - dialoguePenalty - gesturePenalty));
  const notes: string[] = [];

  if (repeatedOpeningSkeletons.length > 0) {
    notes.push(`반복 opening skeleton ${repeatedOpeningSkeletons[0]!.count}/${episodeCount}`);
  }
  if (repeatedEndingSkeletons.length > 0) {
    notes.push(`반복 ending skeleton ${repeatedEndingSkeletons[0]!.count}/${episodeCount}`);
  }
  if (repeatedDialogueOpenings.length > 0) {
    notes.push(`반복 dialogue opening ${repeatedDialogueOpenings[0]!.count}/${allDialogues.length}`);
  }
  if (repeatedGestureSkeletons.length > 0) {
    notes.push(`반복 gesture skeleton ${repeatedGestureSkeletons[0]!.count}/${allGestureSkeletons.length}`);
  }
  if (notes.length === 0) {
    notes.push("episode 사이에서 opening/ending/dialogue/gesture 반복이 허용 범위 안에 있음");
  }

  return NovelOutputCorpusQAReportSchema.parse({
    score,
    verdict: score < 0.7 ? "fail" : score < 0.86 ? "warn" : "pass",
    episodeCount,
    repeatedOpeningSkeletons,
    repeatedEndingSkeletons,
    repeatedDialogueOpenings,
    repeatedGestureSkeletons,
    notes,
  });
}
