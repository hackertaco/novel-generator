import { getArchetypeGuidance } from "@/lib/archetypes/character-archetypes";

export function getSeedPrompt(interviewResult: string): string {
  // Extract genre from interview result for archetype guidance
  const genreMatch = interviewResult.match(/장르:\s*(.+)/);
  const genre = genreMatch ? genreMatch[1].trim() : "로맨스 판타지";
  const archetypeGuide = getArchetypeGuidance(genre);

  return `다음 인터뷰 결과를 바탕으로 웹소설 설계를 완성해주세요.

## 인터뷰 결과
${interviewResult}
${archetypeGuide}

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
    gender: "female"  # male, female, or other — 대명사(그/그녀)와 호칭 결정에 필수
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
    name: "아크1 제목"
    start_chapter: 1
    end_chapter: 10
    summary: "아크 요약"
    key_events:
      - "주요 사건 1"
      - "주요 사건 2"
      - "주요 사건 3"
    climax_chapter: 9
    theme: "아크의 주제 (예: 정체 숨기기, 신뢰와 배신)"
  - id: "arc_2"
    name: "아크2 제목"
    start_chapter: 11
    end_chapter: 22
    summary: "아크 요약"
    key_events:
      - "주요 사건 1"
      - "주요 사건 2"
      - "주요 사건 3"
    climax_chapter: 20
    theme: "아크의 주제"

story_threads:
  - id: "main"
    name: "메인 스토리 (예: 암살 누명 벗기)"
    type: "main"
    description: "이 소설의 핵심 줄거리"
    relations: []
  - id: "romance"
    name: "로맨스 (예: 라시드와의 관계)"
    type: "sub"
    description: "감정적 깊이를 더하는 서브 스레드"
    relations:
      - target: "main"
        relation: "conflicts_with"
        description: "감정이 깊어질수록 정치적 판단이 흔들림"
  - id: "conspiracy"
    name: "음모 (예: 황후의 비밀)"
    type: "sub"
    description: "복잡성과 긴장감을 더하는 서브 스레드"
    relations:
      - target: "main"
        relation: "feeds_into"
        description: "음모의 증거가 누명을 벗는 핵심 반증이 됨"
      - target: "romance"
        relation: "reveals"
        description: "음모를 파헤치면서 상대의 진심을 알게 됨"

chapter_outlines:
  - chapter_number: 1
    title: "1화 제목"
    arc_id: "arc_1"
    one_liner: "한 줄 설명"
    advances_thread: ["main"]
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
    planted_at: 3
    hints_at:
      - 8
      - 14
      - 20
    reveal_at: 25
  - id: "fs_2"
    name: "두 번째 복선"
    description: "복선 설명"
    importance: "normal"
    planted_at: 5
    hints_at:
      - 12
      - 19
      - 27
    reveal_at: 32

style:
  max_paragraph_length: 3
  dialogue_ratio: 0.6
  sentence_style: "short"
  hook_ending: true
  pov: "1인칭"
  tense: "과거형"
\`\`\`

주의사항:
0. **스토리 스레드 (가장 중요!)**:
   - story_threads에 메인 스레드 1개 + 서브 스레드 2~3개를 정의하세요.
   - 메인 스레드: 이 소설의 핵심 줄거리 (예: "암살 누명을 벗고 진범을 찾는다")
   - 서브 스레드: 메인을 보조하는 줄거리 (예: "로맨스", "음모 추적", "가족 갈등")
   - **chapter_outlines의 advances_thread**: 매 화가 어떤 스레드를 진전시키는지 명시. 최소 1개.
   - 메인 스레드는 매 3화마다 최소 1번 진전되어야 합니다.
   - 각 화의 one_liner는 "이 화에서 어떤 스레드가 어떻게 진전되는지"를 담아야 합니다.
1. 캐릭터는 첫 60화에 등장할 **핵심 인물 8~12명**을 정의. 주인공, 상대역, 조력자 2~3명, 적대자 2명, 멘토 1명, 서브 캐릭터 2~3명. 각 캐릭터의 대사 예시는 성격이 명확히 드러나도록. introduction_chapter를 1~30 사이에 분산시킬 것.
   **gender 필드 필수**: 모든 캐릭터에 gender("male"/"female"/"other")를 명시하세요. 이 값이 대명사(그/그녀)와 호칭(공작/공작부인, 기사/여기사)을 결정합니다.
2. **캐릭터 등장 페이싱 (매우 중요)**: introduction_chapter를 반드시 분산시킬 것!
   - 1화: 주인공 + 최대 1명 (첫 만남 상대). 독자가 주인공에게 집중하도록.
   - 2~5화: 핵심 조력자나 라이벌 1명씩 순차 등장
   - 6화 이후: 나머지 캐릭터 점진적 소개
   - 절대로 1화에 3명 이상의 캐릭터를 배정하지 말 것. 독자는 인물과 친해질 시간이 필요하다.
3. relationships는 반드시 객체(object)로: {"캐릭터id": "관계설명"} 형태. 배열 금지!
4. **아크 크기 (절대 준수)**: 각 아크는 반드시 8~15화! 20화 이상의 아크는 금지! 60화에 최소 5개 아크가 있어야 합니다.
5. **복선 규칙**: 최소 5개 이상. 심기~회수 사이에 힌트 3개 이상 (5~8화 간격). 회수가 같은 화에 몰리면 안 됨. 다른 아크에서 회수.
6. 챕터 아웃라인은 처음 10화까지만 상세하게
7. **초반 페이싱 (매우 중요!)**:
   카카오페이지 독자는 1화에서 판단합니다. **1화부터 사건이 있어야 합니다.**
   - **1화**: 주인공 소개 + **사건 1개**. 독자가 "다음 화" 버튼을 누를 이유가 있어야 함.
     ❌ "일상 속 불안감", "분위기를 느낀다" → 아무 일도 안 일어남, 독자 이탈
     ✅ "독살당했는데 살아났다", "계모의 서랍에서 독약 영수증 발견", "가짜 약혼녀로 계약" → 구체적 사건
   - **2~3화**: 1화 사건의 파장 + 새로운 인물/단서 등장. 이야기가 전진.
   - **4~6화**: 갈등 심화. 새로운 사건 추가. 관계 변화.
   - **7~10화**: 클라이맥스와 반전.
   - **핵심**: 매 화의 key_points는 "누가 무엇을 했다/발견했다/결정했다"여야 한다. "느꼈다/감지했다/인식했다"는 사건이 아니다.
   - **핵심**: 매 화 끝에 독자가 "그래서 어떻게 되는 거야?"라고 물을 수 있어야 한다.
8. 긴장도(tension_level)는 아크 구조에 맞게 기복 있게. 1~3화는 2~4 수준, 7~10화에서 7~9로 올라가야 자연스럽습니다.
9. state의 relationships 예시: {"heroine": "첫만남, 호기심", "rival": "적대적"}
10. chapter_outlines의 characters_involved도 페이싱을 반영: 1화는 ["mc"] 또는 ["mc", "히로인id"] 수준. 한 화에 4명 이상 등장시키지 말 것
11. **개연성 검증 (매우 중요! 설정이 말이 되어야 합니다!)**:
   - 캐릭터가 위장/사칭한다면: 왜 안 들키는지 설정에 근거가 있어야 함 (예: 변방 출신이라 얼굴을 아는 사람이 없다, 기록이 소실됐다)
   - 캐릭터가 위험한 선택을 한다면: 그래야만 하는 이유가 backstory나 arc_summary에 명시되어야 함
   - 죽은/처형된 인물의 이름을 쓴다면: 그 죽음이 비공개였거나, 알 수 있는 사람이 제한적이라는 설정 필요
   - "왜 더 쉬운 방법을 안 쓰지?"에 대한 답이 설정 안에 있어야 함
   - 세계관 규칙과 캐릭터 능력이 모순되면 안 됨
12. **logline에 전체 로드맵 포함 (중요)**: logline 필드에 한 줄 로그라인 뒤에 "\n\n[전체 로드맵]\nPart1(1~60화): ...\nPart2(61~130화): ...\nPart3(131~200화): ...\nPart4(201~300화): ..." 형태로 전체 스토리의 큰 흐름을 추가하세요. 이렇게 해야 300화 전체가 어디로 가는지 독자에게 보여줄 수 있습니다.`;
}
