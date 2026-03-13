export function getSeedPrompt(interviewResult: string): string {
  return `다음 인터뷰 결과를 바탕으로 웹소설 설계를 완성해주세요.

## 인터뷰 결과
${interviewResult}

## 출력 형식 (YAML)
다음 구조로 NovelSeed를 생성해주세요:

\`\`\`yaml
title: "소설 제목"
logline: "한 줄 로그라인"
total_chapters: 300

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
      relationships: {}

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
\`\`\`

주의사항:
1. 캐릭터는 1부(첫 50화)에 등장할 **핵심 인물 5~8명**을 정의. 주인공, 상대역, 조력자 2명, 적대자 1~2명, 서브 캐릭터 1~2명. 각 캐릭터의 대사 예시는 성격이 명확히 드러나도록. (2부 이후의 캐릭터는 나중에 플래닝 단계에서 추가됨)
2. **캐릭터 등장 페이싱 (매우 중요)**: introduction_chapter를 반드시 분산시킬 것!
   - 1화: 주인공 + 최대 1명 (첫 만남 상대). 독자가 주인공에게 집중하도록.
   - 2~5화: 핵심 조력자나 라이벌 1명씩 순차 등장
   - 6화 이후: 나머지 캐릭터 점진적 소개
   - 절대로 1화에 3명 이상의 캐릭터를 배정하지 말 것. 독자는 인물과 친해질 시간이 필요하다.
3. relationships는 반드시 객체(object)로: {"캐릭터id": "관계설명"} 형태. 배열 금지!
4. 복선은 최소 3개 이상, 아크 클라이맥스에서 회수되도록 설계
5. 챕터 아웃라인은 처음 10화까지만 상세하게
6. **1화 아웃라인 페이싱**: 1화의 key_points는 **최대 2개**. 1화는 "상황 설정 + 궁금증 하나"로 충분하다. 독자를 사건 속에 던지되, 모든 것을 설명하려 하지 말 것.
7. 긴장도(tension_level)는 아크 구조에 맞게 기복 있게
8. state의 relationships 예시: {"heroine": "첫만남, 호기심", "rival": "적대적"}
9. chapter_outlines의 characters_involved도 페이싱을 반영: 1화는 ["mc"] 또는 ["mc", "히로인id"] 수준. 한 화에 4명 이상 등장시키지 말 것`;
}
