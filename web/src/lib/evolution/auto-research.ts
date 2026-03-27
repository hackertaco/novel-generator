/**
 * AutoResearch Loop — Autonomous system improvement loop.
 *
 * Inspired by Andrej Karpathy's AutoResearch: instead of generating
 * novels and hoping they're good, this loop improves the GENERATION
 * SYSTEM itself (prompts, templates, rules) through measurable evaluation.
 *
 * Loop:
 *   1. Generate a chapter with current system
 *   2. Evaluate quality (code metrics + LLM judge)
 *   3. AI analyzes weaknesses
 *   4. AI proposes system modifications (prompts, examples, rules)
 *   5. Apply modifications
 *   6. Regenerate with modified system
 *   7. Re-evaluate → keep if better, revert if worse
 *   8. Repeat
 */

// ---------------------------------------------------------------------------
// Evaluation types
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  /** Dialogue ratio (0-1) */
  dialogue_ratio: number;
  /** Tell-not-show violation count */
  tell_not_show_count: number;
  /** Ending repetition rate (0-1) */
  ending_repetition_rate: number;
  /** Vague narrative count */
  vague_narrative_count: number;
  /** Character count (length) */
  char_count: number;
  /** Self-repetition overlap ratio (0-1, lower is better) */
  repetition_overlap: number;
  /** Conflict resolution score (0-1, lower is better for early chapters) */
  premature_resolution: number;
  /** Sentiment mismatch count */
  sentiment_mismatch_count: number;
}

export interface LLMJudgement {
  /** "Would you click next chapter?" (1-10) */
  next_chapter_click: number;
  /** "Can you distinguish character voices?" (1-10) */
  character_voice_distinction: number;
  /** "Is the premise/conflict clear?" (1-10) */
  premise_clarity: number;
  /** "Is the plot coherent/plausible?" (1-10) */
  coherence: number;
  /** "Are expressions varied (no repetition)?" (1-10) */
  expression_variety: number;
  /** "Is scene pacing well-balanced?" (1-10) */
  scene_pacing: number;
  /** "Does the writing engage multiple senses?" (1-10) */
  sensory_detail: number;
  /** "Does the reader feel transported into the story?" (1-10) */
  immersion: number;
  /** Specific feedback for improvement */
  feedback: string;
}

export interface EfficiencyMetrics {
  /** Total tokens used across all LLM calls */
  total_tokens: number;
  /** Number of retry/repair attempts */
  retry_count: number;
}

export interface EvaluationScore {
  /** Overall score (0-1) */
  overall: number;
  /** Quality sub-score (0-1) */
  quality: number;
  /** Efficiency sub-score (0-1) */
  efficiency: number;
  /** Raw metrics */
  quality_metrics: QualityMetrics;
  llm_judgement: LLMJudgement;
  efficiency_metrics: EfficiencyMetrics;
}

// ---------------------------------------------------------------------------
// Experiment tracking
// ---------------------------------------------------------------------------

export interface Experiment {
  /** Experiment ID */
  id: number;
  /** What was modified */
  modification: string;
  /** The generated text */
  generated_text: string;
  /** Evaluation score */
  score: EvaluationScore;
  /** Whether this experiment was kept */
  kept: boolean;
  /** Timestamp */
  timestamp: number;
}

export interface AutoResearchState {
  /** Current best score */
  best_score: number;
  /** Best experiment ID */
  best_experiment_id: number;
  /** All experiments run so far */
  experiments: Experiment[];
  /** Total experiments run */
  total_runs: number;
  /** Cumulative improvement from baseline */
  improvement_from_baseline: number;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

const QUALITY_WEIGHT = 0.9;
const EFFICIENCY_WEIGHT = 0.1;

// Quality sub-weights (code metrics: 30%, LLM judgement: 60%)
const W_DIALOGUE = 0.08;
const W_TELL_NOT_SHOW = 0.08;
const W_ENDING_REPEAT = 0.07;
const W_VAGUE = 0.07;
const W_CLICK_NEXT = 0.15;
const W_VOICE = 0.10;
const W_PREMISE = 0.05;
const W_COHERENCE = 0.10;
const W_EXPRESSION = 0.08;
const W_SCENE_PACING = 0.05;
const W_SENSORY_DETAIL = 0.04;
const W_IMMERSION = 0.03;

// Efficiency baselines (for normalization)
const TOKEN_BASELINE = 150000; // realistic token usage for a full chapter pipeline
const MAX_RETRIES = 9; // 3 scenes × 3 retries each

/**
 * Calculate a single evaluation score from raw metrics.
 */
export function calculateScore(
  quality: QualityMetrics,
  judgement: LLMJudgement,
  efficiency: EfficiencyMetrics,
): EvaluationScore {
  // Quality sub-scores (each 0-1)
  // Code metrics (30%)
  const dialogueScore = Math.min(1, quality.dialogue_ratio / 0.5); // 50%+ = perfect
  const tellShowScore = Math.max(0, 1 - quality.tell_not_show_count * 0.2); // 5+ = 0
  const endingScore = Math.max(0, 1 - quality.ending_repetition_rate * 2); // 50%+ = 0
  const vagueScore = Math.max(0, 1 - quality.vague_narrative_count * 0.25); // 4+ = 0

  // LLM judgement scores (60%)
  const clickScore = judgement.next_chapter_click / 10;
  const voiceScore = judgement.character_voice_distinction / 10;
  const premiseScore = judgement.premise_clarity / 10;
  const coherenceScore = judgement.coherence / 10;
  const expressionScore = judgement.expression_variety / 10;
  const pacingScore = judgement.scene_pacing / 10;
  const sensoryScore = judgement.sensory_detail / 10;
  const immersionScore = judgement.immersion / 10;

  const qualityScore =
    dialogueScore * W_DIALOGUE +
    tellShowScore * W_TELL_NOT_SHOW +
    endingScore * W_ENDING_REPEAT +
    vagueScore * W_VAGUE +
    clickScore * W_CLICK_NEXT +
    voiceScore * W_VOICE +
    premiseScore * W_PREMISE +
    coherenceScore * W_COHERENCE +
    expressionScore * W_EXPRESSION +
    pacingScore * W_SCENE_PACING +
    sensoryScore * W_SENSORY_DETAIL +
    immersionScore * W_IMMERSION;

  // Efficiency sub-scores
  const tokenScore = Math.max(0, 1 - efficiency.total_tokens / TOKEN_BASELINE);
  const retryScore = Math.max(0, 1 - efficiency.retry_count / MAX_RETRIES);
  const efficiencyScore = tokenScore * 0.7 + retryScore * 0.3;

  const overall = qualityScore * QUALITY_WEIGHT + efficiencyScore * EFFICIENCY_WEIGHT;

  return {
    overall: Math.round(overall * 1000) / 1000,
    quality: Math.round(qualityScore * 1000) / 1000,
    efficiency: Math.round(efficiencyScore * 1000) / 1000,
    quality_metrics: quality,
    llm_judgement: judgement,
    efficiency_metrics: efficiency,
  };
}

// ---------------------------------------------------------------------------
// LLM Judge prompt
// ---------------------------------------------------------------------------

/**
 * Build a prompt for the LLM judge to evaluate a generated chapter.
 */
export function buildJudgePrompt(chapterText: string, genre: string): string {
  return `당신은 카카오페이지 웹소설 품질 심사위원입니다. 다음 ${genre} 장르 1화를 읽고 평가해주세요.
엄격하게 평가하세요. 7점 이상은 상위 작품 수준일 때만 부여합니다.

[소설 텍스트]
${chapterText}

## 평가 기준 (각 1-10점)

1. **next_chapter_click**: 이 1화를 읽고 2화를 클릭하겠습니까?
   - 1점: 절대 안 함 (지루, 아무 일도 안 일어남)
   - 5점: 보통 (나쁘진 않지만 끌리지도 않음)
   - 10점: 즉시 클릭 (너무 궁금해서 못 참겠음)

2. **character_voice_distinction**: 캐릭터 목소리가 구분됩니까?
   - 1점: 모든 캐릭터가 같은 말투
   - 5점: 주인공은 구분되지만 나머지는 비슷
   - 10점: 이름 없이 대사만 읽어도 누군지 알 수 있음

3. **premise_clarity**: 이 소설의 전제/갈등이 명확합니까?
   - 1점: 1화를 다 읽어도 무슨 소설인지 모름
   - 5점: 대충 알겠지만 구체적이지 않음
   - 10점: 핵심 갈등과 주인공의 목표가 선명함

4. **coherence**: 이야기의 개연성이 있습니까?
   - 1점: 장면 전환이 뜬금없고, 캐릭터 행동에 이유가 없음
   - 5점: 대체로 괜찮지만 일부 전개가 억지스러움
   - 10점: 모든 사건과 행동에 설득력 있는 동기와 인과관계가 있음

5. **expression_variety**: 표현이 다양합니까?
   - 1점: 같은 표현/구조가 계속 반복됨 ("~였다. ~였다.", "그녀는 ~했다" 패턴)
   - 5점: 가끔 반복이 보이지만 대체로 다양
   - 10점: 문장 구조, 어미, 묘사 방식이 풍부하고 지루하지 않음

6. **scene_pacing**: 장면의 호흡과 완급 조절이 적절합니까?
   - 1점: 사건이 쏟아지듯 전개되어 숨 쉴 틈이 없거나, 반대로 아무 일도 없이 늘어짐
   - 5점: 대체로 괜찮지만 일부 장면이 급하게 넘어가거나 불필요하게 길어짐
   - 10점: 긴장과 이완의 리듬이 완벽하고, 각 장면에 충분한 호흡이 있으면서 지루하지 않음

7. **sensory_detail**: 감각적 묘사가 풍부합니까?
   - 1점: 시각적 정보만 있거나 감각 묘사가 거의 없음
   - 5점: 시각 + 1가지 감각이 가끔 등장
   - 10점: 시각, 청각, 촉각, 후각, 미각 중 장면마다 2개 이상의 감각이 자연스럽게 녹아있음

8. **immersion**: 독자가 이야기 속으로 빠져드는 몰입감이 있습니까?
   - 1점: 텍스트를 읽는 느낌만 남고, 장면이 머릿속에 그려지지 않음
   - 5점: 가끔 몰입되지만 자주 현실로 돌아옴 (설명, 어색한 전환 등)
   - 10점: 물리적 공간, 분위기, 캐릭터가 생생하게 느껴져서 읽는 동안 시간 감각을 잃음

9. **feedback**: 가장 큰 약점 1개와 구체적 개선 방향

## 출력 형식 (JSON)
{
  "next_chapter_click": 7,
  "character_voice_distinction": 5,
  "premise_clarity": 8,
  "coherence": 6,
  "expression_variety": 7,
  "scene_pacing": 6,
  "sensory_detail": 5,
  "immersion": 6,
  "feedback": "대사 비율이 낮아서 캐릭터 매력이 부족합니다. 호위와의 대화를 더 길게 전개하면..."
}

JSON만 출력하세요.`;
}

// ---------------------------------------------------------------------------
// Modification analysis prompt
// ---------------------------------------------------------------------------

/**
 * Build a prompt for the AI agent to analyze weaknesses and propose
 * system modifications (like AutoResearch modifying train.py).
 */
export function buildModificationPrompt(
  currentScore: EvaluationScore,
  chapterText: string,
  previousExperiments: Experiment[],
  forbiddenTargets?: string[],
): string {
  const recentExps = previousExperiments.slice(-5).map((e) =>
    `실험 #${e.id}: ${e.modification} → ${e.kept ? "✅ 개선" : "❌ 악화"} (점수: ${e.score.overall})`
  ).join("\n");

  // Build target constraint
  const allTargets = ["writer_system_prompt", "scene_validator_rules", "beat_structure", "blueprint_prompt"];
  const availableTargets = forbiddenTargets?.length
    ? allTargets.filter((t) => !forbiddenTargets.includes(t))
    : allTargets;
  const targetConstraint = forbiddenTargets?.length
    ? `\n⚠️ 최근에 이미 시도한 대상(${forbiddenTargets.join(", ")})은 선택하지 마세요. 다른 대상을 선택하세요.`
    : "";

  return `당신은 웹소설 생성 시스템의 자동 개선 에이전트입니다.

## 현재 시스템 평가 결과
- 전체 점수: ${currentScore.overall}/1.0
- 품질 점수: ${currentScore.quality}/1.0
- 효율 점수: ${currentScore.efficiency}/1.0
- 대사 비율: ${(currentScore.quality_metrics.dialogue_ratio * 100).toFixed(0)}%
- Tell-not-show 위반: ${currentScore.quality_metrics.tell_not_show_count}개
- 어미 반복률: ${(currentScore.quality_metrics.ending_repetition_rate * 100).toFixed(0)}%
- 모호 서술: ${currentScore.quality_metrics.vague_narrative_count}개
- 2화 클릭 의향: ${currentScore.llm_judgement.next_chapter_click}/10
- 캐릭터 목소리: ${currentScore.llm_judgement.character_voice_distinction}/10
- 전제 명확성: ${currentScore.llm_judgement.premise_clarity}/10
- 개연성: ${currentScore.llm_judgement.coherence}/10
- 표현 다양성: ${currentScore.llm_judgement.expression_variety}/10
- 장면 호흡: ${currentScore.llm_judgement.scene_pacing}/10
- 감각 묘사: ${currentScore.llm_judgement.sensory_detail}/10
- 몰입감: ${currentScore.llm_judgement.immersion}/10
- LLM 피드백: ${currentScore.llm_judgement.feedback}
- 총 토큰: ${currentScore.efficiency_metrics.total_tokens}
- 재시도 횟수: ${currentScore.efficiency_metrics.retry_count}

## 이전 실험 결과
${recentExps || "없음 (첫 실험)"}

## 현재 생성된 텍스트 (처음 1000자)
${chapterText.slice(0, 1000)}

## 당신의 임무
1. 가장 점수가 낮은 차원을 식별하세요
2. 그 약점을 해결할 **구체적인 시스템 수정** 1개를 제안하세요
3. 이전에 이미 시도한 수정과 **다른 접근**을 해야 합니다
4. 수정 대상은 다음 중 하나:
   - writer_system_prompt: 글쓰기 지침 수정/추가
   - scene_validator_rules: 검증 규칙 추가/수정
   - beat_structure: 비트 구조 수정
   - blueprint_prompt: 블루프린트 예시 수정
${targetConstraint}
   사용 가능: ${availableTargets.join(", ")}

## 출력 형식 (JSON)
{
  "weakness": "가장 큰 약점 설명 (어떤 점수가 낮은지 구체적으로)",
  "target": "${availableTargets[0]}",
  "modification": "수정할 내용을 구체적으로 설명 (예시 포함)",
  "expected_impact": "이 수정으로 어떤 점수가 얼마나 개선될 것 같은지"
}

JSON만 출력하세요.`;
}
