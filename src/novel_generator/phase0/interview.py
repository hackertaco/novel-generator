"""Novel interview engine for Phase 0."""

from dataclasses import dataclass, field


@dataclass
class InterviewState:
    """State of the interview process."""

    idea: str
    genre: str | None = None
    protagonist: str | None = None
    conflict: str | None = None
    tone: str | None = None
    scale: str | None = None
    additional: str | None = None  # 추가 아이디어

    def is_complete(self) -> bool:
        """Check if interview has gathered enough information."""
        return all([self.genre, self.protagonist, self.conflict, self.tone, self.scale])

    def to_summary(self) -> str:
        """Convert state to summary string for seed generation."""
        result = f"""## 아이디어
{self.idea}

## 장르
{self.genre}

## 주인공
{self.protagonist}

## 갈등
{self.conflict}

## 톤
{self.tone}

## 분량
{self.scale}
"""
        if self.additional:
            result += f"""
## 추가 아이디어
{self.additional}
"""
        return result


class NovelInterviewer:
    """Conducts interview to clarify novel concept."""

    QUESTIONS = [
        ("genre", "장르?", [
            "현대 판타지 (헌터물, 회귀, 빙의)",
            "정통 판타지 (이세계, 마법)",
            "무협",
            "로맨스/로판",
        ]),
        ("protagonist", "주인공?", [
            "천재형 (압도적 실력)",
            "성장형 (약자에서 강자로)",
            "복수형 (과거의 한)",
            "귀환형 (회귀/빙의)",
        ]),
        ("conflict", "핵심 갈등?", [
            "거대 악 vs 주인공",
            "시스템/사회에 대한 저항",
            "과거 트라우마 극복",
            "정상에 오르기",
        ]),
        ("tone", "톤?", [
            "어둡고 진지",
            "밝고 통쾌",
            "긴장감/두뇌싸움",
            "감성/로맨스",
        ]),
        ("scale", "분량?", [
            "단편 (~50화)",
            "중편 (100~200화)",
            "장편 (300화+)",
        ]),
        ("additional", "추가로 넣고 싶은 설정이나 아이디어?", []),
    ]

    def __init__(self):
        self.state: InterviewState | None = None
        self.current_index: int = 0

    def start(self, idea: str) -> tuple[str, tuple[str, list[str]]]:
        """Start interview."""
        self.state = InterviewState(idea=idea)
        self.current_index = 0
        return f'"{idea}"', self._current_question()

    def answer(self, answer: str) -> tuple[str, tuple[str, list[str]] | None]:
        """Process answer and return next question or None if done."""
        if not self.state:
            raise ValueError("Not started")

        key, _, options = self.QUESTIONS[self.current_index]

        # Map number to option (if options exist)
        if options and answer.isdigit():
            idx = int(answer) - 1
            if 0 <= idx < len(options):
                answer = options[idx]

        # Handle empty additional
        if key == "additional" and answer.strip().lower() in ["", "없음", "x", "-", "없어", "no", "n"]:
            answer = None

        setattr(self.state, key, answer)
        self.current_index += 1

        # Check if done
        if self.current_index >= len(self.QUESTIONS):
            return self._summary(), None

        return f"{answer}." if answer else "OK.", self._current_question()

    def _current_question(self) -> tuple[str, list[str]]:
        """Get current question."""
        _, question, options = self.QUESTIONS[self.current_index]
        return question, options

    def _summary(self) -> str:
        """Generate summary."""
        if not self.state:
            return ""
        lines = [
            f"장르: {self.state.genre}",
            f"주인공: {self.state.protagonist}",
            f"갈등: {self.state.conflict}",
            f"톤: {self.state.tone}",
            f"분량: {self.state.scale}",
        ]
        if self.state.additional:
            lines.append(f"추가: {self.state.additional}")
        return "완료.\n" + "\n".join(lines)

    def get_interview_result(self) -> str:
        """Get result for seed generation."""
        if not self.state:
            raise ValueError("Not started")
        return self.state.to_summary()
