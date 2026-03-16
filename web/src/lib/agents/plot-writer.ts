import { getAgent } from "./llm-agent";
import { getGenrePrompt } from "@/lib/prompts/genre-prompts";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { PlotOption } from "@/lib/schema/plot";
import type { TokenUsage } from "@/lib/agents/types";

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

const ROMANCE_PROTAGONIST_TYPES = [
  "정략결혼을 앞둔 영애가", "전생에서 버림받은 황비가", "소설 속 악녀로 빙의한 여주가",
  "냉혈 공작의 계약 부인이", "왕궁의 시녀로 위장 잠입한 귀족이", "저주받은 기사단장이",
  "적국의 공주가", "마법을 잃은 대마법사가", "가문에서 쫓겨난 서자가",
  "밤마다 악몽을 꾸는 성녀가", "혼약자에게 차인 공작 영애가", "가짜 성녀로 살아가는 평민이",
];

const ROMANCE_STARTING_SITUATIONS = [
  "원수 집안의 상속자와 강제로 혼약된 순간", "전생의 기억이 갑자기 돌아온 직후",
  "죽을 운명의 캐릭터로 빙의한 순간", "상대방의 치명적 약점을 우연히 알게 된 순간",
  "남주/여주의 진심을 의심하게 되는 사건 직후", "두 명의 남주 사이에서 선택해야 하는 상황",
  "사랑하는 사람이 자신을 기억 못하는 상황", "왕좌를 놓고 연인과 경쟁해야 하는 상황",
  "약혼자의 배신을 목격한 직후", "가문의 비밀이 연인에게 들킬 위기",
];

const ROMANCE_STRUCTURAL_CONSTRAINTS = [
  "여주가 남주를 공략하는 게 아니라 남주가 여주를 쫓아다니는 역전 구조",
  "두 사람이 서로 정체를 숨기고 만나는 이중 정체 로맨스",
  "남주와 여주의 시점이 교차하며 서로의 진심을 독자만 아는 구조",
  "처음엔 적이었던 두 사람이 점점 가까워지는 적에서 연인 구조",
  "감정선이 무르익을 때마다 외부 위기가 터지는 긴장-로맨스 교차 구조",
  "한쪽이 기억을 잃어 처음부터 다시 사랑에 빠지는 리셋 로맨스",
  "가짜 관계가 진짜가 되지만 진짜가 된 순간 관계를 유지할 수 없는 딜레마",
  "전생/현생의 감정이 충돌하는 이중 감정선 구조",
  "연인 관계인데 서로 다른 진영에 서야 하는 비극적 구조",
  "시간이 제한된 사랑 (저주, 수명, 계약 기한 등)",
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
export function buildCreativeSeeds(genre: string): string {
  const { protagonists: protPool, situations: sitPool, structures: strPool } = getConstraints(genre);
  const protagonists = pickRandom(protPool, 3);
  const situations = pickRandom(sitPool, 3);
  const structures = pickRandom(strPool, 3);

  return `장르: ${genre}

## 각 플롯의 출발점 (반드시 반영!)
이 제약조건을 기반으로 각 플롯을 만들되, 장르에 맞게 자유롭게 변형하세요.

**플롯 A**: ${protagonists[0]} ${situations[0]}에 처한 이야기.
  구조적 특징: ${structures[0]}

**플롯 B**: ${protagonists[1]} ${situations[1]}에 처한 이야기.
  구조적 특징: ${structures[1]}

**플롯 C**: ${protagonists[2]} ${situations[2]}에 처한 이야기.
  구조적 특징: ${structures[2]}

위 조건을 출발점으로 삼되, 최종 플롯은 조건을 넘어서 자유롭게 발전시키세요.
조건이 장르와 안 맞으면 장르에 맞게 변형해도 됩니다. 핵심은 3개가 서로 완전히 다른 이야기여야 한다는 것.`;
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
