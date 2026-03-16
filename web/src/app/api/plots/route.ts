import { NextRequest, NextResponse } from "next/server";
import { runPlotPipeline } from "@/lib/agents/plot-pipeline";
import type { PlotOption } from "@/lib/schema/plot";

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

    const result = await runPlotPipeline(genre);

    return NextResponse.json({
      plots: result.plots,
      usage: result.usage,
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
