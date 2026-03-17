import { getAgent } from "./llm-agent";
import { isRomanceGenre } from "./plot-writer";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { PlotPipelineAgent, PlotContext } from "./plot-writer";

/**
 * Build the debate prompt simulating a 기획 회의.
 *
 * Three roles debate each plot:
 * - 작가: Defends the plot, proposes improvements
 * - 독자 대표: Points out what's boring/predictable from a reader's perspective
 * - 편집장: Makes final decisions based on market trends and platform data
 */
export function buildPlotDebatePrompt(genre: string, plots: unknown[]): string {
  const romanceRule = isRomanceGenre(genre)
    ? `\n**장르 규칙**: "${genre}"이므로 로맨스/감정선이 반드시 플롯의 중심축이어야 합니다. 로맨스 없는 플롯은 즉시 수정하세요.\n`
    : "";

  return `당신은 카카오페이지 기획 회의실입니다. 다음 3개의 ${genre} 플롯에 대해 기획 회의를 진행하세요.
${romanceRule}
[초안 플롯]
${JSON.stringify(plots, null, 2)}

## 회의 참석자와 역할

**[작가]** — 플롯을 제안한 사람. 자기 플롯을 방어하되, 유효한 비판은 수용하고 개선안을 제시합니다.
**[독자 대표]** — 카카오페이지에서 매일 3작품씩 읽는 헤비 독자. 뻔한 전개를 즉시 감지합니다.
  - "이거 ○○○이랑 비슷한데요?" (유사 작품 지적)
  - "로그라인만 보고 1화 클릭하겠냐면... 솔직히 안 할 것 같아요" (매력도 평가)
  - "여기서 궁금한 게 없어요. 다음 화를 왜 읽어야 하죠?" (훅 부재 지적)
**[편집장]** — 최종 결정권자. 시장 트렌드를 잘 알고, 구체적인 개선 방향을 제시합니다.
  - "2025-2026 트렌드는 ___이니까, ___를 넣어봐"
  - "감정선이 약해. 독자가 캐릭터에 빠져야 하는데 지금은 설정만 있고 감정이 없어"
  - "구체적 장면이 안 보여. '갈등한다'가 아니라 무슨 사건이 벌어지는지 써"

## 회의 규칙

1. 각 플롯에 대해 **독자 → 편집장 → 작가(수정안)** 순서로 한 라운드 진행
2. 독자의 핵심 불만:
   - "어디서 봤는데?" → 유사 작품/클리셰 지적
   - "그래서 뭐?" → 로그라인에 호기심 유발 요소 부재
   - "뻔하다" → 예측 가능한 전개
3. 편집장의 핵심 기준:
   - 로그라인만 읽고 클릭할 것인가?
   - 전제의 아이러니/역설이 살아있는가?
   - arc_summary에 구체적 인물명·장소·사건이 있는가?
   - "~하게 된다", "진정한 ~", "의 여정" 같은 모호한 표현은 없는가?
4. 작가는 비판을 수용해 **구체적으로 수정**한 버전을 제시

## 출력

회의 내용은 생략하고, **최종 합의된 수정 플롯 3개**만 동일한 JSON 형식으로 출력하세요.
수정이 불필요한 플롯은 그대로 유지하되, 독자/편집장의 피드백이 하나라도 있으면 반영하세요.`;
}

/**
 * PlotDebate: simulates a planning meeting between writer, reader, and editor.
 * Replaces PlotCritic with a more dynamic, multi-perspective review.
 */
export class PlotDebate implements PlotPipelineAgent {
  name = "plot-debate";

  async run(ctx: PlotContext): Promise<PlotContext> {
    const prompt = buildPlotDebatePrompt(ctx.genre, ctx.plots);

    const agent = getAgent();
    const result = await agent.callStructured({
      prompt,
      system: `당신은 카카오페이지 기획 회의실입니다. 세 명의 전문가(작가, 독자 대표, 편집장)가 토론하여 플롯을 개선합니다.

핵심 원칙:
- 독자 대표는 솔직하고 날카롭습니다. "뻔하다", "이미 봤다"를 거침없이 말합니다.
- 편집장은 2025-2026 카카오페이지 트렌드를 잘 압니다: 감정 중심 서사, 직진 남주, 사이다 전개, 장르 하이브리드, 갭 모에.
- 작가는 비판을 수용하되, 전제의 핵심 아이러니를 지키면서 구체적으로 개선합니다.
- 모호한 표현("~하게 된다", "진정한 ~", "의 여정")은 구체적 사건으로 교체합니다.
- 최종 출력은 회의 내용 없이 수정된 JSON만 출력합니다.`,
      temperature: 0.7,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-debate",
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
