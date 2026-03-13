import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents/llm-agent";
import { getSeedPrompt } from "@/lib/prompts/seed-prompt";
import { NovelSeedSchema } from "@/lib/schema/novel";
import type { PlotOption } from "@/lib/schema/plot";

export async function POST(request: NextRequest) {
  try {
    const { genre, plot } = (await request.json()) as {
      genre: string;
      plot: PlotOption;
    };

    if (!genre || !plot) {
      return NextResponse.json(
        { error: "장르와 플롯이 필요합니다" },
        { status: 400 },
      );
    }

    const interviewResult = `장르: ${genre}

## 선택한 플롯
제목: ${plot.title}
로그라인: ${plot.logline}
훅: ${plot.hook}
전개:
${plot.arc_summary.map((a) => `- ${a}`).join("\n")}
핵심 반전: ${plot.key_twist}`;

    const prompt = getSeedPrompt(interviewResult);
    const agent = getAgent();

    const result = await agent.callStructured({
      prompt,
      system: "당신은 한국 웹소설 기획 전문가입니다. YAML 형식으로 출력하세요.",
      temperature: 0.7,
      maxTokens: 8000,
      schema: NovelSeedSchema,
      format: "yaml",
      taskId: "seed-generation",
    });

    return NextResponse.json({ seed: result.data, usage: result.usage });
  } catch (err) {
    console.error("[seed] Error:", err);
    const message = err instanceof Error ? err.message : "시드 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
