import type { NovelSeed } from "@/lib/schema/novel";
import type { WorldBrain } from "./world-brain";
import type { SchemeRuntimeState } from "./scheme-engine";

/**
 * 역전 모드의 "오늘의 무대 상황판" — chapter_outlines 없는 얇은 시드에서
 * getChapterFrame 을 대체하는 결정적 합성기.
 * spec: docs/superpowers/specs/2026-06-08-outline-inversion-design.md §4
 *
 * 구조적 보증: 출력 타입에 keyPoints 가 존재하지 않는다 — 합성 프레임은
 * 분위기(긴장도)·등장·맥락만 줄 수 있고 "사건 내용"은 줄 수 없다.
 * 사건의 유일한 원천은 agent-tick (Planner + scheme).
 */
export interface SynthesizedFrame {
  /** 맥락 설명 (사건 지시 아님) — 활성 scheme 단계 goal + arc 라벨 합성. */
  oneLiner: string;
  /** 1..10 결정적 도출. */
  tensionLevel: number;
  characterIds: string[];
  threadIds: string[];
  /** act 위치 + scheme 단계에서 도출한 장면 목적 힌트. */
  scenePurposeHint?: string;
}

const MAX_FRAME_CHARACTERS = 5;

function activeStageOf(
  brain: WorldBrain,
  states: ReadonlyMap<string, SchemeRuntimeState>,
  schemerId: string,
) {
  const state = states.get(schemerId);
  const scheme = brain.characterMinds[schemerId]?.scheme;
  if (!state || !scheme) return undefined;
  if (state.status === "completed" || state.status === "aborted") return undefined;
  return { scheme, state, stage: scheme.stages[state.currentStageIndex] };
}

export function synthesizeChapterFrame(input: {
  seed: NovelSeed;
  brain: WorldBrain;
  chapter: number;
  totalChapters: number;
  schemeStates: ReadonlyMap<string, SchemeRuntimeState>;
}): SynthesizedFrame {
  const { seed, brain, chapter, totalChapters, schemeStates } = input;

  // ── 활성 scheme 단계 수집 (시드 순서 = 결정적) ────────────────────────────
  const activeStages = [...schemeStates.keys()]
    .map((schemerId) => ({ schemerId, active: activeStageOf(brain, schemeStates, schemerId) }))
    .filter((entry) => entry.active?.stage !== undefined);

  // ── tensionLevel: 기본 5 + scheme flow + 복선 reveal + act 위치, 1..10 클램프 ──
  let schemeFlow = 0;
  for (const { active } of activeStages) {
    const stage = active!.stage!;
    const flow = stage.tension_flow;
    const bonus = flow === "release_satisfaction"
      ? 3
      : flow === "build_frustration"
        ? 1 + Math.min(active!.state.currentStageIndex, 1)
        : 0;
    schemeFlow = Math.max(schemeFlow, bonus);
  }
  const revealBonus = seed.foreshadowing.some((f) => f.reveal_at === chapter) ? 1 : 0;
  const actBonus = totalChapters > 0 && chapter / totalChapters > 0.75 ? 1 : 0;
  const tensionLevel = Math.max(1, Math.min(10, 5 + schemeFlow + revealBonus + actBonus));

  // ── characterIds: scheme 관련자 우선 → introduced 순으로 채움 ────────────
  const introduced = seed.characters
    .filter((character) => character.introduction_chapter <= chapter)
    .map((character) => character.id);
  const introducedSet = new Set(introduced);
  const ordered: string[] = [];
  const push = (id: string | undefined) => {
    if (id && introducedSet.has(id) && !ordered.includes(id)) ordered.push(id);
  };
  for (const { schemerId, active } of activeStages) {
    push(schemerId);
    push(active!.scheme.target);
    for (const accomplice of active!.scheme.accomplices) push(accomplice.id);
  }
  for (const id of introduced) {
    if (ordered.length >= MAX_FRAME_CHARACTERS) break;
    push(id);
  }
  const characterIds = ordered.slice(0, MAX_FRAME_CHARACTERS);

  // ── oneLiner: arc 라벨 + 활성 단계 goal (맥락 설명, 사건 지시 아님) ───────
  const arc = seed.arcs.find((candidate) =>
    candidate.start_chapter <= chapter && chapter <= candidate.end_chapter,
  );
  const stageGoals = activeStages
    .map(({ active }) => active!.stage!.goal)
    .filter(Boolean);
  const arcLabel = arc?.name ?? arc?.summary ?? seed.logline;
  const oneLiner = stageGoals.length > 0
    ? `${arcLabel} — ${stageGoals.join(" / ")}`
    : arcLabel;

  // ── scenePurposeHint: 단계 전술 성격 + 복선에서 도출 ─────────────────────
  let scenePurposeHint: string | undefined;
  if (revealBonus > 0) {
    scenePurposeHint = "foreshadowing";
  } else if (activeStages.some(({ active }) => active!.stage!.tension_flow === "release_satisfaction")) {
    scenePurposeHint = "advance_plot";
  } else if (activeStages.some(({ active }) =>
    active!.stage!.tactics.some((t) => t === "sabotage" || t === "take_physical"))) {
    scenePurposeHint = "information_discovery";
  } else if (activeStages.length > 0) {
    scenePurposeHint = "relationship_probe";
  } else {
    scenePurposeHint = "establish_state";
  }

  return {
    oneLiner,
    tensionLevel,
    characterIds,
    threadIds: [],
    scenePurposeHint,
  };
}
