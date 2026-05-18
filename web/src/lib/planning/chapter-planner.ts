import { getAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import { ChapterBlueprintSchema, type ChapterBlueprint, type ArcPlan } from "@/lib/schema/planning";
import type { NovelSeed, PlotPoint } from "@/lib/schema/novel";
import {
  isForeshadowingIntentionallyAbandoned,
  refreshForeshadowVerificationMetadata,
  type ForeshadowHintOccurrence,
  type Foreshadowing,
} from "@/lib/schema/foreshadowing";
import {
  type ForeshadowPayoffKind,
  qualifyForeshadowRegistration,
} from "@/lib/sim/foreshadow-contract";
import type { DirectionDesign } from "@/lib/schema/direction";
import type { TokenUsage } from "@/lib/agents/types";
import { resolveCharacterReference } from "@/lib/schema/character";
import { z } from "zod";

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

/**
 * Regex that checks for at least one Korean proper-noun-like pattern
 * (2+ Hangul chars followed by a particle). Used as a non-blocking quality check.
 */
const KOREAN_NAME_PATTERN = /[가-힣]{2,}[이가은는을를에의과와]/;
const FORESHADOW_NAME_LIMIT = 48;
const FORESHADOW_TOKEN_PATTERN = /[0-9a-zA-Z가-힣]+/g;
const FORESHADOW_TARGET_STOPWORDS = new Set([
  "나중에",
  "후반부",
  "후반에",
  "훗날",
  "결국",
  "비로소",
  "다시",
  "같은",
  "동일한",
  "숨긴",
  "숨기고",
  "숨겼다",
  "숨겼다는",
  "드러난",
  "드러난다",
  "드러나고",
  "밝혀진",
  "밝혀진다",
  "밝혀지고",
  "확인",
  "확인한다",
  "확인했다",
  "의심",
  "의심한다",
  "단서",
  "진실",
  "사실",
  "정체",
  "의미",
  "이유",
  "원인",
  "future",
  "event",
  "secret",
  "cause",
  "later",
  "reveal",
  "revealed",
]);
const KOREAN_PARTICLE_SUFFIXES = [
  "이라고",
  "라거나",
  "에게서",
  "에서는",
  "으로는",
  "이지만",
  "하지만",
  "까지는",
  "부터는",
  "처럼은",
  "에게",
  "한테",
  "에서",
  "으로",
  "로서",
  "로는",
  "보다",
  "처럼",
  "까지",
  "부터",
  "이고",
  "이며",
  "이라",
  "와의",
  "과의",
  "의",
  "이",
  "가",
  "은",
  "는",
  "을",
  "를",
  "와",
  "과",
  "에",
  "로",
  "도",
  "만",
];

function formatEpisodeId(chapterNumber: number): string {
  return `ep_${String(chapterNumber).padStart(3, "0")}`;
}

function parseEpisodeChapter(episodeId: string | undefined): number | null {
  if (!episodeId) return null;
  const match = /^ep_(\d+)$/.exec(episodeId);
  if (!match) return null;

  return Number.parseInt(match[1] || "0", 10);
}

function formatSceneId(chapterNumber: number, sceneIndex: number): string {
  return `scene_${String(chapterNumber).padStart(3, "0")}_${String(sceneIndex + 1).padStart(2, "0")}`;
}

function toForeshadowId(chapterNumber: number, sceneIndex: number, pointIndex: number): string {
  return `fs_auto_ch${String(chapterNumber).padStart(3, "0")}_sc${String(sceneIndex + 1).padStart(2, "0")}_kp${String(pointIndex + 1).padStart(2, "0")}`;
}

function normalizeWhitespace(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function parseSceneTiming(sceneId: string | undefined): { chapter: number; scene: number } | null {
  if (!sceneId) return null;
  const match = /^scene_(\d+)_(\d+)$/.exec(sceneId);
  if (!match) return null;

  return {
    chapter: Number.parseInt(match[1] || "0", 10),
    scene: Number.parseInt(match[2] || "0", 10),
  };
}

function compactLabel(value: string, maxLength = FORESHADOW_NAME_LIMIT): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripKoreanParticle(token: string): string {
  for (const suffix of KOREAN_PARTICLE_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function tokenizeForeshadowText(value: string): string[] {
  const matches = normalizeWhitespace(value)
    .toLowerCase()
    .match(FORESHADOW_TOKEN_PATTERN);
  if (!matches) return [];

  const unique = new Set<string>();
  for (const match of matches) {
    const token = stripKoreanParticle(match);
    if (token.length >= 2) {
      unique.add(token);
    }
  }
  return [...unique];
}

function countSharedTokens(left: string, right: string): number {
  const leftTokens = tokenizeForeshadowText(left);
  const rightTokens = new Set(tokenizeForeshadowText(right));
  let shared = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared;
}

function hasTokenOverlap(
  left: string,
  right: string,
  minimumShared: number,
  minimumCoverage: number,
): boolean {
  const leftTokens = tokenizeForeshadowText(left);
  const rightTokens = tokenizeForeshadowText(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const rightSet = new Set(rightTokens);
  let shared = 0;
  for (const token of leftTokens) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }

  const coverage = shared / Math.min(leftTokens.length, rightTokens.length);
  return shared >= minimumShared && coverage >= minimumCoverage;
}

function buildCanonicalForeshadowTarget(...values: Array<string | undefined>): string {
  const unique = new Set<string>();

  for (const value of values) {
    for (const token of tokenizeForeshadowText(value || "")) {
      if (FORESHADOW_TARGET_STOPWORDS.has(token)) continue;
      unique.add(token);
    }
  }

  if (unique.size === 0) {
    return normalizeWhitespace(values.find((value) => normalizeWhitespace(value).length > 0));
  }

  return [...unique].sort().join(" ");
}

function hasCanonicalTargetOverlap(
  existing: Foreshadowing,
  canonicalTarget: string,
): boolean {
  if (!canonicalTarget) return false;

  const existingCanonicalTarget = buildCanonicalForeshadowTarget(
    existing.canonical_target,
    existing.description,
    existing.name,
    existing.origin?.source_span.excerpt,
  );

  if (!existingCanonicalTarget) return false;

  return hasTokenOverlap(canonicalTarget, existingCanonicalTarget, 2, 0.5)
    || countSharedTokens(canonicalTarget, existingCanonicalTarget) >= 3;
}

function mergeCanonicalTarget(
  existingTarget: string | undefined,
  candidateTarget: string,
): string {
  return buildCanonicalForeshadowTarget(existingTarget, candidateTarget);
}

function getStructuredPlotPoint(point: PlotPoint): Exclude<PlotPoint, string> | null {
  return typeof point === "string" ? null : point;
}

function buildSceneEvidence(scene: ChapterBlueprint["scenes"][number]): string {
  return [
    scene.purpose,
    ...(scene.must_reveal || []),
    scene.how,
    scene.triggered_by,
    scene.leads_to,
  ]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean)
    .join(" | ");
}

function locateSourceSpan(source: string, excerpt: string): {
  start_offset: number;
  end_offset: number;
  excerpt: string;
} {
  const haystack = normalizeWhitespace(source);
  const needle = normalizeWhitespace(excerpt);
  const start = needle ? haystack.indexOf(needle) : -1;
  const safeStart = start >= 0 ? start : 0;
  const safeExcerpt = needle || haystack.slice(0, Math.max(1, Math.min(haystack.length, 120)));
  const safeEnd = Math.min(haystack.length || safeExcerpt.length, safeStart + Math.max(safeExcerpt.length, 1));

  return {
    start_offset: safeStart,
    end_offset: Math.max(safeEnd, safeStart + 1),
    excerpt: safeExcerpt,
  };
}

function inferPayoffKind(point: Exclude<PlotPoint, string>): ForeshadowPayoffKind {
  const corpus = [
    point.what,
    point.why,
    point.consequence,
    point.prerequisite,
  ]
    .map((value) => normalizeWhitespace(value))
    .join(" ")
    .toLowerCase();

  if (/(정체|identity|누구|진짜)/u.test(corpus)) return "identity";
  if (/(관계|약혼|결혼|배신|romance|relationship)/u.test(corpus)) return "relationship";
  if (/(유물|반지|검|열쇠|문양|증표|장부|object)/u.test(corpus)) return "object";
  if (/(위협|암살|추격|위기|threat|죽)/u.test(corpus)) return "threat";
  if (/(약속|맹세|promise)/u.test(corpus)) return "promise";
  if (/(반전|뒤집|reversal)/u.test(corpus)) return "reversal";
  return "reveal";
}

function findQualifyingSceneIndex(
  blueprint: ChapterBlueprint,
  point: Exclude<PlotPoint, string>,
): number {
  const anchors = [
    normalizeWhitespace(point.what),
    normalizeWhitespace(point.why),
    normalizeWhitespace(point.prerequisite),
  ].filter(Boolean);

  const matchedIndex = blueprint.scenes.findIndex((scene) => {
    const evidence = buildSceneEvidence(scene);
    return anchors.some((anchor) => anchor && evidence.includes(anchor));
  });

  return matchedIndex >= 0 ? matchedIndex : 0;
}

function hasForeshadowingAction(
  blueprint: ChapterBlueprint,
  id: string,
): boolean {
  return blueprint.foreshadowing_actions.some(
    (action) => action.id === id && action.action === "plant",
  );
}

function isSameForeshadowingPromise(
  existing: Foreshadowing,
  name: string,
  promise: string,
  revealAt: number | null,
): boolean {
  return normalizeWhitespace(existing.name) === normalizeWhitespace(name)
    && normalizeWhitespace(existing.description) === normalizeWhitespace(promise)
    && (existing.reveal_at ?? null) === revealAt;
}

function isSameForeshadowingOrigin(
  existing: Foreshadowing,
  sceneId: string,
  chapterNumber: number,
): boolean {
  return existing.planted_at === chapterNumber && existing.origin?.scene_id === sceneId;
}

function compareForeshadowPresentationTiming(
  existing: Foreshadowing,
  chapterNumber: number,
  sceneId: string,
): number {
  const candidateTiming = parseSceneTiming(sceneId) ?? {
    chapter: chapterNumber,
    scene: Number.POSITIVE_INFINITY,
  };
  const existingTiming = parseSceneTiming(existing.origin?.scene_id) ?? {
    chapter: existing.planted_at,
    scene: Number.POSITIVE_INFINITY,
  };

  if (candidateTiming.chapter !== existingTiming.chapter) {
    return candidateTiming.chapter - existingTiming.chapter;
  }

  return candidateTiming.scene - existingTiming.scene;
}

function hasEarlierRegisteredPresentation(
  existing: Foreshadowing,
  chapterNumber: number,
  sceneId: string,
): boolean {
  return compareForeshadowPresentationTiming(existing, chapterNumber, sceneId) > 0;
}

function isLaterMentionTiming(
  existing: Foreshadowing,
  chapterNumber: number,
  sceneId: string,
): boolean {
  return compareForeshadowPresentationTiming(existing, chapterNumber, sceneId) > 0;
}

function mergeDistinctText(primary: string, supplemental: string): string {
  const normalizedPrimary = normalizeWhitespace(primary);
  const normalizedSupplemental = normalizeWhitespace(supplemental);
  if (!normalizedSupplemental) return normalizedPrimary;
  if (!normalizedPrimary) return normalizedSupplemental;
  if (normalizedPrimary === normalizedSupplemental) return normalizedPrimary;

  if (
    normalizedPrimary.includes(normalizedSupplemental)
    || normalizedSupplemental.includes(normalizedPrimary)
  ) {
    return normalizedPrimary.length >= normalizedSupplemental.length
      ? normalizedPrimary
      : normalizedSupplemental;
  }

  return `${normalizedPrimary} / ${normalizedSupplemental}`;
}

function mergeHintChapter(existing: Foreshadowing, chapterNumber: number): void {
  if (!existing.hints_at.includes(chapterNumber)) {
    existing.hints_at.push(chapterNumber);
    existing.hints_at.sort((left, right) => left - right);
  }

  existing.hint_count = Math.max(existing.hint_count, existing.hints_at.length);
}

function recordLinkedHintOccurrence(
  existing: Foreshadowing,
  occurrence: ForeshadowHintOccurrence,
): void {
  if (!Array.isArray(existing.linked_hint_occurrences)) {
    existing.linked_hint_occurrences = [];
  }

  existing.linked_hint_occurrences.push(occurrence);
  refreshForeshadowVerificationMetadata(existing);
}

function listForeshadowSourceOccurrences(
  foreshadowing: Foreshadowing,
): ForeshadowHintOccurrence[] {
  const occurrences: ForeshadowHintOccurrence[] = [];
  if (foreshadowing.origin) {
    occurrences.push(foreshadowing.origin);
  }
  if (Array.isArray(foreshadowing.linked_hint_occurrences)) {
    occurrences.push(...foreshadowing.linked_hint_occurrences);
  }
  return occurrences;
}

function compareHintOccurrenceTiming(
  existing: Foreshadowing,
  occurrence: ForeshadowHintOccurrence,
): number {
  const occurrenceTiming = parseSceneTiming(occurrence.scene_id);
  if (occurrenceTiming) {
    return compareForeshadowPresentationTiming(
      existing,
      occurrenceTiming.chapter,
      occurrence.scene_id,
    );
  }

  const occurrenceChapter = parseEpisodeChapter(occurrence.episode_id)
    ?? existing.planted_at;
  return occurrenceChapter - existing.planted_at;
}

function appendLinkedHintProvenance(
  existing: Foreshadowing,
  occurrence: ForeshadowHintOccurrence,
): void {
  if (compareHintOccurrenceTiming(existing, occurrence) <= 0) {
    return;
  }

  recordLinkedHintOccurrence(existing, occurrence);
  const occurrenceChapter = parseEpisodeChapter(occurrence.episode_id)
    ?? parseSceneTiming(occurrence.scene_id)?.chapter;
  if (occurrenceChapter !== null && occurrenceChapter !== undefined) {
    mergeHintChapter(existing, occurrenceChapter);
  }
}

function getForeshadowPresentationTiming(
  foreshadowing: Foreshadowing,
): { chapter: number; scene: number } {
  return parseSceneTiming(foreshadowing.origin?.scene_id) ?? {
    chapter: foreshadowing.planted_at,
    scene: Number.POSITIVE_INFINITY,
  };
}

function mergeRevealChapter(
  existingRevealAt: number | null,
  candidateRevealAt: number | null,
): number | null {
  if (existingRevealAt === null) return candidateRevealAt;
  if (candidateRevealAt === null) return existingRevealAt;
  return Math.min(existingRevealAt, candidateRevealAt);
}

function mergeMatchedForeshadowing(
  existing: Foreshadowing,
  candidate: {
    chapterNumber: number;
    sceneId: string;
    foreshadowName: string;
    canonicalTarget: string;
    promise: string;
    revealAt: number | null;
    occurrence: ForeshadowHintOccurrence;
  },
): void {
  if (
    normalizeWhitespace(candidate.foreshadowName).length > normalizeWhitespace(existing.name).length
    && hasTokenOverlap(candidate.foreshadowName, existing.name, 2, 0.5)
  ) {
    existing.name = compactLabel(candidate.foreshadowName);
  }

  existing.description = mergeDistinctText(existing.description, candidate.promise);
  existing.canonical_target = mergeCanonicalTarget(
    existing.canonical_target,
    candidate.canonicalTarget,
  );

  existing.reveal_at = mergeRevealChapter(existing.reveal_at ?? null, candidate.revealAt);

  if (isLaterMentionTiming(existing, candidate.chapterNumber, candidate.sceneId)) {
    appendLinkedHintProvenance(existing, candidate.occurrence);
  }

  refreshForeshadowVerificationMetadata(existing);
}

function compareForeshadowOrigins(
  left: Foreshadowing,
  right: Foreshadowing,
): number {
  const leftTiming = getForeshadowPresentationTiming(left);
  const rightTiming = getForeshadowPresentationTiming(right);
  if (leftTiming.chapter !== rightTiming.chapter) {
    return leftTiming.chapter - rightTiming.chapter;
  }

  return leftTiming.scene - rightTiming.scene;
}

function mergeExistingForeshadowing(
  primary: Foreshadowing,
  duplicate: Foreshadowing,
): void {
  if (
    normalizeWhitespace(duplicate.name).length > normalizeWhitespace(primary.name).length
    && hasTokenOverlap(duplicate.name, primary.name, 2, 0.5)
  ) {
    primary.name = compactLabel(duplicate.name);
  }

  primary.description = mergeDistinctText(primary.description, duplicate.description);
  primary.canonical_target = mergeCanonicalTarget(
    primary.canonical_target,
    duplicate.canonical_target ?? "",
  );
  primary.reveal_at = mergeRevealChapter(
    primary.reveal_at ?? null,
    duplicate.reveal_at ?? null,
  );

  for (const occurrence of listForeshadowSourceOccurrences(duplicate)) {
    appendLinkedHintProvenance(primary, occurrence);
  }

  refreshForeshadowVerificationMetadata(primary);
}

function markMergedForeshadowingAsIntentionallyAbandoned(
  primary: Foreshadowing,
  duplicate: Foreshadowing,
): void {
  duplicate.lifecycle = "intentionally_abandoned";
  duplicate.abandonment_marker = normalizeWhitespace(duplicate.abandonment_marker)
    || `intentional-abandonment:merged-into:${primary.id}`;
  duplicate.abandonment_reason = normalizeWhitespace(duplicate.abandonment_reason)
    || `Merged into canonical foreshadow thread ${primary.id} during blueprint consolidation.`;
  duplicate.status = "retired";

  refreshForeshadowVerificationMetadata(duplicate);
}

function isForeshadowRestatementReference(
  existing: Foreshadowing,
  detail: string,
  promise: string,
  revealAt: number | null,
): boolean {
  if ((existing.reveal_at ?? null) !== revealAt) return false;

  const detailCorpus = [
    existing.name,
    existing.origin?.source_span.excerpt,
    existing.description,
  ]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  const combinedCorpus = detailCorpus.join(" ");
  if (!combinedCorpus) return false;

  const detailMatchesExisting = detailCorpus.some((entry) => hasTokenOverlap(detail, entry, 2, 0.5));
  if (!detailMatchesExisting) return false;

  const promiseMatchesExisting = hasTokenOverlap(
    `${detail} ${promise}`,
    combinedCorpus,
    3,
    0.45,
  );
  if (promiseMatchesExisting) return true;

  const sharedPromiseTokens = countSharedTokens(promise, existing.description);
  return sharedPromiseTokens >= 2 && hasTokenOverlap(detail, combinedCorpus, 2, 0.5);
}

function isLaterSceneMentionOfExisting(
  existing: Foreshadowing,
  detail: string,
  chapterNumber: number,
  sceneId: string,
  revealAt: number | null,
): boolean {
  if ((existing.reveal_at ?? null) !== revealAt) return false;
  if (!hasEarlierRegisteredPresentation(existing, chapterNumber, sceneId)) return false;

  const originExcerpt = normalizeWhitespace(existing.origin?.source_span.excerpt);
  const existingName = normalizeWhitespace(existing.name);
  const corpus = [originExcerpt, existingName]
    .filter(Boolean)
    .join(" ");

  if (!corpus) return false;

  return hasTokenOverlap(detail, corpus, 2, 0.5)
    || countSharedTokens(detail, corpus) >= 2;
}

function findExistingForeshadowings(
  seed: NovelSeed,
  foreshadowingId: string,
  sceneId: string,
  chapterNumber: number,
  detail: string,
  name: string,
  canonicalTarget: string,
  promise: string,
  revealAt: number | null,
): Foreshadowing[] {
  return seed.foreshadowing.filter((existing) => {
    if (isForeshadowingIntentionallyAbandoned(existing)) {
      return false;
    }
    if (existing.id === foreshadowingId) return true;
    if (isSameForeshadowingOrigin(existing, sceneId, chapterNumber)) {
      return isSameForeshadowingPromise(existing, name, promise, revealAt);
    }
    return isSameForeshadowingPromise(existing, name, promise, revealAt)
      || hasCanonicalTargetOverlap(existing, canonicalTarget)
      || isForeshadowRestatementReference(existing, detail, promise, revealAt)
      || isLaterSceneMentionOfExisting(
        existing,
        detail,
        chapterNumber,
        sceneId,
        revealAt,
      );
  });
}

function collapseMatchingForeshadowings(
  seed: NovelSeed,
  matches: Foreshadowing[],
): Foreshadowing {
  const orderedMatches = [...matches].sort(compareForeshadowOrigins);
  const primary = orderedMatches[0]!;
  const duplicates = orderedMatches.slice(1);
  if (duplicates.length === 0) {
    return primary;
  }

  for (const duplicate of duplicates) {
    mergeExistingForeshadowing(primary, duplicate);
    markMergedForeshadowingAsIntentionallyAbandoned(primary, duplicate);
  }

  return primary;
}

function registerPlannedForeshadowing(
  seed: NovelSeed,
  blueprint: ChapterBlueprint,
): void {
  blueprint.key_points.forEach((point, pointIndex) => {
    const structuredPoint = getStructuredPlotPoint(point);
    if (!structuredPoint || structuredPoint.reveal !== "delayed") return;

    const sceneIndex = findQualifyingSceneIndex(blueprint, structuredPoint);
    const scene = blueprint.scenes[sceneIndex];
    if (!scene) return;

    const chapterNumber = blueprint.chapter_number;
    const sceneId = formatSceneId(chapterNumber, sceneIndex);
    const foreshadowingId = toForeshadowId(chapterNumber, sceneIndex, pointIndex);
    const primaryDetail = normalizeWhitespace(structuredPoint.what);
    if (!primaryDetail) return;
    const foreshadowName = compactLabel(primaryDetail);

    const standoutReason = normalizeWhitespace(structuredPoint.why)
      || normalizeWhitespace(structuredPoint.consequence)
      || normalizeWhitespace(scene.leads_to)
      || normalizeWhitespace(scene.purpose);
    const promise = normalizeWhitespace(structuredPoint.why)
      || normalizeWhitespace(structuredPoint.consequence)
      || `${primaryDetail}의 숨겨진 원인과 결과가 드러난다.`;
    const impliedQuestion = normalizeWhitespace(blueprint.curiosity_hook)
      || `${primaryDetail}의 진짜 의미와 배후는 무엇인가?`;
    const canonicalTarget = buildCanonicalForeshadowTarget(
      promise,
      normalizeWhitespace(structuredPoint.consequence),
      impliedQuestion,
      primaryDetail,
    );
    const plausibilityBasis = normalizeWhitespace(structuredPoint.caused_by)
      ? `${primaryDetail}은(는) ${normalizeWhitespace(structuredPoint.caused_by)}의 직접적 여파로 제시되어 후속 설명이 자연스럽다.`
      : `${primaryDetail}이(가) ${standoutReason}와 함께 제시되어 후속 설명이나 공개를 예고한다.`;

    const evidenceEntries = [
      ...scene.must_reveal.map((entry) => normalizeWhitespace(entry)),
      primaryDetail,
      normalizeWhitespace(scene.purpose),
    ].filter(Boolean);
    const sceneEvidence = buildSceneEvidence(scene);
    const anchorExcerpt = evidenceEntries[0] || primaryDetail;
    const occurrence = {
      episode_id: formatEpisodeId(chapterNumber),
      scene_id: sceneId,
      source_span: locateSourceSpan(sceneEvidence, anchorExcerpt),
    };

    const qualification = qualifyForeshadowRegistration({
      event_id: `${sceneId}_kp${pointIndex + 1}`,
      chapter: chapterNumber,
      scene_id: sceneId,
      event_summary: normalizeWhitespace(scene.purpose) || primaryDetail,
      introductions: [
        {
          subject: compactLabel(primaryDetail, 24),
          detail: primaryDetail,
          why_it_stands_out: standoutReason,
        },
      ],
      implied_question: impliedQuestion,
      deferred_payoff: {
        kind: inferPayoffKind(structuredPoint),
        promise,
        earliest_chapter: structuredPoint.reveal_at,
      },
      plausibility_basis: plausibilityBasis,
      evidence: evidenceEntries,
    });

    if (!qualification.qualifies || !qualification.contract) return;
    const matchingForeshadowings = findExistingForeshadowings(
      seed,
      foreshadowingId,
      sceneId,
      chapterNumber,
      primaryDetail,
      foreshadowName,
      canonicalTarget,
      promise,
      structuredPoint.reveal_at ?? null,
    );
    const existingForeshadowing = matchingForeshadowings.length > 0
      ? collapseMatchingForeshadowings(seed, matchingForeshadowings)
      : undefined;
    if (existingForeshadowing) {
      mergeMatchedForeshadowing(existingForeshadowing, {
        chapterNumber,
        sceneId,
        foreshadowName: foreshadowName,
        canonicalTarget,
        promise: qualification.contract.deferred_payoff.promise,
        revealAt: structuredPoint.reveal_at ?? null,
        occurrence,
      });
      if (
        isSameForeshadowingOrigin(existingForeshadowing, sceneId, chapterNumber)
        && !hasForeshadowingAction(blueprint, existingForeshadowing.id)
      ) {
        blueprint.foreshadowing_actions.push({ id: existingForeshadowing.id, action: "plant" });
      }
      return;
    }

    seed.foreshadowing.push(refreshForeshadowVerificationMetadata({
      id: foreshadowingId,
      name: foreshadowName,
      description: qualification.contract.deferred_payoff.promise,
      canonical_target: canonicalTarget,
      importance: "normal",
      planted_at: chapterNumber,
      hints_at: [],
      reveal_at: structuredPoint.reveal_at ?? null,
      origin: {
        ...occurrence,
      },
      linked_hint_occurrences: [],
      status: "pending",
      hint_count: 0,
      resolution: {
        status: "unresolved",
        cause: {
          revealed: false,
          chapter: null,
          evidence: [],
        },
        identity: {
          revealed: false,
          chapter: null,
          evidence: [],
        },
        consequence: {
          revealed: false,
          chapter: null,
          evidence: [],
        },
      },
    }));

    if (!hasForeshadowingAction(blueprint, foreshadowingId)) {
      blueprint.foreshadowing_actions.push({ id: foreshadowingId, action: "plant" });
    }
  });
}

function normalizeCharacterRefs(
  refs: string[] | undefined,
  seed: NovelSeed,
  contextLabel: string,
): string[] {
  if (!refs || refs.length === 0) return [];

  const normalized: string[] = [];
  for (const ref of refs) {
    const resolved = resolveCharacterReference(ref, seed.characters);
    if (!resolved) {
      console.warn(`[chapter-planner] ${contextLabel}: 알 수 없는 캐릭터 참조 "${ref}" 제거`);
      continue;
    }
    if (!normalized.includes(resolved.id)) {
      normalized.push(resolved.id);
    }
  }
  return normalized;
}

export async function generateChapterBlueprints(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
  previousChapterEnding?: string,
  endingSceneState?: {
    time_of_day: string;
    location: string;
    characters_present: string[];
    ongoing_action: string;
    unresolved_tension: string;
  } | null,
  targetChapter?: number,
  directionDesign?: DirectionDesign,
  previousRevealedFacts?: Array<{ chapter: number; content: string; type: string }>,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries, previousChapterEnding, endingSceneState, targetChapter, directionDesign, previousRevealedFacts);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 4000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}-ch${targetChapter ?? arc.start_chapter}`,
  });

  // Post-validation
  for (const bp of result.data.chapter_blueprints) {
    // Warn if scene purposes lack Korean names
    for (const scene of bp.scenes) {
      scene.characters = normalizeCharacterRefs(
        scene.characters,
        seed,
        `${bp.chapter_number}화 scene.characters`,
      );

      const dialogueTurns = (scene as { dialogue_turns?: Array<{ speaker: string; intent: string }> }).dialogue_turns;
      if (dialogueTurns) {
        for (const turn of dialogueTurns) {
          const resolvedSpeaker = resolveCharacterReference(turn.speaker, seed.characters);
          if (resolvedSpeaker) {
            turn.speaker = resolvedSpeaker.name;
          }
        }
      }

      if (!KOREAN_NAME_PATTERN.test(scene.purpose)) {
        console.warn(
          `[chapter-planner] 경고: ${bp.chapter_number}화 씬 purpose에 한국어 인물명이 없습니다: "${scene.purpose.slice(0, 60)}..."`,
        );
      }

      // Remove characters who shouldn't appear yet (introduction_chapter > this chapter)
      const before = scene.characters.length;
      scene.characters = scene.characters.filter((charId) => {
        const seedChar = seed.characters.find((c) => c.id === charId);
        if (seedChar && bp.chapter_number < seedChar.introduction_chapter) {
          console.log(
            `[chapter-planner] ${bp.chapter_number}화 씬에서 ${seedChar.name}(${charId}) 제거 — ${seedChar.introduction_chapter}화 등장 예정`,
          );
          return false;
        }
        return true;
      });
      if (scene.characters.length === 0 && before > 0) {
        // Don't leave a scene with no characters — add the protagonist
        const mc = seed.characters.find((c) => c.role === "주인공" || c.role === "protagonist");
        if (mc) scene.characters.push(mc.id);
      }
    }

    // Also filter characters_involved at chapter level
    bp.characters_involved = normalizeCharacterRefs(
      bp.characters_involved,
      seed,
      `${bp.chapter_number}화 characters_involved`,
    ).filter((charId) => {
      const seedChar = seed.characters.find((c) => c.id === charId);
      return !seedChar || bp.chapter_number >= seedChar.introduction_chapter;
    });


    const romanceCounterpart = typeof (bp as { romance_counterpart?: unknown }).romance_counterpart === "string"
      ? resolveCharacterReference((bp as { romance_counterpart: string }).romance_counterpart, seed.characters)
      : undefined;
    if (romanceCounterpart && bp.chapter_number >= romanceCounterpart.introduction_chapter) {
      if (!bp.characters_involved.includes(romanceCounterpart.id)) {
        bp.characters_involved.push(romanceCounterpart.id);
      }
      if ((bp as { romance_thread_advances?: boolean }).romance_thread_advances && bp.scenes.length > 0) {
        const targetScene = bp.scenes[0];
        if (!targetScene.characters.includes(romanceCounterpart.id)) {
          targetScene.characters.push(romanceCounterpart.id);
        }
      }
    }

    // Flow key_points.why → scene must_reveal (connect planning layers)
    const outline = seed.chapter_outlines.find((o) => o.chapter_number === bp.chapter_number);
    const extOutline = !outline
      ? seed.extended_outlines?.find((o) => o.chapter_number === bp.chapter_number)
      : undefined;

    if (outline?.characters_involved?.length) {
      const requiredCharacters = normalizeCharacterRefs(
        outline.characters_involved,
        seed,
        `${bp.chapter_number}화 outline.characters_involved`,
      ).filter((charId) => {
        const seedChar = seed.characters.find((c) => c.id === charId);
        return !seedChar || bp.chapter_number >= seedChar.introduction_chapter;
      });
      for (const charId of requiredCharacters) {
        if (!bp.characters_involved.includes(charId)) {
          bp.characters_involved.push(charId);
        }
      }
    }

    // For extended outlines without key_points, inject the one_liner as context
    if (!outline && extOutline && bp.scenes.length > 0 && !bp.scenes[0].must_reveal?.length) {
      bp.scenes[0].must_reveal = bp.scenes[0].must_reveal || [];
      bp.scenes[0].must_reveal.push(extOutline.one_liner);
    }

    if (outline && outline.key_points.length > 0) {
      const reveals: string[] = [];
      for (const point of outline.key_points) {
        if (typeof point === "string") {
          reveals.push(point);
        } else {
          // Structured PlotPoint: flow "what" to must_reveal
          // For "immediate", also flow "why"
          reveals.push(point.what);
          if (point.reveal === "immediate" && point.why) {
            reveals.push(point.why);
          }
        }
      }
      // Distribute reveals across scenes (first scene gets most)
      if (bp.scenes.length > 0 && reveals.length > 0) {
        for (let si = 0; si < bp.scenes.length; si++) {
          if (!bp.scenes[si].must_reveal) bp.scenes[si].must_reveal = [];
        }
        for (let ri = 0; ri < reveals.length; ri++) {
          const targetScene = Math.min(ri, bp.scenes.length - 1);
          bp.scenes[targetScene].must_reveal!.push(reveals[ri]);
        }
      }
    }

    registerPlannedForeshadowing(seed, bp);
  }

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
