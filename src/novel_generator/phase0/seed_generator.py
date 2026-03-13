"""Seed generator using LLM to create NovelSeed from interview results."""

import re

import yaml

from novel_generator.schema.novel import NovelSeed
from novel_generator.phase0.prompts import SEED_GENERATION_PROMPT


class SeedGenerator:
    """Generates NovelSeed from interview results.

    Uses ouroboros LLM client for generation.
    """

    def __init__(self, use_mock: bool = False):
        """Initialize generator.

        Args:
            use_mock: If True, use mock response instead of LLM (for testing)
        """
        self.use_mock = use_mock

    async def generate(self, interview_result: str) -> NovelSeed:
        """Generate NovelSeed from interview result.

        Args:
            interview_result: Summary from NovelInterviewer

        Returns:
            Generated and validated NovelSeed
        """
        prompt = SEED_GENERATION_PROMPT.format(interview_result=interview_result)

        if self.use_mock:
            response = self._mock_response(interview_result)
        else:
            response = await self._call_llm(prompt)

        # Parse YAML from response
        seed_data = self._parse_yaml_response(response)

        # Validate and create NovelSeed
        return NovelSeed.model_validate(seed_data)

    async def _call_llm(self, prompt: str) -> str:
        """Call LLM to generate seed via ouroboros adapter."""
        from novel_generator.ouroboros.llm import call_llm

        return await call_llm(
            prompt=prompt,
            system="당신은 한국 웹소설 기획 전문가입니다. YAML 형식으로 출력하세요.",
            temperature=0.7,
            max_tokens=8000,
        )

    def _parse_yaml_response(self, response: str) -> dict:
        """Extract and parse YAML from LLM response."""
        # Try to find YAML block
        yaml_match = re.search(r'```ya?ml\s*(.*?)```', response, re.DOTALL)
        if yaml_match:
            yaml_str = yaml_match.group(1)
        else:
            # Try to parse entire response as YAML
            yaml_str = response

        # Fix common YAML issues from LLM
        yaml_str = self._fix_yaml(yaml_str)

        try:
            return yaml.safe_load(yaml_str)
        except yaml.YAMLError as e:
            raise ValueError(f"Failed to parse YAML: {e}")

    def _fix_yaml(self, yaml_str: str) -> str:
        """Fix common YAML formatting issues from LLM output."""
        lines = yaml_str.split('\n')
        fixed_lines = []

        for line in lines:
            # Fix inline arrays like: - "a", "b", "c" -> proper YAML list
            if re.match(r'^(\s*)-\s*"[^"]+",\s*"', line):
                indent = len(line) - len(line.lstrip())
                # Extract all quoted strings
                items = re.findall(r'"([^"]*)"', line)
                for item in items:
                    fixed_lines.append(' ' * indent + f'- "{item}"')
            # Fix inline arrays like: - ~하냐?, ~잖아! (without quotes)
            elif re.match(r'^(\s*)-\s*~[^,]+,', line):
                indent = len(line) - len(line.lstrip())
                # Split by comma and create separate items
                content = line.lstrip('- ').strip()
                items = [item.strip() for item in content.split(',')]
                for item in items:
                    fixed_lines.append(' ' * indent + f'- "{item}"')
            # Fix trailing comments/annotations like: - "값" (설명) -> - "값"
            elif re.match(r'^(\s*)-\s*"[^"]+"\s*\(', line):
                indent = len(line) - len(line.lstrip())
                # Extract just the quoted value
                match = re.search(r'"([^"]*)"', line)
                if match:
                    fixed_lines.append(' ' * indent + f'- "{match.group(1)}"')
                else:
                    fixed_lines.append(line)
            # Fix unquoted values with trailing comments: - 값 (설명) -> - "값"
            elif re.match(r'^(\s*)-\s*[^"\[\{]+\s*\(', line):
                indent = len(line) - len(line.lstrip())
                # Extract value before parenthesis
                match = re.match(r'^(\s*)-\s*([^(]+)\s*\(', line)
                if match:
                    value = match.group(2).strip()
                    fixed_lines.append(' ' * indent + f'- "{value}"')
                else:
                    fixed_lines.append(line)
            else:
                fixed_lines.append(line)

        return '\n'.join(fixed_lines)

    def _mock_response(self, interview_result: str) -> str:
        """Generate mock response for testing without LLM."""
        # Extract some info from interview for mock
        genre = "현대 판타지"
        sub_genre = "회귀"

        if "무협" in interview_result:
            genre = "무협"
            sub_genre = "회귀"
        elif "로맨스" in interview_result or "로판" in interview_result:
            genre = "로맨스"
            sub_genre = "빙의"

        return f'''```yaml
title: "회귀한 천재의 두 번째 삶"
logline: "죽음 직전 과거로 돌아온 천재가 모든 것을 바꾸려 한다"
total_chapters: 300

world:
  name: "현대 한국 + 헌터 세계관"
  genre: "{genre}"
  sub_genre: "{sub_genre}"
  time_period: "현대"
  magic_system: "마나를 이용한 스킬 시스템. 등급은 F~S"
  key_locations:
    academy: "한국 최고의 헌터 양성 아카데미"
    gate: "몬스터가 출현하는 차원문"
    guild: "상위 길드 본부"
  factions:
    hunter_association: "헌터들을 관리하는 정부 기관"
    top_guilds: "S급 헌터들이 이끄는 대형 길드들"
    villains: "게이트를 이용하는 범죄 조직"
  rules:
    - "각성자만이 마나를 다룰 수 있다"
    - "등급은 각성 시 결정되며 변하지 않는다 (주인공 제외)"
    - "S급은 전 세계에 100명 미만"

characters:
  - id: "mc"
    name: "강현우"
    role: "주인공"
    introduction_chapter: 1
    voice:
      tone: "냉소적이지만 속정 있음. 회귀 전 트라우마로 인한 경계심"
      speech_patterns:
        - "~하지"
        - "...그래서?"
        - "알아서 해"
      sample_dialogues:
        - "또 이 꼴이군. 지겹다, 진짜."
        - "...네가 뭘 알아."
        - "이번엔 다르게 할 거야. 반드시."
        - "걱정 마. 죽지 않아."
      personality_core: "과거의 실패로 냉소적이 되었으나, 이번 생에선 소중한 사람들을 지키겠다는 강한 의지"
    backstory: "전생에서 S급까지 올랐으나 모든 것을 잃고 죽음. 10년 전으로 회귀"
    arc_summary: "냉소적 복수자 → 동료를 얻으며 변화 → 진정한 영웅으로 성장"
    state:
      level: 1
      relationships: {{}}

  - id: "heroine"
    name: "이서연"
    role: "히로인"
    introduction_chapter: 3
    voice:
      tone: "밝고 당찬, 하지만 자신만의 상처가 있음"
      speech_patterns:
        - "~거든요!"
        - "에이, 설마~"
      sample_dialogues:
        - "포기하면 거기서 끝이에요!"
        - "...저도 지키고 싶은 사람이 있어요."
      personality_core: "겉으로는 밝지만 가족을 잃은 트라우마를 숨기고 있음"
    backstory: "전생에서 주인공이 지키지 못한 사람. 이번엔 반드시 지킨다"
    arc_summary: "밝은 동료 → 주인공의 비밀을 알게 됨 → 함께 싸우는 파트너"
    state:
      level: 1
      relationships: {{}}

arcs:
  - id: "arc_1"
    name: "귀환편"
    start_chapter: 1
    end_chapter: 50
    summary: "회귀 후 적응하며 첫 번째 위기를 막는다"
    key_events:
      - "회귀 각성"
      - "아카데미 입학"
      - "히로인과 만남"
      - "첫 번째 대형 게이트 사건"
      - "숨겨진 던전 발견"
    climax_chapter: 48

  - id: "arc_2"
    name: "각성편"
    start_chapter: 51
    end_chapter: 120
    summary: "S급으로의 첫 걸음, 길드 설립"
    key_events:
      - "등급 돌파의 비밀"
      - "첫 S급 헌터와 대결"
      - "길드 설립"
    climax_chapter: 118

chapter_outlines:
  - chapter_number: 1
    title: "다시, 처음으로"
    arc_id: "arc_1"
    one_liner: "죽음의 순간, 10년 전으로 돌아온 강현우"
    key_points:
      - "전생의 마지막 전투 회상"
      - "눈을 떠보니 10년 전 자신의 방"
      - "회귀 확신"
    characters_involved:
      - "mc"
    tension_level: 8

  - chapter_number: 2
    title: "달라진 것과 달라지지 않은 것"
    arc_id: "arc_1"
    one_liner: "과거의 기억을 확인하며 계획을 세우는 현우"
    key_points:
      - "현재 상황 파악"
      - "바꿔야 할 것들 정리"
      - "첫 번째 목표 설정"
    characters_involved:
      - "mc"
    tension_level: 4

  - chapter_number: 3
    title: "우연이 아닌 만남"
    arc_id: "arc_1"
    one_liner: "서연과의 첫 만남, 이번엔 다르게"
    key_points:
      - "히로인 등장"
      - "전생과 다른 첫인상"
      - "복선: 히로인의 과거"
    characters_involved:
      - "mc"
      - "heroine"
    tension_level: 5

foreshadowing:
  - id: "fs_ring"
    name: "검은 반지의 비밀"
    description: "주인공이 가진 검은 반지의 정체"
    importance: "critical"
    planted_at: 5
    hints_at: [15, 30, 42]
    reveal_at: 48

  - id: "fs_heroine_past"
    name: "히로인의 과거"
    description: "히로인 가족의 죽음과 관련된 진실"
    importance: "critical"
    planted_at: 3
    hints_at: [20, 35]
    reveal_at: 45

  - id: "fs_regression"
    name: "회귀의 대가"
    description: "회귀에는 아직 밝혀지지 않은 대가가 있다"
    importance: "normal"
    planted_at: 1
    hints_at: [25, 50]
    reveal_at: 120

style:
  max_paragraph_length: 3
  dialogue_ratio: 0.6
  sentence_style: "short"
  hook_ending: true
  pov: "1인칭"
  tense: "과거형"
  formatting_rules:
    - "문단은 3문장 이하로"
    - "대사 후 긴 지문 금지"
    - "클리셰 표현 사용 가능 (장르 특성)"
    - "매 회차 끝은 궁금증 유발"
```'''

    def validate_seed(self, seed: NovelSeed) -> list[str]:
        """Validate seed for completeness and consistency.

        Returns:
            List of validation warnings (empty if valid)
        """
        warnings = []

        # Check characters
        if len(seed.characters) < 2:
            warnings.append("캐릭터가 2명 미만입니다. 최소 주인공과 히로인/조력자 필요")

        for char in seed.characters:
            if len(char.voice.sample_dialogues) < 3:
                warnings.append(f"캐릭터 '{char.name}'의 대사 예시가 부족합니다 (최소 3개)")

        # Check arcs
        if not seed.arcs:
            warnings.append("스토리 아크가 정의되지 않았습니다")

        # Check arc coverage
        if seed.arcs:
            covered = set()
            for arc in seed.arcs:
                covered.update(range(arc.start_chapter, arc.end_chapter + 1))

            total_range = set(range(1, seed.total_chapters + 1))
            uncovered = total_range - covered
            if uncovered:
                first_uncovered = min(uncovered)
                warnings.append(f"{first_uncovered}화부터 아크가 정의되지 않았습니다")

        # Check foreshadowing
        if len(seed.foreshadowing) < 3:
            warnings.append("복선이 3개 미만입니다. 장편에선 더 많은 복선 권장")

        critical_fs = [fs for fs in seed.foreshadowing if fs.importance == "critical"]
        if not critical_fs:
            warnings.append("중요 복선(critical)이 없습니다")

        # Check chapter outlines
        if len(seed.chapter_outlines) < 10:
            warnings.append("챕터 아웃라인이 10개 미만입니다")

        return warnings
