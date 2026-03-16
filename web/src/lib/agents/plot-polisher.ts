import { getAgent } from "./llm-agent";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { PlotPipelineAgent, PlotContext } from "./plot-writer";

/**
 * Build the polisher prompt for language/grammar correction of plots.
 * Focuses on: AI translation artifacts, subject-predicate agreement, natural Korean.
 */
export function buildPlotPolisherPrompt(genre: string, plots: unknown[]): string {
  return `다음은 ${genre} 장르 웹소설 플롯 ${plots.length}개입니다. 문체와 한국어 문법을 교정해주세요.

[플롯 목록]
${JSON.stringify(plots, null, 2)}

[교정 기준]

1. **문체 및 문법 교정 (매우 중요!)**:
   - AI가 쓴 듯한 딱딱한 번역체 문장 금지
   - "~하게 된다", "~라는 것이 밝혀진다", "진정한 ~을 찾아가는", "자신의 정체성" 같은 표현 전부 교체
   - 로그라인은 독자의 호기심을 자극하는 짧고 센 문장으로. 설명이 아니라 상황을 보여줘야 함
     - ❌ "리안은 황제의 음모에 맞서기 위해 반란군과 손잡지만, 그 과정에서 자신의 정체성과 진정한 적을 발견하게 된다"
     - ✅ "독살당한 줄 알았던 황비가 눈을 떴다. 5년 전, 그녀를 죽인 자들이 아직 웃고 있는 궁으로 돌아간다"
   - hook은 감정적 소구점을 한 줄로. "~의 이야기" 금지
   - arc_summary는 구체적 사건 중심. "~를 찾아간다", "~를 극복한다" 같은 추상적 표현 금지
   - key_twist에서 "~라는 것이 밝혀진다" 패턴 금지. 구체적 상황으로 쓸 것
   - **추상어를 구체적 소재로 교체**: "경쟁", "시련", "갈등", "위기", "여정" 같은 단어가 나오면 어떤 종류인지 구체적으로 바꿀 것
     - ❌ "경쟁에서 사랑의 의미를 찾는다" → ✅ "황후 자리를 건 결투에서 진짜 마음을 깨닫는다"
     - ❌ "시련을 극복한다" → ✅ "독살 누명을 벗기 위해 진범을 찾아 나선다"

2. **한국어 문법 검수**:
   - 주술관계가 맞는지 반드시 확인. 한 문장에 주어가 바뀌면 문장을 나눌 것
     - ❌ "그녀는 황태자와의 사랑이 시험대에 오르게 된다" (주어 '그녀는' vs '사랑이' 충돌)
     - ✅ "황태자와의 사랑마저 위태로워진다" 또는 "그녀 앞에 놓인 건 왕좌와 사랑, 둘 중 하나"
   - 한 문장이 너무 길면 두 문장으로 끊을 것 (마침표 기준 20자 내외가 이상적)
   - 조사 오용 확인: 은/는/이/가/을/를 자연스러운지 체크
   - 번역체 어순 금지: "~위해 ~하지만, 그 과정에서 ~하게 된다" 같은 패턴

플롯의 내용/구조는 바꾸지 마세요. 문체와 문법만 교정하세요.

교정된 플롯 목록을 동일한 JSON 형식으로 출력하세요.`;
}

/**
 * PlotPolisher: corrects AI translation artifacts, subject-predicate errors,
 * and polishes Korean grammar in plot texts.
 */
export class PlotPolisher implements PlotPipelineAgent {
  name = "plot-polisher";

  async run(ctx: PlotContext): Promise<PlotContext> {
    const prompt = buildPlotPolisherPrompt(ctx.genre, ctx.plots);

    const agent = getAgent();
    const result = await agent.callStructured({
      prompt,
      system: "당신은 한국어 문장 교정 전문가입니다. 번역체를 자연스러운 한국어로 바꾸고, 주술관계 오류를 잡아내며, 웹소설 독자가 읽기 편한 문체로 다듬습니다.",
      temperature: 0.3,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-polisher",
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
