import { getAgent } from "./llm-agent";
import { getGenrePrompt } from "@/lib/prompts/genre-prompts";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { PlotOption } from "@/lib/schema/plot";
import type { TokenUsage } from "@/lib/agents/types";
import {
  getGenrePool,
  getMaleArchetype,
  getFemaleArchetype,
} from "@/lib/archetypes/character-archetypes";
import {
  pickDiverseTemplates,
  formatPremisePrompt,
} from "@/lib/prompts/premise-templates";

// --- Creative constraint pools for plot diversity ---

const DEFAULT_PROTAGONIST_TYPES = [
  "평범한 회사원/학생이", "이미 정상에 있는 자가", "악역/안티히어로가",
  "조력자/사이드킥이", "은퇴한 전설이", "기억을 잃은 자가",
  "모두에게 미움받는 자가", "거짓말쟁이가", "진짜 약자가",
  "적의 자녀/제자가", "시간이 얼마 남지 않은 자가", "두 세계에 걸친 자가",
];

const DEFAULT_STARTING_SITUATIONS = [
  "가장 소중한 것을 잃은 직후", "거대한 비밀을 우연히 알게 된 순간",
  "잘못된 선택의 대가를 치르는 중", "원치 않는 능력/저주에 걸린 순간",
  "가장 신뢰하던 사람에게 이용당한 직후", "죽음의 문턱에서 돌아온 직후",
  "자신이 주인공이 아님을 깨달은 순간", "적과 협력해야만 하는 상황",
  "시스템/규칙 자체가 잘못됐음을 발견한 순간", "사랑하는 사람의 적이 되어버린 순간",
];

const DEFAULT_STRUCTURAL_CONSTRAINTS = [
  "주인공이 점점 약해지는 이야기 (역성장)",
  "주인공이 자기 자신이 최종 보스임을 알게 되는 이야기",
  "두 시점이 교차하며 같은 사건을 다르게 보는 이야기",
  "주인공의 목표가 중반에 완전히 뒤바뀌는 이야기",
  "독자가 응원하던 대상이 사실 잘못된 편이었던 이야기",
  "주인공이 능력 없이 지략으로만 승부하는 이야기",
  "시간이 거꾸로 가는 구조의 이야기",
  "주인공이 '시스템'을 만든 장본인이었던 이야기",
  "3개의 서로 다른 시대를 넘나드는 이야기",
  "주인공의 동반자/반려가 진짜 주인공인 이야기",
];

/**
 * Structured protagonist type with compatible archetype constraints.
 * Prevents nonsensical combos like "남주의 입양딸" + "집착광공 남주".
 */
interface ProtagonistType {
  text: string;
  /** Allowed male archetype IDs. If empty, all are allowed. */
  allowed_male: string[];
  /** Allowed female archetype IDs. If empty, all are allowed. */
  allowed_female: string[];
}

const ROMANCE_PROTAGONIST_ENTRIES: ProtagonistType[] = [
  // 클래식 로판 — 대부분 조합 자유
  { text: "정략결혼을 앞둔 영애가", allowed_male: [], allowed_female: [] },
  { text: "전생에서 버림받은 황비가", allowed_male: ["regretful", "obsessive", "tyrant"], allowed_female: ["strong_willed", "wounded", "schemer"] },
  { text: "소설 속 악녀로 빙의한 여주가", allowed_male: [], allowed_female: ["schemer", "strong_willed", "cheerful"] },
  { text: "냉혈 공작의 계약 부인이", allowed_male: ["obsessive", "tsundere_m", "tyrant"], allowed_female: [] },
  { text: "왕궁의 시녀로 위장 잠입한 귀족이", allowed_male: ["tyrant", "tsundere_m"], allowed_female: ["schemer", "strong_willed"] },
  { text: "적국의 공주가", allowed_male: ["tyrant", "tsundere_m", "obsessive"], allowed_female: ["strong_willed", "schemer"] },
  { text: "밤마다 악몽을 꾸는 성녀가", allowed_male: ["sweet", "obsessive"], allowed_female: ["wounded", "innocent"] },
  { text: "가짜 성녀로 살아가는 평민이", allowed_male: [], allowed_female: ["schemer", "cheerful", "indifferent"] },
  // 육아/가족물 — 남주는 다정남/츤데레만 (부성애 캐릭터)
  { text: "졸지에 폭군의 아이 엄마가 된 시녀가", allowed_male: ["tyrant", "tsundere_m"], allowed_female: ["cheerful", "wounded", "innocent"] },
  { text: "악역 계모로 빙의했지만 아이를 진심으로 키우기 시작한 여주가", allowed_male: ["sweet", "tsundere_m", "puppy"], allowed_female: ["cheerful", "strong_willed"] },
  { text: "남주의 아이를 대신 키우게 된 시녀가", allowed_male: ["tsundere_m", "sweet", "tyrant"], allowed_female: ["cheerful", "wounded", "innocent"] },
  // 영지/경영물
  { text: "망한 영지에 빙의해 영지를 살려야 하는 관리인이", allowed_male: ["tsundere_m", "sweet"], allowed_female: ["strong_willed", "schemer"] },
  { text: "빚더미 가문을 물려받은 영애가", allowed_male: [], allowed_female: ["strong_willed", "schemer"] },
  { text: "3년 계약으로 영지를 관리하다 과로사한 뒤 회귀한 관리인이", allowed_male: ["regretful", "sweet"], allowed_female: ["strong_willed", "indifferent"] },
  // 정치/여제물
  { text: "황제 자리를 노리는 유일한 황녀가", allowed_male: ["tsundere_m", "obsessive", "sweet"], allowed_female: ["strong_willed", "schemer"] },
  { text: "후궁에서 살아남아야 하는 이세계인이", allowed_male: ["tyrant", "obsessive"], allowed_female: ["schemer", "strong_willed", "cheerful"] },
  { text: "외교관으로 위장한 첩보원 귀족이", allowed_male: ["tsundere_m", "sweet"], allowed_female: ["schemer", "strong_willed"] },
  // 시한부/저주
  { text: "시한부 선고를 받은 공주가", allowed_male: ["obsessive", "sweet", "regretful"], allowed_female: ["wounded", "cheerful"] },
  { text: "저주로 밤마다 괴물로 변하는 영애가", allowed_male: ["sweet", "obsessive"], allowed_female: ["wounded", "indifferent"] },
  { text: "수명이 1년밖에 남지 않은 성녀가", allowed_male: ["obsessive", "sweet", "puppy"], allowed_female: ["wounded", "cheerful", "indifferent"] },
  // 착각물/코미디
  { text: "죽는 연기를 했는데 진짜 대단한 사람으로 착각당한 엑스트라가", allowed_male: ["puppy", "tsundere_m"], allowed_female: ["cheerful", "indifferent"] },
  { text: "호감도 시스템이 눈에 보이는 빙의자가", allowed_male: [], allowed_female: ["cheerful", "schemer", "strong_willed"] },
  // 수인물
  { text: "흑표범 수인 공작의 계약 동반자가 된 토끼 수인이", allowed_male: ["tsundere_m", "obsessive"], allowed_female: ["cheerful", "innocent"] },
];

// Flat array for backward compat with pickRandom
const ROMANCE_PROTAGONIST_TYPES = ROMANCE_PROTAGONIST_ENTRIES.map((e) => e.text);

const ROMANCE_STARTING_SITUATIONS = [
  // 관계 시작 트리거
  "원수 집안의 상속자와 강제로 혼약된 순간", "전생의 기억이 갑자기 돌아온 직후",
  "죽을 운명의 캐릭터로 빙의한 순간", "상대방의 치명적 약점을 우연히 알게 된 순간",
  "약혼자의 배신을 목격한 직후", "가문의 비밀이 연인에게 들킬 위기",
  // 계약/거래
  "이혼 조건으로 3년 계약결혼을 제안받은 순간", "빚을 갚기 위해 가짜 약혼을 수락한 직후",
  "결혼 계약서를 다시 쓰자고 남편에게 통보한 순간",
  // 육아/가족
  "갑자기 '엄마!'라고 부르는 아이가 나타난 순간", "죽은 줄 알았던 아이가 살아있다는 소식",
  // 정치/생존
  "왕좌를 놓고 연인과 경쟁해야 하는 상황", "후궁 서열 꼴찌에서 시작하는 궁중 생존기",
  "황제가 이혼 서류를 들이밀며 유배를 선고한 순간",
  // 시한부/저주
  "시한부 선고를 받고 남은 시간을 역산하기 시작한 순간",
  "저주가 발동해 매일 밤 몸이 변하기 시작한 순간",
  // 착각/코미디
  "망하려고 했는데 오히려 잘되기 시작한 순간",
  "죽는 척했는데 모두가 진짜 강자로 오해한 순간",
];

const ROMANCE_STRUCTURAL_CONSTRAINTS = [
  // 관계 역전
  "여주가 남주를 공략하는 게 아니라 남주가 여주를 쫓아다니는 역전 구조",
  "처음엔 적이었던 두 사람이 점점 가까워지는 적에서 연인 구조",
  // 이중성/비밀
  "두 사람이 서로 정체를 숨기고 만나는 이중 정체 로맨스",
  "남주와 여주의 시점이 교차하며 서로의 진심을 독자만 아는 구조",
  // 계약→진심 딜레마
  "가짜 관계가 진짜가 되지만 진짜가 된 순간 관계를 유지할 수 없는 딜레마",
  "계약 기한이 다가올수록 감정이 깊어지는 타임리밋 로맨스",
  // 시간 장치
  "시간이 제한된 사랑 (저주, 수명, 계약 기한 등)",
  "한쪽이 기억을 잃어 처음부터 다시 사랑에 빠지는 리셋 로맨스",
  "전생/현생의 감정이 충돌하는 이중 감정선 구조",
  "여러 번 회귀하며 매번 다른 선택지를 고르는 다회귀 구조",
  // 감정 장치
  "감정선이 무르익을 때마다 외부 위기가 터지는 긴장-로맨스 교차 구조",
  "연인 관계인데 서로 다른 진영에 서야 하는 비극적 구조",
  // 가족/성장
  "아이를 키우며 서로의 진심을 발견하는 육아 로맨스 구조",
  "냉혈남이 아이 앞에서 무너지는 갭 모에 중심 구조",
  // 착각/코미디
  "주인공이 망하려고 하면 할수록 오히려 잘되는 역설 구조",
  "주인공의 의도와 정반대로 주변이 해석하는 착각물 구조",
  // 경영/정치
  "영지/사업을 성장시키며 로맨스가 곁들여지는 경영 로맨스 구조",
  "후궁/궁정 내 정치 암투 속에서 사랑을 찾는 서바이벌 로맨스",
];

// --- Genre-aware constraint selection ---

export function isRomanceGenre(genre: string): boolean {
  return genre.includes("로맨스") || genre.includes("로판") || genre.includes("빙의");
}

function getConstraints(genre: string) {
  if (isRomanceGenre(genre)) {
    return {
      protagonists: ROMANCE_PROTAGONIST_TYPES,
      situations: ROMANCE_STARTING_SITUATIONS,
      structures: ROMANCE_STRUCTURAL_CONSTRAINTS,
    };
  }
  return {
    protagonists: DEFAULT_PROTAGONIST_TYPES,
    situations: DEFAULT_STARTING_SITUATIONS,
    structures: DEFAULT_STRUCTURAL_CONSTRAINTS,
  };
}

export function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Build the creative seeds prompt with genre-aware random constraints.
 */
/**
 * Pick archetype pairing that's compatible with a given protagonist type.
 * Uses the protagonist's allowed_male/allowed_female constraints to filter.
 */
function pickArchetypePairingForProtagonist(
  protagonistText: string,
  genre: string,
): { maleLabel: string; femaleLabel: string; comboDesc: string } {
  const pool = getGenrePool(genre);
  const entry = ROMANCE_PROTAGONIST_ENTRIES.find((e) => e.text === protagonistText);

  // Filter male archetypes: use protagonist constraint if set, else genre pool
  const allowedMaleIds = entry?.allowed_male?.length
    ? entry.allowed_male.filter((id) => pool.male_leads.includes(id))
    : pool.male_leads;
  const maleId = pickRandom(allowedMaleIds.length > 0 ? allowedMaleIds : pool.male_leads, 1)[0];
  const male = getMaleArchetype(maleId)!;

  // Filter female archetypes: use protagonist constraint, then male compatibility, then genre pool
  const allowedFemaleIds = entry?.allowed_female?.length
    ? entry.allowed_female.filter((id) => pool.female_leads.includes(id))
    : pool.female_leads;
  // Prefer archetypes that are both allowed AND compatible with the male
  const compatAndAllowed = allowedFemaleIds.filter((fId) => male.compatible_with.includes(fId));
  const femaleId = compatAndAllowed.length > 0
    ? pickRandom(compatAndAllowed, 1)[0]
    : pickRandom(allowedFemaleIds.length > 0 ? allowedFemaleIds : pool.female_leads, 1)[0];
  const female = getFemaleArchetype(femaleId)!;

  return {
    maleLabel: male.label,
    femaleLabel: female.label,
    comboDesc: `${male.label} 남주(${male.description.split(".")[0]}) × ${female.label} 여주(${female.description.split(".")[0]})`,
  };
}

export function buildCreativeSeeds(genre: string): string {
  // Try premise templates first (research-backed "fun formulas")
  const templates = pickDiverseTemplates(genre, 3);
  if (templates.length >= 3) {
    return buildPremiseBasedSeeds(genre, templates);
  }

  // Fallback: old random combinatorial system
  return buildRandomSeeds(genre);
}

/**
 * Build seeds from curated premise templates (preferred path).
 */
function buildPremiseBasedSeeds(genre: string, templates: ReturnType<typeof pickDiverseTemplates>): string {
  const premisePrompt = formatPremisePrompt(templates);

  // Add archetype pairings based on template suggestions
  const archetypeSections = templates.map((t, i) => {
    if (!isRomanceGenre(genre)) return "";
    const pool = getGenrePool(genre);
    const malePool = t.suggested_male.length > 0
      ? t.suggested_male.filter((id) => pool.male_leads.includes(id))
      : pool.male_leads;
    const femalePool = t.suggested_female.length > 0
      ? t.suggested_female.filter((id) => pool.female_leads.includes(id))
      : pool.female_leads;
    const maleId = pickRandom(malePool.length > 0 ? malePool : pool.male_leads, 1)[0];
    const male = getMaleArchetype(maleId)!;
    const femaleCompatible = femalePool.filter((fId) => male.compatible_with.includes(fId));
    const femaleId = femaleCompatible.length > 0
      ? pickRandom(femaleCompatible, 1)[0]
      : pickRandom(femalePool.length > 0 ? femalePool : pool.female_leads, 1)[0];
    const female = getFemaleArchetype(femaleId)!;
    const label = String.fromCharCode(65 + i);
    return `\n**플롯 ${label} 캐릭터**: ${male.label} 남주(${male.description.split(".")[0]}) × ${female.label} 여주(${female.description.split(".")[0]})
  → male_archetype: "${male.label}", female_archetype: "${female.label}"`;
  });

  return `장르: ${genre}

${premisePrompt}
${archetypeSections.filter(Boolean).join("\n")}

## 추가 지침
- male_archetype, female_archetype 필드에 위에 지정된 라벨을 그대로 넣으세요
- 전제의 핵심 아이러니를 반드시 로그라인과 전개에 녹이세요
- 전제를 "설명"하지 말고 구체적 인물·장소·사건으로 "보여주세요"`;
}

/**
 * Fallback: old random combinatorial system for genres without enough templates.
 */
function buildRandomSeeds(genre: string): string {
  const { protagonists: protPool, situations: sitPool, structures: strPool } = getConstraints(genre);
  const protagonists = pickRandom(protPool, 3);
  const situations = pickRandom(sitPool, 3);
  const structures = pickRandom(strPool, 3);
  const pairA = isRomanceGenre(genre) ? pickArchetypePairingForProtagonist(protagonists[0], genre) : { maleLabel: "", femaleLabel: "", comboDesc: "" };
  const pairB = isRomanceGenre(genre) ? pickArchetypePairingForProtagonist(protagonists[1], genre) : { maleLabel: "", femaleLabel: "", comboDesc: "" };
  const pairC = isRomanceGenre(genre) ? pickArchetypePairingForProtagonist(protagonists[2], genre) : { maleLabel: "", femaleLabel: "", comboDesc: "" };

  const archetypeSection = isRomanceGenre(genre) ? `
  캐릭터 조합: ${pairA.comboDesc}
  → male_archetype: "${pairA.maleLabel}", female_archetype: "${pairA.femaleLabel}"` : "";

  const archetypeSectionB = isRomanceGenre(genre) ? `
  캐릭터 조합: ${pairB.comboDesc}
  → male_archetype: "${pairB.maleLabel}", female_archetype: "${pairB.femaleLabel}"` : "";

  const archetypeSectionC = isRomanceGenre(genre) ? `
  캐릭터 조합: ${pairC.comboDesc}
  → male_archetype: "${pairC.maleLabel}", female_archetype: "${pairC.femaleLabel}"` : "";

  return `장르: ${genre}

## 각 플롯의 출발점 (반드시 반영!)
이 제약조건을 기반으로 각 플롯을 만들되, 장르에 맞게 자유롭게 변형하세요.

**플롯 A**: ${protagonists[0]} ${situations[0]}에 처한 이야기.
  구조적 특징: ${structures[0]}${archetypeSection}

**플롯 B**: ${protagonists[1]} ${situations[1]}에 처한 이야기.
  구조적 특징: ${structures[1]}${archetypeSectionB}

**플롯 C**: ${protagonists[2]} ${situations[2]}에 처한 이야기.
  구조적 특징: ${structures[2]}${archetypeSectionC}

## 중요 지침
- 각 플롯의 logline에 캐릭터 아키타입의 특성이 자연스럽게 묻어나야 합니다
- male_archetype, female_archetype 필드에 위에 지정된 라벨을 그대로 넣으세요
- 3개 플롯은 서로 **완전히 다른 캐릭터 조합과 이야기**여야 합니다
- 조건이 장르와 안 맞으면 장르에 맞게 변형해도 됩니다
- **주인공 유형과 캐릭터 아키타입이 논리적으로 맞아야 합니다** (예: 육아물 주인공이면 남주는 부성애 캐릭터여야 함)`;
}

export interface PlotContext {
  genre: string;
  detectedGenre: string;
  plots: PlotOption[];
  usage: TokenUsage;
}

export interface PlotPipelineAgent {
  name: string;
  run(ctx: PlotContext): Promise<PlotContext>;
}

/**
 * PlotWriter: generates 3 draft plot options using genre guide + creative constraints.
 */
export class PlotWriter implements PlotPipelineAgent {
  name = "plot-writer";

  async run(ctx: PlotContext): Promise<PlotContext> {
    const creativeSeeds = buildCreativeSeeds(ctx.genre);
    const prompt = getGenrePrompt(ctx.detectedGenre, creativeSeeds, 3);

    const agent = getAgent();
    const result = await agent.callStructured({
      prompt,
      system: "당신은 카카오페이지 웹소설 전문 기획자입니다. 남들이 안 쓰는 이야기를 찾아내는 능력이 당신의 무기입니다.",
      temperature: 0.9,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-generation",
    });

    ctx.plots = result.data;
    ctx.usage = {
      prompt_tokens: ctx.usage.prompt_tokens + result.usage.prompt_tokens,
      completion_tokens: ctx.usage.completion_tokens + result.usage.completion_tokens,
      total_tokens: ctx.usage.total_tokens + result.usage.total_tokens,
      cost_usd: ctx.usage.cost_usd + result.usage.cost_usd,
    };

    return ctx;
  }
}
