"""Plot generator - creates multiple plot options from interview."""

from dataclasses import dataclass
from typing import Any


@dataclass
class PlotOption:
    """A single plot option."""

    id: str
    title: str
    logline: str
    hook: str  # 왜 이 플롯이 재밌는지
    arc_summary: list[str]  # 주요 전개
    key_twist: str  # 핵심 반전


class PlotGenerator:
    """Generates multiple plot options from interview result."""

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm

    async def generate(self, interview_result: str, count: int = 3) -> list[PlotOption]:
        """Generate plot options.

        Args:
            interview_result: Summary from interview
            count: Number of plots to generate

        Returns:
            List of PlotOption
        """
        if self.use_llm:
            try:
                return await self._generate_with_llm(interview_result, count)
            except Exception as e:
                import traceback
                print(f"LLM 실패, mock 사용:")
                traceback.print_exc()
                return self._generate_mock(interview_result, count)
        return self._generate_mock(interview_result, count)

    async def _generate_with_llm(self, interview_result: str, count: int) -> list[PlotOption]:
        """Generate using LLM via ouroboros adapter."""
        import json
        import re

        from novel_generator.phase0.prompts import get_genre_prompt, detect_genre
        from novel_generator.ouroboros.llm import call_llm

        # 장르 감지 및 프롬프트 생성
        genre = detect_genre(interview_result)
        prompt = get_genre_prompt(genre, interview_result, count)

        content = await call_llm(
            prompt=prompt,
            system="당신은 카카오페이지 웹소설 전문 기획자입니다.",
            temperature=0.8,
            max_tokens=4096,
        )

        # Extract and parse JSON
        plots_data = self._parse_json_response(content)
        return [PlotOption(**p) for p in plots_data]

    def _parse_json_response(self, content: str) -> list[dict]:
        """Parse JSON from LLM response with error recovery."""
        import json
        import re

        # Try to find JSON array
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if not match:
            raise ValueError("No JSON array found in response")

        json_str = match.group()

        # Fix common JSON issues from LLM
        # 1. Remove trailing commas before ] or }
        json_str = re.sub(r',\s*([\]\}])', r'\1', json_str)

        # 2. Fix newlines inside strings (replace with space)
        # This is tricky - we need to handle strings properly
        lines = json_str.split('\n')
        json_str = ' '.join(lines)

        # 3. Fix unescaped quotes in strings
        # Not perfect but handles simple cases

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            # Try more aggressive fixing
            # Remove all newlines and extra spaces
            json_str = re.sub(r'\s+', ' ', json_str)
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                raise ValueError(f"Failed to parse JSON: {e}")

    def _generate_mock(self, interview_result: str, count: int) -> list[PlotOption]:
        """Generate mock plots based on interview."""
        # Parse keywords
        text = interview_result.lower()

        is_romance = "로맨스" in text or "로판" in text or "감성" in text
        is_regret = "후회" in text
        is_revenge = "복수" in text
        is_regression = "회귀" in text or "귀환" in text
        is_hunter = "헌터" in text or "현대 판타지" in text
        is_martial = "무협" in text
        is_fantasy = "판타지" in text or "이세계" in text
        is_dark = "어둡" in text or "진지" in text
        is_bright = "밝" in text or "통쾌" in text

        plots = []

        # 로맨스/로판 계열
        if is_romance or "당찬" in text or "여주" in text:
            plots.append(PlotOption(
                id="A",
                title="다시, 너에게",
                logline="후회하는 남주 앞에 당차게 나타난 여주, 이번엔 그녀가 주도권을 쥔다",
                hook="밀당 역전 + 남주 집착 + 여주 성장",
                arc_summary=[
                    "1부: 재회 - 달라진 여주에 당황하는 남주",
                    "2부: 추격 - 떠나려는 여주, 잡으려는 남주",
                    "3부: 진심 - 과거의 상처 직면, 새로운 관계",
                ],
                key_twist="남주가 후회하는 '그 일'은 여주가 이미 용서한 것이었다",
            ))
            plots.append(PlotOption(
                id="B",
                title="이번엔 내 차례",
                logline="전생에 버림받은 여주, 회귀해서 남주를 역으로 흔든다",
                hook="여주 각성 + 남주 멘붕 + 통쾌한 전개",
                arc_summary=[
                    "1부: 회귀 - 모든 걸 아는 여주의 계획",
                    "2부: 역전 - 예상 밖 행동에 흔들리는 남주",
                    "3부: 선택 - 복수냐 사랑이냐",
                ],
                key_twist="남주도 사실 회귀자였다",
            ))
            plots.append(PlotOption(
                id="C",
                title="늦은 후회",
                logline="여주가 떠난 후에야 깨달은 남주, 그녀를 되찾기 위한 처절한 노력",
                hook="남주 고통 + 여주 성장 + 감정선",
                arc_summary=[
                    "1부: 상실 - 떠난 여주, 무너지는 남주",
                    "2부: 추적 - 변해버린 그녀를 찾아서",
                    "3부: 증명 - 진심을 보여주기 위한 남주의 변화",
                ],
                key_twist="여주가 떠난 진짜 이유는 남주를 지키기 위해서였다",
            ))

        # 회귀/복수 계열
        elif is_regression or is_revenge:
            plots.append(PlotOption(
                id="A",
                title="피의 귀환",
                logline="배신당해 죽은 자, 과거로 돌아와 하나씩 처단한다",
                hook="통쾌한 복수 + 치밀한 계획",
                arc_summary=[
                    "1부: 귀환 - 배신자 파악, 힘 축적",
                    "2부: 사냥 - 하위 배신자들부터 제거",
                    "3부: 진실 - 흑막의 정체, 최종 복수",
                ],
                key_twist="진짜 흑막은 가장 가까운 사람이었다",
            ))
            plots.append(PlotOption(
                id="B",
                title="두 번째 삶",
                logline="과거의 실수를 바로잡으며 진정한 강자로 성장",
                hook="성장 + 구원 + 달라지는 관계",
                arc_summary=[
                    "1부: 후회 - 잘못된 선택들을 고치기",
                    "2부: 인연 - 전생에서 잃은 사람들 지키기",
                    "3부: 정상 - 전생 이상의 경지 도달",
                ],
                key_twist="구하려던 사람이 사실 자신을 구하고 있었다",
            ))
            plots.append(PlotOption(
                id="C",
                title="지킬 수 있다면",
                logline="이번엔 아무도 잃지 않겠다",
                hook="감동 + 희생 + 반전된 운명",
                arc_summary=[
                    "1부: 재회 - 소중한 이들과 다시",
                    "2부: 위기 - 알고 있는 재앙 막기",
                    "3부: 선택 - 모두를 지키기 위한 대가",
                ],
                key_twist="지키려 했던 사람이 이미 자신을 위해 희생했었다",
            ))

        # 기본 (헌터물/판타지)
        else:
            plots.append(PlotOption(
                id="A",
                title="정점으로",
                logline="바닥에서 시작해 정상을 향해 올라가는 성장기",
                hook="언더독 성공 + 통쾌함",
                arc_summary=[
                    "1부: 각성 - 숨겨진 재능 발현",
                    "2부: 도약 - 강자들 사이에서 성장",
                    "3부: 정점 - 최강자로 등극",
                ],
                key_twist="재능이 아니라 저주였다",
            ))
            plots.append(PlotOption(
                id="B",
                title="숨겨진 힘",
                logline="평범해 보이지만 모두가 원하는 능력을 가진 주인공",
                hook="반전 정체 + 능력 각성",
                arc_summary=[
                    "1부: 일상 - 숨기며 사는 삶",
                    "2부: 노출 - 들통난 능력, 쫓기는 삶",
                    "3부: 대결 - 더 이상 숨지 않는다",
                ],
                key_twist="능력의 원천이 사라진 가족과 연결되어 있었다",
            ))
            plots.append(PlotOption(
                id="C",
                title="혼자서",
                logline="모두에게 버림받은 자, 혼자 강해지는 길을 선택",
                hook="고독한 성장 + 인정 서사",
                arc_summary=[
                    "1부: 추방 - 버림받고 홀로 서기",
                    "2부: 증명 - 혼자 이뤄낸 성과",
                    "3부: 귀환 - 달라진 위치로 돌아오다",
                ],
                key_twist="버린 줄 알았던 사람이 사실 지켜보고 있었다",
            ))

        return plots[:count]


def format_plot_options(plots: list[PlotOption]) -> str:
    """Format plot options for display."""
    lines = []
    for p in plots:
        lines.append(f"\n[{p.id}] {p.title}")
        lines.append(f"    {p.logline}")
        lines.append(f"    → {p.hook}")
        lines.append(f"    전개:")
        for arc in p.arc_summary:
            lines.append(f"      - {arc}")
        lines.append(f"    반전: {p.key_twist}")
    return "\n".join(lines)
