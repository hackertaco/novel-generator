import { getAgent } from "./llm-agent";
import { isRomanceGenre } from "./plot-writer";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { PlotPipelineAgent, PlotContext } from "./plot-writer";

/**
 * Build the genre identity rule for romance genres.
 */
export function buildGenreIdentityRule(genre: string): string {
  if (!isRomanceGenre(genre)) return "";

  return `\n0. **장르 정체성 (최우선!):**
   - 이 장르는 "${genre}"입니다. 로맨스/감정선이 플롯의 중심이어야 합니다.
   - 로그라인에 남주/여주(또는 주요 커플)의 관계가 반드시 드러나야 합니다.
   - 정치/전투/생존만 있고 로맨스가 없는 플롯은 즉시 교체하세요.
   - 로맨스가 서브플롯 수준이면 메인으로 격상하세요.
   - arc_summary의 각 부에도 감정선 전개가 포함되어야 합니다.\n`;
}

/**
 * Build the critic prompt for reviewing plots.
 * Focuses on: genre identity, originality, logline appeal, plausibility.
 */
export function buildPlotCriticPrompt(genre: string, plots: unknown[]): string {
  const genreIdentityRule = buildGenreIdentityRule(genre);

  return `다음은 ${genre} 장르 웹소설 플롯 ${plots.length}개입니다. 까다로운 편집자로서 검토해주세요.

[플롯 목록]
${JSON.stringify(plots, null, 2)}

[검토 기준 — 우선순위 순]
${genreIdentityRule}
1. **뻔함 감지 (가장 중요!)**:
   - 로그라인을 읽었을 때 "아, 이런 거 많지"라는 느낌이 들면 즉시 교체
   - "숨겨진 강자", "회귀 복수", "F급→S급" 같은 과사용 패턴 감지
   - 3개 플롯이 전부 같은 구조면 최소 1개는 완전히 다른 구조로 교체
   - "사실 ~였다" 반전은 전부 교체

2. **로그라인 매력도**:
   - 로그라인만 읽고 "1화 클릭하겠는가?" 테스트
   - 구체적인 상황이 그려져야 함 (이름, 장소, 행동)
   - 추상적 설명("성장한다", "강해진다", "사랑을 찾는다") → 구체적 장면으로 교체
   - **추상어 금지**: "경쟁", "시련", "갈등", "위기", "여정" 같은 단어는 반드시 구체적 소재로 바꿀 것
     - ❌ "옛 연인과의 경쟁에서 사랑의 진정한 의미를 찾는다"
     - ✅ "옛 연인 아르만이 황후 자리를 걸고 도전장을 내밀었다. 왕좌냐 사랑이냐, 릴리아의 선택은?"
     - 핵심: 어떤 경쟁인지, 무엇을 걸었는지, 구체적 상황이 보여야 한다
   - arc_summary에서도 마찬가지. "~와 갈등한다", "~에 맞선다" 대신 무슨 사건이 벌어지는지 쓸 것

3. **개연성**: 설정이나 전개에 논리적 모순이 있으면 수정

뻔한 플롯은 "약간의 변주"가 아니라 완전히 새 플롯으로 교체하세요. 독자는 제목과 로그라인만 보고 클릭 여부를 결정합니다.

검토 후 개선된 플롯 목록을 동일한 JSON 형식으로 출력하세요.`;
}

/**
 * PlotCritic: evaluates genre identity, originality, logline appeal, plausibility.
 * Replaces/fixes plots that fail the check.
 */
export class PlotCritic implements PlotPipelineAgent {
  name = "plot-critic";

  async run(ctx: PlotContext): Promise<PlotContext> {
    const prompt = buildPlotCriticPrompt(ctx.genre, ctx.plots);

    const agent = getAgent();
    const result = await agent.callStructured({
      prompt,
      system: "당신은 카카오페이지 웹소설 편집장입니다. 수천 편의 웹소설을 검토한 경험이 있고, '이거 어디서 본 건데'라는 직감이 매우 날카롭습니다. 뻔한 플롯은 가차없이 교체합니다. 독자의 시간은 소중합니다.",
      temperature: 0.7,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-critic",
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
