/**
 * Centralized narrative rules — single source of truth for all writing policies.
 *
 * Every rule that appears in prompts, evaluators, or repair instructions should
 * be defined here. Consumers import helpers instead of hardcoding values.
 *
 * Migration is incremental: new consumers use this file; existing ones will be
 * migrated over time.
 */

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export interface NarrativeRule {
  id: string;
  description: string;
  promptText?: string;
  evaluatorKey?: string;
  penalty?: number;
  maxPerChapter?: number;
  maxRatio?: number;
  targetChars?: number;
  tolerance?: number;
}

export const NARRATIVE_RULES = {
  doorThreatLimit: {
    id: "door_threat_limit",
    description: "문 뒤 위협 패턴 1화당 최대 1번",
    promptText: "문 뒤에 누군가 서있는 장면은 1화당 최대 1번. 다른 긴장 장치를 사용하세요.",
    evaluatorKey: "doorThreatCount",
    maxPerChapter: 1,
    penalty: 0.1,
  },
  dialogueRatioLimit: {
    id: "dialogue_ratio_limit",
    description: "대사 비율 60% 이하",
    promptText: "한 챕터에서 대사 비율이 60%를 넘으면 안 됩니다.",
    evaluatorKey: "dialogueRatio",
    maxRatio: 0.6,
    penalty: 0.05,
  },
  nameConsistency: {
    id: "name_consistency",
    description: "캐릭터 풀네임 일관성",
    promptText: "캐릭터 이름은 seed에 정의된 풀네임만 사용하세요.",
    evaluatorKey: "nameConsistency",
    penalty: 0.15,
  },
  rankConsistency: {
    id: "rank_consistency",
    description: "캐릭터 신분 일관성",
    promptText: "seed에 정의된 신분을 절대 변경하지 마세요.",
    evaluatorKey: "rankConsistency",
    penalty: 0.3,
  },
  povConsistency: {
    id: "pov_consistency",
    description: "시점 일관성",
    promptText: "3인칭으로 시작했으면 끝까지 3인칭.",
    evaluatorKey: "povConsistency",
    penalty: 0.3,
  },
  chapterLengthLimit: {
    id: "chapter_length",
    description: "챕터 분량 2800-4200자",
    promptText: "최대 4000자. 이 분량이 되면 즉시 멈추세요.",
    targetChars: 3500,
    tolerance: 0.2,
  },
  cameraScanPattern: {
    id: "camera_scan",
    description: "장소 진입 시 공간->인물->사물->행동 순서",
    promptText: "새로운 장소에 들어갈 때: 1.전체 모습 2.누가 어디에 3.눈에 띄는 사물 4.행동",
  },
  comprehensibility: {
    id: "comprehensibility",
    description: "이해 가능성",
    promptText: "모든 사건에는 캐릭터의 해석이 따라와야 합니다.",
  },
  curiosityGap: {
    id: "curiosity_gap",
    description: "호기심 유발",
    promptText: "매 씬에 하나 이상의 열린 질문이나 미스터리를 만드세요.",
    evaluatorKey: "curiosityGap",
    penalty: 0.07,
  },
  emotionalImpact: {
    id: "emotional_impact",
    description: "감정 강도",
    promptText: "클라이맥스 직전 감정 강도를 점진적으로 높이세요.",
    evaluatorKey: "emotionalImpact",
    penalty: 0.07,
  },
  originality: {
    id: "originality",
    description: "신선함",
    promptText: "클리셰 표현을 신선한 표현으로 바꾸세요.",
    evaluatorKey: "originality",
    penalty: 0.07,
  },
  hookEnding: {
    id: "hook_ending",
    description: "절단신공",
    promptText: "챕터 마지막 문장은 반드시 미해결 상태로 끝내세요.",
    evaluatorKey: "hookEnding",
    penalty: 0.04,
  },
  dialogueQuality: {
    id: "dialogue_quality",
    description: "대사 품질",
    promptText: "모든 대사는 정보 전달 또는 감정 표현 중 하나를 해야 합니다.",
    evaluatorKey: "dialogueQuality",
    penalty: 0.04,
  },
  readingPacing: {
    id: "reading_pacing",
    description: "읽기 페이싱",
    promptText: "모든 사건 뒤에는 반드시 등장인물의 반응이나 여백 문단을 넣으세요.",
    evaluatorKey: "rhythm",
    penalty: 0.05,
  },
} as const;

export type NarrativeRuleKey = keyof typeof NARRATIVE_RULES;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate numbered prompt rules from NARRATIVE_RULES.
 * Only includes rules that have a `promptText` defined.
 */
export function generatePromptRules(): string {
  return Object.values(NARRATIVE_RULES)
    .filter((r): r is typeof r & { promptText: string } => !!r.promptText)
    .map((r, i) => `${i + 1}. ${r.promptText}`)
    .join("\n");
}

/**
 * Get all evaluator penalties as a map of evaluatorKey -> penalty.
 */
export function getEvaluatorPenalties(): Record<string, number> {
  const penalties: Record<string, number> = {};
  for (const rule of Object.values(NARRATIVE_RULES)) {
    if ("evaluatorKey" in rule && "penalty" in rule && rule.evaluatorKey && rule.penalty) {
      penalties[rule.evaluatorKey] = rule.penalty;
    }
  }
  return penalties;
}

/**
 * Get the chapter length configuration.
 */
export function getChapterLengthConfig(): { targetChars: number; tolerance: number } {
  return {
    targetChars: NARRATIVE_RULES.chapterLengthLimit.targetChars,
    tolerance: NARRATIVE_RULES.chapterLengthLimit.tolerance,
  };
}

/**
 * Get the dialogue ratio limit.
 */
export function getDialogueRatioLimit(): number {
  return NARRATIVE_RULES.dialogueRatioLimit.maxRatio;
}
