/**
 * Centralized narrative rules — single source of truth for all writing policies.
 *
 * Every rule that appears in prompts, evaluators, or repair instructions should
 * be defined here. Consumers import helpers instead of hardcoding values.
 *
 * Consumers:
 *   1. Writer prompt   — writer-system-prompt.ts  (generateCoreRulesBlock)
 *   2. Evaluator        — consistency-gate.ts      (getRulePenalty)
 *   3. Repair            — state-machine.ts         (getRepairInstructions)
 *   4. Blueprint         — planning-prompts.ts      (reference comment)
 */

// ---------------------------------------------------------------------------
// Cliche dictionary — single source of truth for originality evaluation
// ---------------------------------------------------------------------------

/**
 * Comprehensive Korean web novel cliche list.
 * - `bannedExpressions` (subset) → goes into writer prompt as absolute ban
 * - Full list → used by originality evaluator for scoring
 *
 * Add new cliches here. Do NOT maintain a separate list elsewhere.
 */
export const KOREAN_CLICHES: readonly string[] = [
  // Romance (로판) — physical reactions
  "심장이 두근거렸다",
  "심장이 두근거리기 시작했다",
  "심장이 빠르게 뛰었다",
  "눈이 마주쳤다",
  "눈이 마주치는 순간",
  "볼이 붉어졌다",
  "얼굴이 붉어졌다",
  "시간이 멈춘 것 같았다",
  "시간이 멈춘 듯했다",
  "그의 눈동자가 흔들렸다",
  "눈동자가 흔들렸다",
  "숨이 멎을 것 같았다",
  "숨이 멈추는 것 같았다",
  "온몸이 얼어붙었다",
  "몸이 얼어붙었다",
  "그 자리에 얼어붙었다",

  // Romance — descriptive cliches
  "차가운 눈빛",
  "차가운 시선",
  "따뜻한 미소",
  "부드러운 미소",
  "묘한 감정",
  "알 수 없는 끌림",
  "알 수 없는 감정",
  "설명할 수 없는 감정",
  "처음 느끼는 감정",
  "낯선 감정",

  // Romance — actions
  "결심을 굳혔다",
  "주먹을 꽉 쥐었다",
  "주먹을 불끈 쥐었다",
  "입술을 깨물었다",
  "입술을 꽉 깨물었다",
  "고개를 돌렸다",
  "시선을 피했다",
  "눈을 감았다",

  // Action/Fantasy
  "강력한 기운이 느껴졌다",
  "엄청난 기운이 느껴졌다",
  "놀라운 실력",
  "대단한 실력",
  "감히",
  "어림없다",
  "이를 악물었다",
  "이를 꽉 악물었다",
  "살기가 느껴졌다",
  "살기를 뿜어냈다",
  "기가 폭발했다",
  "오라가 폭발했다",
  "검기가 폭발했다",
  "기운이 폭발했다",
  "압도적인 힘",
  "압도적인 기운",
  "상상도 못할",
  "믿을 수 없는 속도",

  // Generic narration
  "생각보다",
  "예상대로",
  "예상과 달리",
  "역시",
  "그런데 말이야",
  "할 수 없었다",
  "어쩔 수 없었다",
  "그럴 수밖에 없었다",
  "방법이 없었다",
  "선택의 여지가 없었다",

  // Generic body language
  "고개를 끄덕였다",
  "고개를 저었다",
  "한숨을 내쉬었다",
  "깊은 한숨을 내쉬었다",
  "미간을 찌푸렸다",
  "미간이 찌푸려졌다",
  "눈을 크게 떴다",
  "눈이 커졌다",
  "입이 떡 벌어졌다",

  // Filler / weak narration
  "그러자",
  "그런데",
  "그때였다",
  "바로 그때",
  "순간",
  "그 순간",
  "다름 아닌",
  "두말할 것도 없이",
  "말할 것도 없이",

  // Overused emotional descriptions
  "가슴이 먹먹해졌다",
  "가슴이 답답했다",
  "마음이 무거워졌다",
  "마음이 아팠다",
  "눈시울이 붉어졌다",
  "눈물이 흘렀다",
  "눈물이 핑 돌았다",
];

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export interface NarrativeRule {
  id: string;
  description: string;
  promptText?: string;
  /** Extended prompt text with examples — used in the writer system prompt */
  promptBlock?: string;
  evaluatorKey?: string;
  penalty?: number;
  maxPerChapter?: number;
  minRatio?: number;
  maxRatio?: number;
  minChars?: number;
  targetChars?: number;
  tolerance?: number;
  /** Instruction given to the repair/surgeon agent when this rule is violated */
  repairInstruction?: string;
  /** Banned expressions list (for originality rule) */
  bannedExpressions?: readonly string[];
}

export const NARRATIVE_RULES = {
  doorThreatLimit: {
    id: "door_threat_limit",
    description: "문 뒤 위협 패턴 1화당 최대 1번",
    promptText: "문 뒤에 누군가 서있는 장면은 1화당 최대 1번. 다른 긴장 장치를 사용하세요.",
    evaluatorKey: "doorThreatCount",
    maxPerChapter: 1,
    penalty: 0.1,
    repairInstruction: "문/복도/발소리/문고리로 긴장을 만드는 패턴이 반복됩니다. 다른 긴장 장치(문서 발견, 시간 제한, 대화 속 거짓말 등)로 교체하세요.",
  },
  dialogueRatioLimit: {
    id: "dialogue_ratio_limit",
    description: "대사 비율 30~50%",
    promptText: "대사 비율 30~50%를 유지하세요. 너무 적어도 안 됩니다.",
    evaluatorKey: "dialogueRatio",
    minRatio: 0.3,
    maxRatio: 0.5,
    penalty: 0.05,
    repairInstruction: "대사와 서술의 비율을 조정하세요. 대사가 너무 적으면 추가하세요.",
  },
  nameConsistency: {
    id: "name_consistency",
    description: "캐릭터 풀네임 일관성",
    promptText: "캐릭터 이름은 seed에 정의된 풀네임만 사용하세요.",
    evaluatorKey: "nameConsistency",
    penalty: 0.15,
    repairInstruction: "캐릭터 이름이 seed에 정의된 풀네임과 다릅니다. seed에 정의된 풀네임으로 수정하세요.",
  },
  rankConsistency: {
    id: "rank_consistency",
    description: "캐릭터 신분 일관성",
    promptText: "seed에 정의된 신분을 절대 변경하지 마세요.",
    evaluatorKey: "rankConsistency",
    penalty: 0.3,
    repairInstruction: "캐릭터의 신분(공작/황제/시녀 등)이 seed 설정과 다릅니다. seed에 정의된 신분으로 수정하세요.",
  },
  titleConsistency: {
    id: "title_consistency",
    description: "칭호 일관성 — 나레이션에서 캐릭터 칭호 혼용 금지",
    promptText: "나레이션에서 캐릭터 칭호를 혼용하지 마세요. 황녀를 공녀로 부르면 안 됩니다.",
    evaluatorKey: "titleConsistency",
    penalty: 0.25,
    repairInstruction: "나레이션에서 캐릭터 칭호가 seed의 social_rank와 불일치합니다. 예: 황녀인 캐릭터를 공녀로 칭함. seed에 정의된 신분에 맞는 칭호로 수정하세요.",
  },
  povConsistency: {
    id: "pov_consistency",
    description: "시점 일관성",
    promptText: "3인칭으로 시작했으면 끝까지 3인칭.",
    evaluatorKey: "povConsistency",
    penalty: 0.3,
    repairInstruction: "시점(1인칭/3인칭)이 도중에 바뀌었습니다. 처음 설정한 시점으로 통일하세요.",
  },
  chapterLengthLimit: {
    id: "chapter_length",
    description: "챕터 분량 2800-4000자",
    promptText: "최소 2800자, 최대 4000자. 2800자 미만이면 씬을 더 풍성하게 쓰세요.",
    minChars: 2800,
    targetChars: 3500,
    tolerance: 0.2,
    repairInstruction: "분량을 조정하세요. 너무 짧으면 장면 묘사를 추가하세요.",
  },
  cameraScanPattern: {
    id: "camera_scan",
    description: "장소 진입 시 공간->인물->사물->행동 순서",
    promptText: "새로운 장소에 들어갈 때: 1.전체 모습 2.누가 어디에 3.눈에 띄는 사물 4.행동",
    repairInstruction: "장소 진입 시 공간->인물->사물->행동 순서로 묘사하세요.",
  },
  comprehensibility: {
    id: "comprehensibility",
    description: "이해 가능성",
    promptText: "모든 사건에는 캐릭터의 해석이 따라와야 합니다.",
    promptBlock: `모든 사건에는 캐릭터의 해석이 따라와야 한다. 주어 생략은 한국어 웹소설의 최대 독해 장애물이다. 다음 규칙을 반드시 준수하라:

풀네임(이름+성)은 캐릭터가 처음 등장할 때와 혼동 위험이 있을 때만 사용. 같은 문단 내에서 같은 인물의 풀네임을 2회 이상 반복하면 기계적으로 들린다.

**주어 명시 5대 규칙**:
1. **풀네임 vs 이름 구분**: 문단 첫 등장 시에만 풀네임(예: 에르시아 발렌)을 쓴다. 같은 문단 내 이후 언급은 이름만(예: 에르시아) 쓴다. 같은 문단에서 풀네임을 2회 이상 사용하지 마라.
   ❌ "에르시아 발렌은 검을 들었다. 에르시아 발렌의 눈이 빛났다. 에르시아 발렌은 앞으로 나섰다." (기계적 반복)
   ✅ "에르시아 발렌은 검을 들었다. 에르시아의 눈이 빛났다. 그녀는 앞으로 나섰다." (자연스러운 변주)

2. **대사 연속 후 주어 명시**: 대사가 2줄 이상 연속된 뒤 첫 서술문에는 반드시 캐릭터 이름을 주어로 쓴다. 풀네임이 아닌 이름만으로 충분하다.
   ❌ "…" / "…" / 고개를 돌렸다. (누가?)
   ✅ "…" / "…" / 카시안이 고개를 돌렸다.

3. **다인 장면 대명사 제한**: 씬에 3명 이상의 캐릭터가 등장하면 "그/그녀/그는/그녀는" 대신 이름을 쓴다.
   ❌ "그녀가 검을 들었다." (리아나? 세라? 누구?)
   ✅ "리아나가 검을 들었다."

4. **모든 문단 주어 필수**: 모든 문단의 첫 문장에는 반드시 문법적 주어가 있어야 한다. 주어 없이 동사로 시작하지 마라.
   ❌ "천천히 다가갔다." (누가?)
   ✅ "리아나가 천천히 다가갔다."

5. **대명사 허용 조건**: "그녀는/그는"은 같은 문단 내에서 행동 주체가 1명뿐일 때 허용된다. 같은 성별 캐릭터 2명 이상이 동시에 행동하면 반드시 이름을 쓴다.
   ❌ (여성 2명이 모두 행동하는 문단) "그녀는 문을 닫았다."
   ✅ (문단 내 행동하는 캐릭터 1명) "그녀는 문을 닫았다." — 허용
   ✅ (여성 2명이 동시에 행동) "세라가 문을 닫았다." — 이름 사용`,
    evaluatorKey: "comprehensibility",
    penalty: 0.1,
    repairInstruction: "독해 명확성을 높이세요. 주어 생략을 줄이고, 대명사를 구체적 이름으로 바꾸세요. 대사 연속 후 반드시 이름 주어를 쓰세요. 3인 이상 장면에서 대명사를 이름으로 교체하세요. 단, 같은 문단에서 풀네임(이름+성)을 2회 이상 반복하지 마세요 — 첫 등장만 풀네임, 이후는 이름만 사용하세요.",
  },
  curiosityGap: {
    id: "curiosity_gap",
    description: "호기심 유발",
    promptText: "매 씬에 하나 이상의 열린 질문이나 미스터리를 만드세요.",
    promptBlock: "매 씬에 하나 이상의 열린 질문이나 미스터리를 만들어라. 챕터 전체에서 2-4개의 미해소 궁금증을 유지하라.",
    evaluatorKey: "curiosityGap",
    penalty: 0.07,
    repairInstruction: "열린 질문이나 미스터리를 추가하세요. 독자가 궁금해할 포인트를 만드세요.",
  },
  emotionalImpact: {
    id: "emotional_impact",
    description: "감정 강도",
    promptText: "클라이맥스 직전 감정 강도를 점진적으로 높이세요.",
    promptBlock: "클라이맥스 직전 3문단은 감정 강도를 점진적으로 높여라. 공감 마커(신체 반응, 내면 묘사)를 포함하라. 클라이맥스 후 긴장을 풀어라.",
    evaluatorKey: "emotionalImpact",
    penalty: 0.07,
    repairInstruction: "감정 강도를 높이세요. 내면 묘사, 신체 반응을 추가하세요.",
  },
  originality: {
    id: "originality",
    description: "신선함",
    promptText: "클리셰 표현을 신선한 표현으로 바꾸세요.",
    promptBlock: `다음 표현은 절대 사용 금지: "심장이 두근거렸다", "눈이 마주쳤다", "시간이 멈춘 것 같았다", "차가운 눈빛", "알 수 없는 감정", "주먹을 꽉 쥐었다", "입술을 깨물었다", "바로 그때", "그 순간", "온몸이 얼어붙었다", "눈동자가 흔들렸다", "한숨을 내쉬었다", "결심을 굳혔다", "이를 악물었다", "압도적인 기운", "가슴이 먹먹해졌다", "눈시울이 붉어졌다", "볼이 붉어졌다", "살기가 느껴졌다", "믿을 수 없는 속도". 문단 첫 어절을 다양하게. '그는/그녀는'으로 3번 이상 시작하지 마라.`,
    evaluatorKey: "originality",
    penalty: 0.07,
    repairInstruction: "클리셰 표현을 신선한 표현으로 바꾸세요. 문단 시작을 다양하게 하세요.",
    /** Top-20 worst offenders — goes into the writer prompt as absolute ban */
    bannedExpressions: [
      "심장이 두근거렸다", "눈이 마주쳤다", "시간이 멈춘 것 같았다",
      "차가운 눈빛", "알 수 없는 감정", "주먹을 꽉 쥐었다",
      "입술을 깨물었다", "바로 그때", "그 순간", "온몸이 얼어붙었다",
      "눈동자가 흔들렸다", "한숨을 내쉬었다", "결심을 굳혔다",
      "이를 악물었다", "압도적인 기운", "가슴이 먹먹해졌다",
      "눈시울이 붉어졌다", "볼이 붉어졌다", "살기가 느껴졌다",
      "믿을 수 없는 속도",
    ] as const,
  },
  hookEnding: {
    id: "hook_ending",
    description: "절단신공",
    promptText: "챕터 마지막 문장은 반드시 위기/반전/질문 한가운데서 끊어라. 해결·요약·평온으로 끝내면 실격.",
    promptBlock: `챕터의 마지막 1-2문단은 **절단신공** — 위기·폭로·결정의 한가운데서 끊어라. 절대로 해결, 요약, 평온, 잠드는 장면으로 끝내지 마라.

**끝내는 3가지 방법 (반드시 하나 사용)**:
1. **위기 절단**: 사건이 터지는 바로 그 순간에 끊는다.
2. **폭로 절단**: 충격적 정보가 드러나는 순간, 반응 전에 끊는다.
3. **선택 절단**: 주인공이 돌이킬 수 없는 결정을 내리려는 순간 끊는다.

**좋은 예 (✅)**:
- "서류 맨 아래, 아버지의 인장이 찍혀 있었다." (폭로 절단 — 반응 전에 끊음)
- "칼이 목에 닿았다. 카시안이 웃었다." (위기 절단 — 결과 전에 끊음)
- "리아나는 독이 든 잔을 들어 올렸다." (선택 절단 — 행동 직전에 끊음)
- "문이 열렸다. 들어선 사람은 죽었어야 할 남자였다." (폭로 절단)

**나쁜 예 (❌ — 절대 금지)**:
- "그렇게 긴 하루가 끝났다." (요약)
- "리아나는 침대에 누워 눈을 감았다." (평온)
- "모든 것이 제자리를 찾아가고 있었다." (해결)
- "내일은 더 나은 날이 될 것이다." (희망적 마무리)

마지막 문장은 짧고 강렬하게. 독자가 "다음 화 결제" 버튼을 누르게 만들어라.`,
    evaluatorKey: "hookEnding",
    penalty: 0.04,
    repairInstruction: "마지막 문단을 위기·폭로·선택의 한가운데서 끊으세요. 해결/요약/평온한 마무리를 삭제하고, 사건이 터지는 순간 또는 충격적 정보가 드러나는 순간에서 끝내세요.",
  },
  dialogueQuality: {
    id: "dialogue_quality",
    description: "대사 품질",
    promptText: "모든 대사는 정보 전달 또는 감정 표현 중 하나를 해야 합니다.",
    promptBlock: "모든 대사는 정보 전달 또는 감정 표현 중 하나를 해야 한다. '네', '그래', '아' 같은 빈 대사 금지. 명언 배틀 금지 — 한 대화에서 은유는 최대 1개.",
    evaluatorKey: "dialogueQuality",
    penalty: 0.04,
    repairInstruction: "빈 대사를 의미 있는 대사로 바꾸세요. 정보나 감정을 담으세요.",
  },
  readingPacing: {
    id: "reading_pacing",
    description: "읽기 페이싱",
    promptText: "모든 사건 뒤에는 반드시 등장인물의 반응이나 여백 문단을 넣으세요.",
    promptBlock: "모든 사건 뒤에는 반드시 등장인물의 반응이나 독자가 소화할 수 있는 여백 문단을 넣어라. 연속 3문단 이상 새 사건을 터뜨리지 마라. 현상만 나열하지 말고 주인공이 왜 그렇게 느꼈는지 반드시 설명하라.",
    evaluatorKey: "rhythm",
    penalty: 0.05,
    repairInstruction: "문장 길이를 다양하게 하세요. 같은 어미 반복을 피하세요.",
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
 * Generate the "6 core rules" block for the writer system prompt.
 * Uses `promptBlock` when available for richer text, falling back to `promptText`.
 */
export function generateCoreRulesBlock(): string {
  const coreRuleKeys: NarrativeRuleKey[] = [
    "curiosityGap",
    "emotionalImpact",
    "originality",
    "hookEnding",
    "dialogueQuality",
    "readingPacing",
  ];

  return coreRuleKeys
    .map((key, i) => {
      const rule = NARRATIVE_RULES[key];
      const text = ("promptBlock" in rule && rule.promptBlock) ? rule.promptBlock : rule.promptText;
      return `**규칙 ${i + 1} — ${rule.description}**: ${text}`;
    })
    .join("\n\n");
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
 * Get the penalty for a specific rule by its NarrativeRuleKey.
 * Returns 0.05 (minor default) if the rule has no penalty defined.
 */
export function getRulePenalty(ruleKey: NarrativeRuleKey): number {
  const rule = NARRATIVE_RULES[ruleKey];
  return ("penalty" in rule && rule.penalty) ? rule.penalty : 0.05;
}

/**
 * Get repair instructions as a map of evaluatorKey/dimension -> instruction.
 * Derived entirely from NARRATIVE_RULES repairInstruction fields.
 */
export function getRepairInstructions(): Record<string, string> {
  const instructions: Record<string, string> = {};
  for (const [key, rule] of Object.entries(NARRATIVE_RULES)) {
    if ("repairInstruction" in rule && rule.repairInstruction) {
      // Index by rule key (camelCase)
      instructions[key] = rule.repairInstruction;
      // Also index by evaluatorKey if present, for dimension-based lookup
      if ("evaluatorKey" in rule && rule.evaluatorKey) {
        instructions[rule.evaluatorKey] = rule.repairInstruction;
      }
    }
  }
  return instructions;
}

/**
 * Get the chapter length configuration.
 */
export function getChapterLengthConfig(): { minChars: number; targetChars: number; tolerance: number } {
  return {
    minChars: NARRATIVE_RULES.chapterLengthLimit.minChars,
    targetChars: NARRATIVE_RULES.chapterLengthLimit.targetChars,
    tolerance: NARRATIVE_RULES.chapterLengthLimit.tolerance,
  };
}

/**
 * Get the dialogue ratio limit.
 */
export function getDialogueRatioLimit(): { minRatio: number; maxRatio: number } {
  return {
    minRatio: NARRATIVE_RULES.dialogueRatioLimit.minRatio,
    maxRatio: NARRATIVE_RULES.dialogueRatioLimit.maxRatio,
  };
}
