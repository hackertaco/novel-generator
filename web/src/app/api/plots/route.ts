import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import { getGenrePrompt, detectGenre } from "@/lib/prompts/genre-prompts";
import type { PlotOption } from "@/lib/schema/plot";

// --- Creative constraint pools for plot diversity ---

const PROTAGONIST_TYPES = [
  "평범한 회사원/학생이", "이미 정상에 있는 자가", "악역/안티히어로가",
  "조력자/사이드킥이", "은퇴한 전설이", "기억을 잃은 자가",
  "모두에게 미움받는 자가", "거짓말쟁이가", "진짜 약자가",
  "적의 자녀/제자가", "시간이 얼마 남지 않은 자가", "두 세계에 걸친 자가",
];

const STARTING_SITUATIONS = [
  "가장 소중한 것을 잃은 직후", "거대한 비밀을 우연히 알게 된 순간",
  "잘못된 선택의 대가를 치르는 중", "원치 않는 능력/저주에 걸린 순간",
  "가장 신뢰하던 사람에게 이용당한 직후", "죽음의 문턱에서 돌아온 직후",
  "자신이 주인공이 아님을 깨달은 순간", "적과 협력해야만 하는 상황",
  "시스템/규칙 자체가 잘못됐음을 발견한 순간", "사랑하는 사람의 적이 되어버린 순간",
];

const STRUCTURAL_CONSTRAINTS = [
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

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Mock plots for when no API key is available
function generateMockPlots(genre: string): PlotOption[] {
  const mocks: Record<string, PlotOption[]> = {
    로맨스: [
      {
        id: "A",
        title: "다시, 너에게",
        logline: "후회하는 남주 앞에 당차게 나타난 여주, 이번엔 그녀가 주도권을 쥔다",
        hook: "밀당 역전 + 남주 집착 + 여주 성장",
        arc_summary: [
          "1부: 재회 - 달라진 여주에 당황하는 남주",
          "2부: 추격 - 떠나려는 여주, 잡으려는 남주",
          "3부: 진심 - 과거의 상처 직면, 새로운 관계",
        ],
        key_twist: "남주가 후회하는 '그 일'은 여주가 이미 용서한 것이었다",
      },
      {
        id: "B",
        title: "이번엔 내 차례",
        logline: "전생에 버림받은 여주, 회귀해서 남주를 역으로 흔든다",
        hook: "여주 각성 + 남주 멘붕 + 통쾌한 전개",
        arc_summary: [
          "1부: 회귀 - 모든 걸 아는 여주의 계획",
          "2부: 역전 - 예상 밖 행동에 흔들리는 남주",
          "3부: 선택 - 복수냐 사랑이냐",
        ],
        key_twist: "남주도 사실 회귀자였다",
      },
      {
        id: "C",
        title: "늦은 후회",
        logline: "여주가 떠난 후에야 깨달은 남주, 그녀를 되찾기 위한 처절한 노력",
        hook: "남주 고통 + 여주 성장 + 감정선",
        arc_summary: [
          "1부: 상실 - 떠난 여주, 무너지는 남주",
          "2부: 추적 - 변해버린 그녀를 찾아서",
          "3부: 증명 - 진심을 보여주기 위한 남주의 변화",
        ],
        key_twist: "여주가 떠난 진짜 이유는 남주를 지키기 위해서였다",
      },
    ],
    default: [
      {
        id: "A",
        title: "정점으로",
        logline: "바닥에서 시작해 정상을 향해 올라가는 성장기",
        hook: "언더독 성공 + 통쾌함",
        arc_summary: [
          "1부: 각성 - 숨겨진 재능 발현",
          "2부: 도약 - 강자들 사이에서 성장",
          "3부: 정점 - 최강자로 등극",
        ],
        key_twist: "재능이 아니라 저주였다",
      },
      {
        id: "B",
        title: "숨겨진 힘",
        logline: "평범해 보이지만 모두가 원하는 능력을 가진 주인공",
        hook: "반전 정체 + 능력 각성",
        arc_summary: [
          "1부: 일상 - 숨기며 사는 삶",
          "2부: 노출 - 들통난 능력, 쫓기는 삶",
          "3부: 대결 - 더 이상 숨지 않는다",
        ],
        key_twist: "능력의 원천이 사라진 가족과 연결되어 있었다",
      },
      {
        id: "C",
        title: "혼자서",
        logline: "모두에게 버림받은 자, 혼자 강해지는 길을 선택",
        hook: "고독한 성장 + 인정 서사",
        arc_summary: [
          "1부: 추방 - 버림받고 홀로 서기",
          "2부: 증명 - 혼자 이뤄낸 성과",
          "3부: 귀환 - 달라진 위치로 돌아오다",
        ],
        key_twist: "버린 줄 알았던 사람이 사실 지켜보고 있었다",
      },
    ],
  };

  return mocks[genre] || mocks.default;
}

const PlotOptionArraySchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    logline: z.string(),
    hook: z.string(),
    arc_summary: z.array(z.string()),
    key_twist: z.string(),
  }),
);

export async function POST(request: NextRequest) {
  try {
    const { genre } = await request.json();

    if (!genre) {
      return NextResponse.json({ error: "장르를 선택해주세요" }, { status: 400 });
    }

    // Check if any API key is configured
    const hasApiKey = !!(
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.ZAI_API_KEY
    );
    if (!hasApiKey) {
      const plots = generateMockPlots(genre);
      return NextResponse.json({ plots, mock: true });
    }

    const detectedGenre = detectGenre(genre);

    // Pick random creative constraints for diversity
    const protagonists = pickRandom(PROTAGONIST_TYPES, 3);
    const situations = pickRandom(STARTING_SITUATIONS, 3);
    const structures = pickRandom(STRUCTURAL_CONSTRAINTS, 3);

    const creativeSeeds = `장르: ${genre}

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

    const prompt = getGenrePrompt(detectedGenre, creativeSeeds, 3);

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

    // Review agent: check plausibility + originality + polish language
    const reviewed = await agent.callStructured({
      prompt: `다음은 ${genre} 장르 웹소설 플롯 ${result.data.length}개입니다. 까다로운 편집자로서 검토해주세요.

[플롯 목록]
${JSON.stringify(result.data, null, 2)}

[검토 기준 — 우선순위 순]

1. **뻔함 감지 (가장 중요!)**:
   - 로그라인을 읽었을 때 "아, 이런 거 많지"라는 느낌이 들면 즉시 교체
   - "숨겨진 강자", "회귀 복수", "F급→S급", "계약 관계→진심" 같은 과사용 패턴 감지
   - 3개 플롯이 전부 "약자→강자" 성장 구조면 최소 1개는 완전히 다른 구조로 교체
   - "사실 ~였다" 반전은 전부 교체

2. **로그라인 매력도**:
   - 로그라인만 읽고 "1화 클릭하겠는가?" 테스트
   - 구체적인 상황이 그려져야 함 (이름, 장소, 행동)
   - 추상적 설명("성장한다", "강해진다", "사랑을 찾는다") → 구체적 장면으로 교체

3. **개연성**: 설정이나 전개에 논리적 모순이 있으면 수정
4. **가독성**: 어색한 표현, 번역체, 불필요한 수식어를 자연스러운 한국어로

뻔한 플롯은 "약간의 변주"가 아니라 완전히 새 플롯으로 교체하세요. 독자는 제목과 로그라인만 보고 클릭 여부를 결정합니다.

검토 후 개선된 플롯 목록을 동일한 JSON 형식으로 출력하세요.`,
      system: "당신은 카카오페이지 웹소설 편집장입니다. 수천 편의 웹소설을 검토한 경험이 있고, '이거 어디서 본 건데'라는 직감이 매우 날카롭습니다. 뻔한 플롯은 가차없이 교체합니다. 독자의 시간은 소중합니다.",
      temperature: 0.7,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-review",
    });

    return NextResponse.json({
      plots: reviewed.data,
      usage: {
        prompt_tokens: (result.usage.prompt_tokens || 0) + (reviewed.usage.prompt_tokens || 0),
        completion_tokens: (result.usage.completion_tokens || 0) + (reviewed.usage.completion_tokens || 0),
        total_tokens: (result.usage.total_tokens || 0) + (reviewed.usage.total_tokens || 0),
        cost_usd: (result.usage.cost_usd || 0) + (reviewed.usage.cost_usd || 0),
      },
    });
  } catch (err) {
    console.error("[plots] Error:", err);
    // Last resort fallback to mock
    try {
      const { genre } = await request.clone().json();
      const plots = generateMockPlots(genre);
      return NextResponse.json({ plots, mock: true });
    } catch {
      return NextResponse.json({ error: "플롯 생성 실패" }, { status: 500 });
    }
  }
}
