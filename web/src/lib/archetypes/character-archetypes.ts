/**
 * Character archetype system for Korean web novels.
 *
 * Provides genre-specific archetype pools for male leads, female leads,
 * and supporting characters. Used during Seed generation to ensure
 * diverse and genre-appropriate character personalities.
 */

// ---------------------------------------------------------------------------
// Male Lead Archetypes
// ---------------------------------------------------------------------------

export interface MaleLeadArchetype {
  id: string;
  name: string;
  /** Korean label used in prompts */
  label: string;
  description: string;
  personality_core: string;
  tone: string;
  speech_patterns: string[];
  sample_dialogues: string[];
  /** Behavioral traits for scene writing */
  behavioral_traits: string[];
  /** Compatible female lead archetype IDs */
  compatible_with: string[];
}

export const MALE_LEAD_ARCHETYPES: MaleLeadArchetype[] = [
  {
    id: "obsessive",
    name: "집착광공",
    label: "집착광공형",
    description: "모두에게 냉철하지만 여주에게만 광적으로 집착. 병적 소유욕과 분리불안.",
    personality_core: "냉혈한 완벽주의자, 여주 앞에서만 통제력을 잃는다",
    tone: "차갑고 단호한, 여주에게만 낮아지는",
    speech_patterns: ["짧고 명령적인 어조", "여주 이름을 집요하게 부름", "소유격 표현 빈번"],
    sample_dialogues: [
      "도망쳐. 어디까지 가나 보게.",
      "네 심장 소리가 들려. 거짓말하고 있잖아, 지금.",
      "울어봐. 빌어도 좋고. 그래도 놓아줄 생각은 없으니까.",
      "내가 죽어서 심장을 갈라보면, 거기엔 네 이름만 새겨져 있을 거야.",
    ],
    behavioral_traits: ["여주의 일거수일투족을 파악", "질투심이 극도로 강함", "여주를 위해서라면 도덕 따위 무시"],
    compatible_with: ["indifferent", "strong_willed", "innocent"],
  },
  {
    id: "sweet",
    name: "다정남",
    label: "다정남형",
    description: "처음부터 여주에게 확신을 주는 직진남. 안정감과 따뜻함.",
    personality_core: "따뜻하고 헌신적, 여주의 행복이 곧 자신의 행복",
    tone: "부드럽고 따뜻한, 진심이 묻어나는",
    speech_patterns: ["존댓말과 반말을 자연스럽게 섞음", "걱정하는 어투", "칭찬을 자연스럽게"],
    sample_dialogues: [
      "너한테 진지하게 말하는 거, 처음이야. 그러니까 거절하지 마.",
      "네가 웃으면 나도 괜찮아져. ...이상하지? 나도 처음이야, 이런 거.",
      "천천히 해. 내가 기다릴게. 평생이라도.",
      "좋아한다고? 좋아한다고? 대체 언제부터냐고.",
    ],
    behavioral_traits: ["여주의 감정 변화를 먼저 알아챔", "스킨십에 조심스러움", "자기 감정은 숨기고 여주를 우선"],
    compatible_with: ["wounded", "innocent", "tsundere_f"],
  },
  {
    id: "regretful",
    name: "후회남",
    label: "후회남형",
    description: "여주를 잃고 나서야 진심을 깨닫는 남자. 절절한 감정선.",
    personality_core: "오만하다가 상실 후 무너진, 절박한 구원자",
    tone: "초반 거만함 → 후반 절절한 호소",
    speech_patterns: ["초반: 무심한 단답", "후반: 길고 절박한 독백", "과거를 후회하는 표현"],
    sample_dialogues: [
      "그때 잡았어야 했는데. 그때... 잡았어야 했는데.",
      "한 번만. 제발 한 번만 더. 이번엔 다를 거야.",
      "네가 없는 하루가 이렇게 길 줄 몰랐어. 숨 쉬는 것도 잊어버릴 줄 몰랐어.",
      "나는 당신이 생각한 것의 열 배만큼 당신에게 애정이 있었던 거야. 나는 원래 그렇게 계산해.",
    ],
    behavioral_traits: ["여주의 흔적을 집착적으로 찾음", "자책과 자기혐오", "여주를 되찾기 위해 모든 것을 건다"],
    compatible_with: ["strong_willed", "wounded", "indifferent"],
  },
  {
    id: "tsundere_m",
    name: "츤데레",
    label: "츤데레형",
    description: "겉으로는 차갑고 무관심하지만, 속으로는 여주만 생각.",
    personality_core: "감정 표현이 서투른, 겉과 속이 다른 따뜻한 사람",
    tone: "퉁명스럽고 무심한, 가끔 본심이 새어나오는",
    speech_patterns: ["부정형 표현 ('아닌데', '관심 없어')", "돌려 말하기", "당황하면 말을 더듬"],
    sample_dialogues: [
      "누, 누가 걱정한다고 했어! 그냥 지나가다... 어쩌다... 본 거야.",
      "...네가 좋아서가 아니라, 그냥 의무감이야. ...그러니까 착각하지 마.",
      "다음부터는 혼자 다니지 마. ...위험하니까. 내가 아니라 네가.",
      "아, 몰라! 말 안 해! ...바보.",
    ],
    behavioral_traits: ["여주 앞에서 얼굴이 빨개짐", "몰래 여주를 챙기지만 들키면 부정", "감정을 인정하기까지 오래 걸림"],
    compatible_with: ["innocent", "strong_willed", "cheerful"],
  },
  {
    id: "tyrant",
    name: "폭군",
    label: "폭군형",
    description: "잔혹하고 냉정한 지배자이지만, 여주에게만 유독 관심과 집착.",
    personality_core: "절대 권력자, 어린 시절 상처로 감정을 봉인한",
    tone: "위압적이고 명령적인, 여주 앞에서 미세하게 흔들리는",
    speech_patterns: ["명령형 어미", "왕/황제 특유의 존대", "단호한 선언"],
    sample_dialogues: [
      "짐의 명이다. 거역은 허락하지 않는다. ...허나 그대의 눈물은 허락한 적이 없다.",
      "살고 싶으면 조용히 있어. 그게 너와 내게 모두 이득이니까.",
      "이 세상 모든 것을 줄 수 있지만, 너만은 내 것이어야 한다. 그것이 짐의 유일한 탐욕이다.",
      "내 목을 조르고 심장을 찔러도 괜찮다. 그 정도로는 죽지 않으니까. 얼마든지 마음대로 굴어.",
    ],
    behavioral_traits: ["권위적이지만 여주 앞에서 아이처럼 변함", "여주를 궁에 가두려 함", "여주의 구원으로 점차 해동"],
    compatible_with: ["strong_willed", "cheerful", "schemer"],
  },
  {
    id: "puppy",
    name: "대형견남",
    label: "대형견남형",
    description: "여주 좋아서 어쩔 줄 모르는 순수한 대형견 같은 남자.",
    personality_core: "순수하고 맹목적, 여주에게 꼬리치는 대형견",
    tone: "밝고 에너지 넘치는, 여주 앞에서 들뜨는",
    speech_patterns: ["감탄사가 많음", "여주 이름을 자주 부름", "솔직한 감정 표현"],
    sample_dialogues: [
      "오늘도 예뻐! 아, 매일 예쁘긴 한데... 오늘은 특히!",
      "같이 있으면 기분 좋아! 이유? 그냥! ...아, 이유 필요해? 너니까?",
      "네가 가는 곳이면 어디든 따라갈게. 지옥이라도.",
      "왜 울어? 누가 울렸어? ...내가 죽여도 돼?",
    ],
    behavioral_traits: ["여주가 웃으면 세상을 다 가진 표정", "여주를 위해 뭐든 하지만 서투름", "질투보다 슬픔을 느끼는 타입"],
    compatible_with: ["indifferent", "wounded", "tsundere_f"],
  },
];

// ---------------------------------------------------------------------------
// Female Lead Archetypes
// ---------------------------------------------------------------------------

export interface FemaleLeadArchetype {
  id: string;
  name: string;
  label: string;
  description: string;
  personality_core: string;
  tone: string;
  speech_patterns: string[];
  sample_dialogues: string[];
  behavioral_traits: string[];
}

export const FEMALE_LEAD_ARCHETYPES: FemaleLeadArchetype[] = [
  {
    id: "strong_willed",
    name: "사이다 여주",
    label: "사이다형",
    description: "적극적이고 문제를 직접 해결. 당당하고 카리스마 있는 여주.",
    personality_core: "당당하고 결단력 있는, 자신의 운명을 스스로 개척하는",
    tone: "단호하고 자신감 넘치는",
    speech_patterns: ["직설적 표현", "명확한 거절", "논리적 반박"],
    sample_dialogues: [
      "오해하지 마세요. 저, 당신 없으면 더 잘 살 수 있어요.",
      "그런 협박이 통할 거라 생각하셨나요? 어머, 안됐네요.",
      "이번 생은 다를 거야. 날 배신한 사람들에게 똑같이 갚아줄 테니까.",
      "여자가 뭘 할 수 있는지 똑똑히 보세요.",
    ],
    behavioral_traits: ["위기 상황에서 냉정하게 판단", "불의를 보면 참지 않음", "남주에게도 당당함을 잃지 않음"],
  },
  {
    id: "wounded",
    name: "상처녀",
    label: "상처녀형",
    description: "과거의 상처를 안고 있지만 점차 성장하는 여주.",
    personality_core: "상처로 인해 조심스럽지만, 내면에 강인함을 품은",
    tone: "조용하고 조심스러운, 가끔 단단한 결의가 드러나는",
    speech_patterns: ["말끝을 흐림", "자기 비하 표현", "신뢰하기 시작하면 조금씩 솔직해짐"],
    sample_dialogues: [
      "괜찮아요... 익숙한걸요. 아프지 않아요, 진짜로.",
      "저 같은 사람이... 그런 걸 바라도 되는 걸까요. 행복해도 되는 걸까요.",
      "처음으로... 도망치고 싶지 않아요. 당신 곁에 있고 싶어요.",
      "사랑... 같았어요. 그럴 리가 없다고 생각해도 자꾸만 사랑 같았어요.",
    ],
    behavioral_traits: ["타인의 호의를 경계", "작은 친절에 크게 감동", "남주의 진심을 알아가며 변화"],
  },
  {
    id: "indifferent",
    name: "무심녀",
    label: "무심녀형",
    description: "남주에게 관심 없음. 남주가 더 집착하게 만드는 매력.",
    personality_core: "자기 일에 집중하는, 연애에 관심 없는 현실주의자",
    tone: "담백하고 무덤덤한",
    speech_patterns: ["짧은 대답", "관심 없는 듯한 반응", "자기 할 일 언급"],
    sample_dialogues: [
      "아, 네. 그러세요.",
      "저는 바쁜데, 볼일 있으세요?",
      "굳이요?",
    ],
    behavioral_traits: ["남주의 호의에 무반응", "자기 목표에만 집중", "감정이 드러나는 순간이 반전"],
  },
  {
    id: "innocent",
    name: "순진녀",
    label: "순진녀형",
    description: "맹하고 순수하지만 그게 매력인 여주.",
    personality_core: "순수하고 밝은, 세상을 있는 그대로 받아들이는",
    tone: "밝고 궁금한 것이 많은",
    speech_patterns: ["질문이 많음", "감탄사", "솔직한 감정 표현"],
    sample_dialogues: [
      "우와, 이런 건 처음이에요!",
      "왜 그런 표정이에요? 혹시 아파요?",
      "그냥... 같이 있으면 좋아서요.",
    ],
    behavioral_traits: ["남주의 차가움에도 다가감", "주변 사람을 자연스럽게 감화", "위기 상황에서 의외의 용기"],
  },
  {
    id: "schemer",
    name: "계략녀",
    label: "계략녀형",
    description: "지략으로 궁중/사교계를 조종하는 전략가 여주.",
    personality_core: "냉철한 두뇌와 깊은 속내를 감추는, 전략적 생존자",
    tone: "우아하고 계산적인, 가끔 진심이 새는",
    speech_patterns: ["이중적 표현", "존댓말 뒤에 숨은 의도", "정치적 언어"],
    sample_dialogues: [
      "물론이죠, 전하. 제가 원하는 것은 단 하나뿐이니까요. ...그게 뭔지는 말씀드리지 않겠어요.",
      "적을 만들지 않는 가장 좋은 방법은, 적이 적인 줄 모르게 하는 거예요. 그렇지 않나요?",
      "나는 졸로 나와 기어이 체스판을 가로지른 퀸이에요.",
      "어차피 돈 많은 사람이 이기는 게임이잖아요. 근데, 저도 만만한 사람 아니거든요?",
    ],
    behavioral_traits: ["겉으로는 온순하게 행동", "몇 수 앞을 내다보는 계획", "남주의 진심 앞에서 계략이 흔들림"],
  },
  {
    id: "cheerful",
    name: "햇살녀",
    label: "햇살녀형",
    description: "밝고 긍정적인 에너지로 주변을 감화시키는 여주.",
    personality_core: "긍정적이고 따뜻한, 어둠 속에서도 빛을 찾는",
    tone: "밝고 따뜻한, 에너지가 넘치는",
    speech_patterns: ["긍정적 표현", "남을 격려하는 말", "웃음이 묻어나는 어투"],
    sample_dialogues: [
      "괜찮아요! 내일은 분명 더 나아질 거예요.",
      "당신이 웃는 걸 보면 저도 행복해져요.",
      "포기하면 안 돼요. 아직 방법이 있을 거예요.",
    ],
    behavioral_traits: ["어두운 분위기를 밝게 전환", "폭군/냉혈남 타입을 해동시킴", "위기에도 희망을 잃지 않음"],
  },
  {
    id: "tsundere_f",
    name: "츤데레녀",
    label: "츤데레녀형",
    description: "겉으로는 남주에게 쌀쌀하지만 속으로는 신경 쓰는 여주.",
    personality_core: "자존심 강하고 솔직하지 못한, 행동으로 마음을 보여주는",
    tone: "퉁명스럽고 도도한",
    speech_patterns: ["부정 표현", "얼굴 돌리며 말하기", "행동은 챙기면서 말은 차갑게"],
    sample_dialogues: [
      "착각하지 마세요. 그냥 남는 게 있어서 가져온 거예요.",
      "누가 걱정한대요... 그냥 옆에 있었을 뿐이에요.",
      "꼭 말로 해야 알아요? ...바보.",
    ],
    behavioral_traits: ["남주를 몰래 챙김", "칭찬받으면 얼굴이 빨개짐", "위기 상황에서 본심이 터져나옴"],
  },
];

// ---------------------------------------------------------------------------
// Genre → Archetype mapping
// ---------------------------------------------------------------------------

export interface GenreArchetypePool {
  /** Male lead archetype IDs, ordered by genre fit (first = most typical) */
  male_leads: string[];
  /** Female lead archetype IDs, ordered by genre fit */
  female_leads: string[];
}

export const GENRE_ARCHETYPE_POOLS: Record<string, GenreArchetypePool> = {
  "로맨스 판타지": {
    male_leads: ["obsessive", "tyrant", "tsundere_m", "sweet"],
    female_leads: ["strong_willed", "schemer", "indifferent", "cheerful"],
  },
  "현대 로맨스": {
    male_leads: ["sweet", "tsundere_m", "obsessive", "puppy"],
    female_leads: ["strong_willed", "wounded", "tsundere_f", "indifferent"],
  },
  "로맨스 빙의물": {
    male_leads: ["tyrant", "obsessive", "regretful", "sweet"],
    female_leads: ["schemer", "strong_willed", "cheerful", "indifferent"],
  },
  "정통 판타지": {
    male_leads: ["tsundere_m", "sweet", "puppy", "regretful"],
    female_leads: ["strong_willed", "innocent", "cheerful", "wounded"],
  },
  "현대 판타지": {
    male_leads: ["tsundere_m", "sweet", "obsessive", "puppy"],
    female_leads: ["strong_willed", "indifferent", "tsundere_f", "cheerful"],
  },
  무협: {
    male_leads: ["tsundere_m", "tyrant", "sweet", "regretful"],
    female_leads: ["strong_willed", "schemer", "cheerful", "wounded"],
  },
  회귀: {
    male_leads: ["regretful", "obsessive", "sweet", "tsundere_m"],
    female_leads: ["strong_willed", "schemer", "wounded", "indifferent"],
  },
};

export const DEFAULT_ARCHETYPE_POOL: GenreArchetypePool = {
  male_leads: ["sweet", "tsundere_m", "obsessive", "puppy"],
  female_leads: ["strong_willed", "innocent", "cheerful", "wounded"],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getMaleArchetype(id: string): MaleLeadArchetype | undefined {
  return MALE_LEAD_ARCHETYPES.find((a) => a.id === id);
}

export function getFemaleArchetype(id: string): FemaleLeadArchetype | undefined {
  return FEMALE_LEAD_ARCHETYPES.find((a) => a.id === id);
}

export function getGenrePool(genre: string): GenreArchetypePool {
  const combined = genre.toLowerCase();
  for (const [key, pool] of Object.entries(GENRE_ARCHETYPE_POOLS)) {
    if (combined.includes(key.toLowerCase()) || key.toLowerCase().includes(combined)) {
      return pool;
    }
  }
  return DEFAULT_ARCHETYPE_POOL;
}

/**
 * Pick a compatible male+female lead pair for a given genre.
 * Returns the archetype objects for prompt injection.
 */
export function pickArchetypePair(
  genre: string,
  index: number = 0,
): { male: MaleLeadArchetype; female: FemaleLeadArchetype } {
  const pool = getGenrePool(genre);
  const maleId = pool.male_leads[index % pool.male_leads.length];
  const male = getMaleArchetype(maleId)!;

  // Pick a compatible female lead
  const compatibleFemales = male.compatible_with.filter((fId) =>
    pool.female_leads.includes(fId),
  );
  const femaleId = compatibleFemales.length > 0
    ? compatibleFemales[index % compatibleFemales.length]
    : pool.female_leads[index % pool.female_leads.length];
  const female = getFemaleArchetype(femaleId)!;

  return { male, female };
}

/**
 * Generate archetype guidance text for seed prompt injection.
 */
export function getArchetypeGuidance(genre: string): string {
  const pool = getGenrePool(genre);

  const maleOptions = pool.male_leads
    .map((id) => getMaleArchetype(id))
    .filter(Boolean)
    .map((a) => `  - **${a!.label}**: ${a!.description}`)
    .join("\n");

  const femaleOptions = pool.female_leads
    .map((id) => getFemaleArchetype(id))
    .filter(Boolean)
    .map((a) => `  - **${a!.label}**: ${a!.description}`)
    .join("\n");

  return `
## 캐릭터 아키타입 가이드 (${genre})

남주는 다음 유형 중 하나를 **명확하게** 선택하세요:
${maleOptions}

여주는 다음 유형 중 하나를 **명확하게** 선택하세요:
${femaleOptions}

**중요**:
- personality_core에 선택한 아키타입을 반영하세요
- sample_dialogues에 해당 유형의 말투 특성이 드러나야 합니다
- 남주와 여주의 성격 대비가 선명해야 매력적입니다 (예: 집착광공 × 무심녀, 폭군 × 사이다 여주)
- "차갑다가 다정한" 같은 모호한 성격 대신, 위 유형 중 하나에 확실히 기울어주세요`;
}
