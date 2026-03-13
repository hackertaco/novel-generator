"""Prompts for novel generation Phase 0."""

# 장르별 플롯 생성 가이드
GENRE_PROMPTS = {
    "로맨스": """당신은 카카오페이지 로맨스/로판 전문 작가입니다.

## 다양한 구조 예시 (3개 플롯은 서로 다른 구조로!)

### 구조1: 밀당 역전형
제목: 계약 남편이 진심이래
로그라인: 무관심했던 남주가 이혼 앞두고 매달리기 시작
전개: 무관심 → 남주 변화 → 여주가 주도권
핵심: 파워 역전

### 구조2: 오해와 재회형
제목: 7년 후, 다시 너
로그라인: 첫사랑을 떠나보낸 여주, 7년 후 재벌이 되어 돌아온 그
전개: 과거 상처 → 재회 오해 → 진실
핵심: 과거/현재 교차

### 구조3: 라이벌 투 러버형
제목: 최악의 동업자
로그라인: 서로 싫어하는 두 사람이 억지 협업하다 사랑
전개: 적대 → 협력 → 감정 인정
핵심: 티격태격 케미

### 구조4: 성장형
제목: 황후가 된 시녀
로그라인: 천한 신분에서 황후까지, 그녀의 성장기
전개: 신분 상승 → 음모 → 자리 찾기
핵심: 여주 성장

### 구조5: 가짜→진짜형
제목: 가짜 약혼녀의 조건
로그라인: 계약으로 시작한 관계가 진심이 되어버림
전개: 계약 → 경계 흐려짐 → 진심
핵심: 가짜가 진짜로

## 필수 규칙
- 3개 플롯은 반드시 서로 다른 구조
- "집착남+순진여주→위협→남주가지킴" 패턴 반복 금지
- 각 플롯의 핵심 재미 요소가 달라야 함

## 금지
- 3개 다 같은 구조 (집착남물 3개 등)
- 외부 위협이 갈등의 전부인 플롯
- 여주가 수동적으로 구해지기만 하는 전개""",

    "현대 판타지": """당신은 카카오페이지 현대 판타지 전문 작가입니다.

## 다양한 구조 예시

### 구조1: 숨겨진 강자형
제목: F급이 너무 강함
로그라인: F급 판정, 실은 측정 불가
전개: 무시 → 실력 발휘 → 정상 등극

### 구조2: 시스템 각성형
제목: 나만 보이는 창
로그라인: 혼자만 게임 시스템이 보인다
전개: 각성 → 시스템 활용 → 세계의 비밀

### 구조3: 회귀 복수형
제목: 다시 시작하는 S급
로그라인: 배신당해 죽고 과거로, 이번엔 복수
전개: 회귀 → 준비 → 역전

## 필수 규칙
- 능력/스킬 시스템은 단순하게
- 통쾌한 사이다 전개 필수

## 금지
- 이유 없는 먼치킨
- 복잡한 세계관 설명""",

    "무협": """당신은 카카오페이지 무협 전문 작가입니다.

## 다양한 구조 예시

### 구조1: 폐인 역전형
제목: 망나니가 검선이 됨
로그라인: 쫓겨난 망나니가 비급 얻어 천하제일
전개: 추방 → 수련 → 귀환

### 구조2: 복수형
제목: 피로 물들인 강호
로그라인: 문파 멸문당한 생존자의 복수극
전개: 비극 → 성장 → 복수

### 구조3: 세력 성장형
제목: 작은 문파의 대업
로그라인: 약소 문파를 천하제일로 키우는 문주
전개: 인재 모으기 → 강자들과 충돌 → 정상

## 필수 규칙
- 무공 성장 단계 명확
- 무협 특유의 멋있는 장면

## 금지
- 현대 용어
- 게임 시스템""",

    "회귀": """당신은 카카오페이지 회귀물 전문 작가입니다.

## 다양한 구조 예시

### 구조1: 복수형
제목: 10년 전으로
로그라인: 배신당해 죽고 돌아옴, 이번엔 다르다
전개: 회귀 → 배신자 파악 → 응징

### 구조2: 구원형
제목: 이번엔 지킨다
로그라인: 전생에서 잃은 사람들을 이번엔 지키겠다
전개: 회귀 → 운명 바꾸기 → 해피엔딩

### 구조3: 정상형
제목: 두 번째 인생은 정상에서
로그라인: 전생 지식으로 이번엔 최고가 되겠다
전개: 회귀 → 선점/투자 → 정상

## 필수 규칙
- 미래 지식 활용이 핵심
- 전생 vs 현재 비교

## 금지
- 루프물
- 전생 회상 과다""",
}


def get_genre_prompt(genre: str, interview_result: str, count: int = 3) -> str:
    """Get genre-specific prompt for plot generation."""
    genre_guide = GENRE_PROMPTS.get(genre, GENRE_PROMPTS["현대 판타지"])

    return f"""{genre_guide}

다음 설정으로 웹소설 플롯 {count}개를 생성하세요.
중요: {count}개 플롯은 반드시 서로 다른 구조여야 합니다!

{interview_result}

각 플롯마다:
- 제목 (6자 이내)
- 로그라인 (한 줄)
- 왜 재밌는지 (한 줄)
- 주요 전개 3개 (각각 다른 방향으로)
- 핵심 반전 1개

JSON 배열로 출력:
[
  {{
    "id": "A",
    "title": "제목",
    "logline": "한줄 설명",
    "hook": "재미 포인트",
    "arc_summary": ["전개1", "전개2", "전개3"],
    "key_twist": "반전"
  }},
  ...
]
"""


def detect_genre(text: str) -> str:
    """Detect genre from interview text."""
    text_lower = text.lower()
    if "로맨스" in text_lower or "로판" in text_lower:
        return "로맨스"
    elif "무협" in text_lower:
        return "무협"
    elif "회귀" in text_lower or "귀환" in text_lower:
        return "회귀"
    return "현대 판타지"


INTERVIEW_SYSTEM_PROMPT = """웹소설 기획자. 아이디어를 카카오페이지 스타일 장편으로 구체화.

역할:
1. 핵심 파악 질문
2. 모호한 부분 구체화
3. 캐릭터, 세계관, 갈등 정리

원칙:
- 한 번에 1-2개 질문
- 선택지 제시
- 클리셰 OK (장르물)
- 간결하게
"""

INTERVIEW_QUESTIONS = {
    "genre": {
        "question": "어떤 장르를 생각하고 계신가요?",
        "options": [
            "현대 판타지 (헌터물, 회귀, 빙의 등)",
            "정통 판타지 (이세계, 마법사, 기사 등)",
            "무협",
            "로맨스/로판",
            "기타",
        ],
        "follow_up": {
            "현대 판타지": "회귀, 빙의, 헌터물 중 어떤 설정이 끌리세요?",
            "정통 판타지": "이세계물인가요, 아니면 독자적인 판타지 세계인가요?",
        },
    },
    "protagonist": {
        "question": "주인공은 어떤 인물인가요?",
        "sub_questions": [
            "성별과 대략적인 나이대는?",
            "어떤 특별한 능력이나 재능이 있나요?",
            "가장 큰 결핍이나 상처는?",
            "궁극적으로 무엇을 원하나요?",
        ],
    },
    "conflict": {
        "question": "주인공이 맞서야 할 가장 큰 갈등은 뭔가요?",
        "options": [
            "거대한 악과의 대결 (마왕, 범죄조직 등)",
            "사회/시스템에 대한 저항",
            "과거의 자신과의 싸움 (트라우마, 후회)",
            "사랑하는 사람을 지키는 것",
            "정상에 오르는 것 (권력, 실력)",
        ],
    },
    "tone": {
        "question": "전체적인 톤은 어떤 느낌으로 가고 싶으세요?",
        "options": [
            "진지하고 어두운 (복수극, 비극적 요소)",
            "밝고 통쾌한 (사이다, 성장)",
            "긴장감 있는 (서스펜스, 두뇌싸움)",
            "감성적인 (로맨스, 가족애)",
        ],
    },
    "scale": {
        "question": "어느 정도 분량을 생각하고 계세요?",
        "options": [
            "단편 (~50화): 짧고 굵게",
            "중편 (100~200화): 적당한 서사",
            "장편 (300화+): 대하소설급 스케일",
        ],
    },
}

SEED_GENERATION_PROMPT = """다음 인터뷰 결과를 바탕으로 웹소설 설계를 완성해주세요.

## 인터뷰 결과
{interview_result}

## 출력 형식 (YAML)
다음 구조로 NovelSeed를 생성해주세요:

```yaml
title: "소설 제목"
logline: "한 줄 로그라인"
total_chapters: 300  # 분량에 맞게 조정

world:
  name: "세계 이름"
  genre: "장르"
  sub_genre: "서브장르"
  time_period: "시대/배경"
  magic_system: "능력 체계 설명"
  key_locations:
    location_id: "설명"
  factions:
    faction_id: "설명"
  rules:
    - "세계관 규칙 1"
    - "세계관 규칙 2"

characters:
  - id: "mc"
    name: "이름"
    role: "주인공"
    introduction_chapter: 1
    voice:
      tone: "말투 설명"
      speech_patterns:
        - "특징적 어미"
      sample_dialogues:
        - "예시 대사 1"
        - "예시 대사 2"
      personality_core: "핵심 성격"
    backstory: "배경 스토리"
    arc_summary: "캐릭터 성장 아크"
    state:
      level: 1
      relationships: {{}}

arcs:
  - id: "arc_1"
    name: "1부 제목"
    start_chapter: 1
    end_chapter: 50
    summary: "아크 요약"
    key_events:
      - "주요 사건 1"
      - "주요 사건 2"
    climax_chapter: 48

chapter_outlines:
  - chapter_number: 1
    title: "1화 제목"
    arc_id: "arc_1"
    one_liner: "한 줄 설명"
    key_points:
      - "포인트 1"
    characters_involved:
      - "mc"
    tension_level: 5

foreshadowing:
  - id: "fs_1"
    name: "복선 이름"
    description: "복선 설명"
    importance: "critical"
    planted_at: 5
    hints_at:
      - 15
      - 30
    reveal_at: 48

style:
  max_paragraph_length: 3
  dialogue_ratio: 0.6
  sentence_style: "short"
  hook_ending: true
  pov: "1인칭"
  tense: "과거형"
```

주의사항:
1. 캐릭터 대사 예시는 캐릭터 성격이 잘 드러나도록
2. 복선은 최소 3개 이상, 아크 클라이맥스에서 회수되도록 설계
3. 챕터 아웃라인은 처음 10화까지만 상세하게
4. 긴장도(tension_level)는 아크 구조에 맞게 기복 있게
"""

CHAPTER_GENERATION_PROMPT = """## 회차 정보
{chapter_context}

## 스타일 가이드
{style_guide}

## 이전 전개
{previous_context}

## 지시사항
위 컨텍스트를 바탕으로 {chapter_number}화를 작성해주세요.

카카오페이지 스타일 필수 요소:
1. 짧은 문단 (3문장 이하)
2. 대사 비중 60% 이상
3. 매 회차 끝에 후킹 (궁금증 유발)
4. 6000자 내외

{foreshadowing_instructions}

출력: 소설 본문만 (메타 정보 없이)
"""

SUMMARY_EXTRACTION_PROMPT = """다음 회차 내용을 분석하여 구조화된 요약을 생성해주세요.

## 회차 내용
{chapter_content}

## 출력 형식 (JSON)
```json
{{
  "plot_summary": "1-2문장 줄거리 요약",
  "emotional_beat": "감정적 톤 (예: 긴장, 감동, 통쾌)",
  "cliffhanger": "마지막 후킹 요소 (없으면 null)",
  "events": [
    {{
      "type": "battle|dialogue|discovery|training|romance|betrayal|death|power_up|flashback|cliffhanger",
      "participants": ["캐릭터ID"],
      "description": "무슨 일이 있었는지",
      "outcome": "결과",
      "consequences": {{"키": "값"}}
    }}
  ],
  "character_changes": [
    {{
      "character_id": "ID",
      "changes": {{"속성": "변화 내용"}}
    }}
  ],
  "foreshadowing_touched": [
    {{
      "foreshadowing_id": "ID",
      "action": "plant|hint|reveal",
      "context": "어떻게 등장했는지"
    }}
  ]
}}
```

중요:
- 캐릭터ID는 seed에 정의된 id 사용
- 복선은 실제로 언급된 것만 기록
- 캐릭터 변화는 유의미한 것만 (레벨업, 관계 변화 등)
"""
