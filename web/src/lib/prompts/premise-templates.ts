/**
 * Proven premise templates based on platform research (카카오페이지/네이버시리즈/리디).
 *
 * Instead of random combinatorial generation (protagonist × situation × structure),
 * these templates encode "fun formulas" — premise patterns that are inherently
 * interesting because they contain built-in irony, dilemma, or curiosity hooks.
 */

// ---------------------------------------------------------------------------
// Premise template types
// ---------------------------------------------------------------------------

export interface PremiseTemplate {
  /** Unique identifier */
  id: string;
  /** Pattern category (for diversity: pick from different categories) */
  category: PremiseCategory;
  /** The core premise in one sentence */
  premise: string;
  /** Why this is fun — the built-in irony/tension */
  irony: string;
  /** What makes the reader click "next episode" */
  reader_hook: string;
  /** Compatible genres */
  genres: string[];
  /** Suggested male archetype IDs (empty = any) */
  suggested_male: string[];
  /** Suggested female archetype IDs (empty = any) */
  suggested_female: string[];
}

export type PremiseCategory =
  | "피하면_쫓아옴"    // The more you run, the more they chase
  | "가짜_진짜_딜레마" // Fake becomes real, but then what?
  | "갭모에"           // Gap moe — terrifying person has adorable secret
  | "망하려는데_잘됨"  // Trying to fail but accidentally succeeding
  | "비밀_들킬뻔"      // Secret almost exposed — constant tension
  | "적이_내편"        // Enemy must become ally
  | "시한부_카운트다운" // Time is running out
  | "역설적_능력"      // Power that is also a curse
  | "메타_유머"        // Self-aware/meta humor about genre tropes
  | "일상_비일상"      // Mundane meets supernatural
  | "회귀_변주"        // Regression with a twist
  | "경영_생존"        // Management/survival in fantasy setting
  ;

// ---------------------------------------------------------------------------
// Romance Fantasy templates
// ---------------------------------------------------------------------------

const ROMANCE_FANTASY_TEMPLATES: PremiseTemplate[] = [
  // 피하면_쫓아옴
  {
    id: "rf-chase-villainess",
    category: "피하면_쫓아옴",
    premise: "3회 만에 죽는 악녀로 빙의한 여주가 원작 남주를 피하려는데, 남주가 오히려 집착적으로 쫓아온다",
    irony: "피하면 피할수록 남주의 집착이 깊어짐. 원작에선 무관심했던 남주가 왜?",
    reader_hook: "남주가 왜 갑자기 집착하는지 궁금해서 다음 화 클릭",
    genres: ["로맨스 판타지", "로맨스 빙의물"],
    suggested_male: ["obsessive", "tyrant"],
    suggested_female: ["schemer", "indifferent", "strong_willed"],
  },
  {
    id: "rf-chase-divorce",
    category: "피하면_쫓아옴",
    premise: "이혼을 요구한 황비가 궁을 떠나려 하자, 그동안 무관심했던 황제가 처음으로 무너진다",
    irony: "있을 때는 몰랐는데 떠나니까 미쳐감. 후회남의 절절함",
    reader_hook: "황제가 얼마나 무너지는지 보고 싶어서",
    genres: ["로맨스 판타지"],
    suggested_male: ["regretful", "tyrant"],
    suggested_female: ["strong_willed", "indifferent"],
  },

  // 가짜_진짜_딜레마
  {
    id: "rf-fake-wife",
    category: "가짜_진짜_딜레마",
    premise: "냉혈 공작의 계약 부인으로 들어갔는데, 계약 만료일이 다가올수록 공작이 계약 연장을 요구한다",
    irony: "가짜인 줄 알았는데 진짜가 됨. 그런데 진짜가 되면 계약 관계의 안전망을 잃음",
    reader_hook: "계약 만료 후 어떻게 되는지 궁금",
    genres: ["로맨스 판타지"],
    suggested_male: ["obsessive", "tsundere_m"],
    suggested_female: ["strong_willed", "cheerful"],
  },
  {
    id: "rf-fake-saint",
    category: "가짜_진짜_딜레마",
    premise: "가짜 성녀로 살아가는 평민이 진짜 성녀의 능력을 각성하기 시작한다. 들키면 사형",
    irony: "가짜인데 진짜 능력이 생김. 진짜임을 증명하면 이전의 사기가 발각됨",
    reader_hook: "들킬 뻔한 순간마다 긴장감",
    genres: ["로맨스 판타지"],
    suggested_male: ["sweet", "obsessive"],
    suggested_female: ["schemer", "cheerful"],
  },

  // 갭모에
  {
    id: "rf-gap-emperor-reader",
    category: "갭모에",
    premise: "전쟁의 신이라 불리는 잔혹한 황제의 유일한 취미가 로맨스 소설 덕질. 여주는 그의 최애 작가",
    irony: "무서운 황제가 소설 앞에서 소녀처럼 두근거림",
    reader_hook: "황제가 최애 작가 앞에서 어떻게 행동하는지",
    genres: ["로맨스 판타지"],
    suggested_male: ["tyrant", "tsundere_m"],
    suggested_female: ["cheerful", "indifferent"],
  },
  {
    id: "rf-gap-tyrant-baby",
    category: "갭모에",
    premise: "잔혹한 폭군이 졸지에 아이 아빠가 되어버렸는데, 아이 앞에서만 바보가 된다",
    irony: "신하들을 공포에 떨게 하는 폭군이 아이의 '아빠!' 한마디에 녹음",
    reader_hook: "폭군의 육아 갭 모에",
    genres: ["로맨스 판타지"],
    suggested_male: ["tyrant", "obsessive"],
    suggested_female: ["cheerful", "wounded", "innocent"],
  },

  // 망하려는데_잘됨
  {
    id: "rf-fail-villainess",
    category: "망하려는데_잘됨",
    premise: "악녀답게 살아서 빨리 퇴장하려는데, 선행이 오해받아 주변 사람들이 감화되기 시작한다",
    irony: "악녀로 살려는데 사람들이 성녀로 추앙함",
    reader_hook: "역설적 상황이 점점 커지는 코미디",
    genres: ["로맨스 판타지", "로맨스 빙의물"],
    suggested_male: ["tsundere_m", "puppy"],
    suggested_female: ["cheerful", "strong_willed"],
  },
  {
    id: "rf-fail-sub-lead",
    category: "망하려는데_잘됨",
    premise: "서브 남주로 빙의해서 메인 커플 근처에 안 가려는데, 자꾸 사건이 여주를 끌어온다",
    irony: "회피하면 할수록 원작 궤도에 빨려 들어감",
    reader_hook: "주인공의 필사적 회피 vs 운명의 끌어당김",
    genres: ["로맨스 판타지", "로맨스 빙의물"],
    suggested_male: ["tsundere_m", "sweet"],
    suggested_female: ["strong_willed", "innocent"],
  },

  // 비밀_들킬뻔
  {
    id: "rf-secret-identity",
    category: "비밀_들킬뻔",
    premise: "남장 여기사가 왕의 호위를 맡게 되었는데, 왕이 점점 의심하기 시작한다",
    irony: "정체가 들키면 사형인데, 왕이 호위기사에게 마음이 끌리기 시작",
    reader_hook: "들킬 뻔한 순간의 스릴 + 로맨스",
    genres: ["로맨스 판타지"],
    suggested_male: ["tyrant", "tsundere_m"],
    suggested_female: ["strong_willed", "schemer"],
  },

  // 적이_내편
  {
    id: "rf-enemy-ally",
    category: "적이_내편",
    premise: "적국의 공주가 정략결혼으로 적국 황제에게 시집오는데, 두 사람이 공동의 적을 발견한다",
    irony: "적이어야 하는 두 사람이 같은 편이 되어야 살 수 있음",
    reader_hook: "적에서 동지로, 동지에서 연인으로의 변화",
    genres: ["로맨스 판타지"],
    suggested_male: ["tyrant", "tsundere_m", "obsessive"],
    suggested_female: ["strong_willed", "schemer"],
  },

  // 시한부_카운트다운
  {
    id: "rf-countdown-curse",
    category: "시한부_카운트다운",
    premise: "저주로 수명이 1년밖에 남지 않은 성녀가, 남은 시간 동안 후계자를 키우려는데 남주가 저주를 풀겠다고 집착한다",
    irony: "죽음을 받아들인 여주 vs 절대 놓지 않으려는 남주",
    reader_hook: "시간이 줄어들수록 감정이 깊어지는 타임리밋",
    genres: ["로맨스 판타지"],
    suggested_male: ["obsessive", "sweet"],
    suggested_female: ["wounded", "cheerful", "indifferent"],
  },

  // 역설적_능력
  {
    id: "rf-paradox-power",
    category: "역설적_능력",
    premise: "호감도 수치가 눈에 보이는 능력으로 빙의한 여주. 남주의 호감도가 -999에서 시작한다",
    irony: "남주가 웃으면서 말하는데 호감도는 떨어짐. 겉과 속이 다른 걸 여주만 앎",
    reader_hook: "호감도 수치 변화를 보는 재미 + 속마음 추리",
    genres: ["로맨스 판타지", "로맨스 빙의물"],
    suggested_male: ["tsundere_m", "obsessive"],
    suggested_female: ["schemer", "cheerful", "strong_willed"],
  },

  // 메타_유머
  {
    id: "rf-meta-frustrating",
    category: "메타_유머",
    premise: "고구마물(답답한 소설)에 빙의한 현대인이, 모든 오해를 즉시 해결해버려서 원작이 붕괴한다",
    irony: "독자로서 답답했던 걸 직접 해결하는 사이다, 그런데 원작이 망가지면 빙의자도 사라짐",
    reader_hook: "원작 파괴의 쾌감 + 존재 위기의 긴장",
    genres: ["로맨스 빙의물"],
    suggested_male: ["sweet", "puppy"],
    suggested_female: ["strong_willed", "cheerful"],
  },

  // 경영_생존
  {
    id: "rf-management-fief",
    category: "경영_생존",
    premise: "망한 영지에 빙의한 관리인이, 전생의 경영 지식으로 영지를 살리는데 성공이 정치적 위협이 된다",
    irony: "영지가 잘되면 될수록 중앙 권력의 견제가 심해짐",
    reader_hook: "경영 성공의 쾌감 + 정치 서바이벌",
    genres: ["로맨스 판타지", "로맨스 빙의물"],
    suggested_male: ["tsundere_m", "sweet"],
    suggested_female: ["strong_willed", "schemer"],
  },

  // 회귀_변주
  {
    id: "rf-regression-enemy",
    category: "회귀_변주",
    premise: "회귀했는데 전생에서 나를 죽인 남주도 함께 회귀했다. 둘 다 서로가 회귀자인 걸 모른다",
    irony: "두 회귀자가 서로를 경계하면서도 끌리는 이중 긴장",
    reader_hook: "누가 먼저 상대의 회귀를 눈치채는가",
    genres: ["로맨스 판타지", "회귀"],
    suggested_male: ["regretful", "obsessive"],
    suggested_female: ["strong_willed", "schemer"],
  },

  // 일상_비일상
  {
    id: "rf-daily-supernatural",
    category: "일상_비일상",
    premise: "K-유교 어린이(예의범절 철저)가 악당 가문의 막내로 태어나, 예의로 악당들을 교화시킨다",
    irony: "악당 가문에서 가장 무서운 존재가 예의 바른 아이",
    reader_hook: "아이의 순수한 예의가 악당을 무너뜨리는 장면",
    genres: ["로맨스 판타지"],
    suggested_male: ["sweet", "tsundere_m"],
    suggested_female: ["cheerful", "innocent"],
  },
];

// ---------------------------------------------------------------------------
// Modern Romance templates
// ---------------------------------------------------------------------------

const MODERN_ROMANCE_TEMPLATES: PremiseTemplate[] = [
  {
    id: "mr-contract-fall",
    category: "가짜_진짜_딜레마",
    premise: "이혼 조건부 3년 계약 결혼. 남편이 진짜로 떠나려는 아내를 보고 처음으로 무너진다",
    irony: "무관심했던 남편이 이혼 서류 앞에서 처음 약해짐",
    reader_hook: "냉남의 무너짐을 보는 쾌감",
    genres: ["현대 로맨스"],
    suggested_male: ["regretful", "tsundere_m"],
    suggested_female: ["strong_willed", "indifferent"],
  },
  {
    id: "mr-secret-ceo",
    category: "비밀_들킬뻔",
    premise: "소개팅남이 알고 보니 내 회사 신임 대표. 둘만의 비밀 연애가 시작되지만 사내 루머가 퍼진다",
    irony: "숨기면 숨길수록 의심은 커지고, 공개하면 둘 다 위험",
    reader_hook: "들킬 뻔한 순간의 스릴",
    genres: ["현대 로맨스"],
    suggested_male: ["sweet", "tsundere_m"],
    suggested_female: ["strong_willed", "tsundere_f"],
  },
  {
    id: "mr-reunion-changed",
    category: "회귀_변주",
    premise: "7년 전 돈 없어서 헤어졌던 첫사랑이 대기업 대표가 되어 나타났는데, 나는 이미 다른 사람과 약혼 중",
    irony: "과거의 상처가 현재의 선택을 흔듦",
    reader_hook: "첫사랑 vs 현재 약혼자, 누구를 택하는가",
    genres: ["현대 로맨스"],
    suggested_male: ["regretful", "obsessive"],
    suggested_female: ["wounded", "strong_willed"],
  },
  {
    id: "mr-gap-doctor",
    category: "갭모에",
    premise: "환자들에게 냉정한 천재 외과의가, 유기견 봉사활동에서 눈물을 훔치는 걸 여주가 목격한다",
    irony: "차가운 줄 알았는데 가장 따뜻한 사람",
    reader_hook: "겉과 속의 간극에서 오는 매력",
    genres: ["현대 로맨스"],
    suggested_male: ["tsundere_m", "sweet"],
    suggested_female: ["cheerful", "wounded"],
  },
  {
    id: "mr-single-dad",
    category: "일상_비일상",
    premise: "재벌 싱글대디의 아이를 맡게 된 보육교사. 아이가 '새 엄마 찾아줄게!'라며 둘을 엮으려 한다",
    irony: "아이의 순수한 작전에 어른 둘이 당함",
    reader_hook: "아이의 작전 + 어른들의 밀당",
    genres: ["현대 로맨스"],
    suggested_male: ["sweet", "tsundere_m"],
    suggested_female: ["cheerful", "innocent"],
  },
];

// ---------------------------------------------------------------------------
// Possession/Reincarnation Romance templates
// ---------------------------------------------------------------------------

const POSSESSION_TEMPLATES: PremiseTemplate[] = [
  {
    id: "ps-reverse-possession",
    category: "메타_유머",
    premise: "악역으로 빙의했는데, 원래 이 몸의 주인이 돌아와서 몸을 공유해야 한다",
    irony: "한 몸에 두 인격. 원래 주인은 악녀답게 살고 싶고, 빙의자는 살려고 선하게 살아야 함",
    reader_hook: "두 인격의 충돌 + 남주는 누구를 좋아하는 건지",
    genres: ["로맨스 빙의물"],
    suggested_male: ["obsessive", "sweet"],
    suggested_female: ["schemer", "strong_willed"],
  },
  {
    id: "ps-game-boss",
    category: "적이_내편",
    premise: "즐기던 게임의 최종 보스 정략결혼 상대로 빙의. 게임 엔딩을 바꾸지 않으면 세계가 멸망",
    irony: "보스를 죽여야 하는데 남편임. 공략해야 살 수 있음",
    reader_hook: "게임 메타 지식으로 보스 남편 공략하는 재미",
    genres: ["로맨스 빙의물"],
    suggested_male: ["tyrant", "obsessive"],
    suggested_female: ["schemer", "strong_willed", "cheerful"],
  },
  {
    id: "ps-extra-nameless",
    category: "망하려는데_잘됨",
    premise: "원작에 이름도 없는 시녀로 빙의. 조용히 살려는데 원작 여주 대신 황제의 눈에 띄어버린다",
    irony: "존재감 없이 살려는데 오히려 원작 여주보다 주목받음",
    reader_hook: "엑스트라의 예상 밖 역전",
    genres: ["로맨스 빙의물"],
    suggested_male: ["tyrant", "tsundere_m"],
    suggested_female: ["indifferent", "cheerful"],
  },
];

// ---------------------------------------------------------------------------
// Fantasy / Cross-genre templates
// ---------------------------------------------------------------------------

const FANTASY_TEMPLATES: PremiseTemplate[] = [
  {
    id: "ft-dungeon-cooking",
    category: "일상_비일상",
    premise: "S급 던전에서 희귀 식재료를 수급해 요리하는 요리사 헌터. 몬스터가 맛있어서 문제",
    irony: "전투가 아니라 요리가 목적인 헌터",
    reader_hook: "던전 + 요리의 의외의 조합",
    genres: ["현대 판타지", "정통 판타지"],
    suggested_male: [],
    suggested_female: [],
  },
  {
    id: "ft-ghost-office",
    category: "일상_비일상",
    premise: "괴담이 실재하는 세계에서 괴담 퇴치 전문 회사에 입사한 신입의 고군분투",
    irony: "괴담보다 무서운 건 야근과 상사",
    reader_hook: "직장물 공감 + 괴담 퇴치 액션",
    genres: ["현대 판타지"],
    suggested_male: [],
    suggested_female: [],
  },
  {
    id: "ft-regression-raise",
    category: "회귀_변주",
    premise: "회귀한 S급 헌터가 전생에서 버림받은 동료들을 이번 생에서 제대로 키운다",
    irony: "전생에서 무시했던 사람들이 사실 핵심이었음을 알기에",
    reader_hook: "육성의 쾌감 + 복선 회수",
    genres: ["현대 판타지", "정통 판타지"],
    suggested_male: [],
    suggested_female: [],
  },
];

// ---------------------------------------------------------------------------
// All templates combined
// ---------------------------------------------------------------------------

export const ALL_PREMISE_TEMPLATES: PremiseTemplate[] = [
  ...ROMANCE_FANTASY_TEMPLATES,
  ...MODERN_ROMANCE_TEMPLATES,
  ...POSSESSION_TEMPLATES,
  ...FANTASY_TEMPLATES,
];

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/**
 * Get templates compatible with a given genre.
 */
export function getTemplatesForGenre(genre: string): PremiseTemplate[] {
  const normalized = genre.toLowerCase();
  return ALL_PREMISE_TEMPLATES.filter((t) =>
    t.genres.some((g) => normalized.includes(g.toLowerCase()) || g.toLowerCase().includes(normalized)),
  );
}

/**
 * Pick N diverse templates for a genre.
 * Ensures templates come from different categories for maximum diversity.
 */
export function pickDiverseTemplates(genre: string, count: number = 3): PremiseTemplate[] {
  const pool = getTemplatesForGenre(genre);
  if (pool.length === 0) return [];
  if (pool.length <= count) return pool;

  // Group by category
  const byCategory = new Map<PremiseCategory, PremiseTemplate[]>();
  for (const t of pool) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }

  // Shuffle categories
  const categories = [...byCategory.keys()].sort(() => Math.random() - 0.5);

  // Pick one from each category until we have enough
  const picked: PremiseTemplate[] = [];
  let catIndex = 0;
  while (picked.length < count) {
    const cat = categories[catIndex % categories.length];
    const templates = byCategory.get(cat)!;
    // Pick random from this category that hasn't been picked yet
    const available = templates.filter((t) => !picked.includes(t));
    if (available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      picked.push(available[idx]);
    }
    catIndex++;
    // Safety: prevent infinite loop if not enough templates
    if (catIndex > categories.length * count) break;
  }

  return picked;
}

/**
 * Format premise templates into a prompt section for PlotWriter.
 */
export function formatPremisePrompt(templates: PremiseTemplate[]): string {
  const sections = templates.map((t, i) => {
    const label = String.fromCharCode(65 + i); // A, B, C
    const archetypeHint = t.suggested_male.length > 0
      ? `\n  추천 캐릭터: ${t.suggested_male.join("/")} 남주 × ${t.suggested_female.join("/")} 여주`
      : "";
    return `**플롯 ${label}의 출발점:**
  전제: ${t.premise}
  재미 포인트: ${t.irony}
  독자 훅: ${t.reader_hook}${archetypeHint}`;
  });

  return `## 각 플롯의 전제 (반드시 이 전제를 기반으로!)

이 전제들은 검증된 "재미 공식"입니다. 전제의 핵심 아이러니를 살리되, 구체적인 세계관·캐릭터·사건은 새롭게 만드세요.

${sections.join("\n\n")}

## 핵심 지침
- 전제의 **아이러니/역설**을 살려야 합니다. 이것이 빠지면 재미가 없습니다.
- 전제를 그대로 쓰지 말고, 구체적인 인물명·장소·사건으로 **살을 붙이세요**.
- 3개 플롯의 전제가 다른 카테고리이므로, **완전히 다른 분위기와 전개**여야 합니다.`;
}
