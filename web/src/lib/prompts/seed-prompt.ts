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

chapter_outlines:
  - chapter_number: 1
    title: "1화 제목"
    arc_id: "arc_1"
    one_liner: "언제/어디서 누가 무엇을 하는지 포함한 한 줄 설명 (예: '계약 종료일 오후, 공작저 서재에서 레오나가 카시안의 혼약을 거부하고 연회장으로 향한다')"
    opening_context: "1화 전용: 독자에게 알려줄 초기 맥락 — 시대, 장소, 주인공의 처지를 1-2문장으로 (예: '마법이 쇠퇴한 대륙, 변방 영지의 서자로 태어난 레오나는 계약 기간 3년이 끝나는 날을 맞이한다')"
    key_points:
      - what: "무슨 일이 일어나는가"
        why: "왜 그런 일이 일어나는가 (인물의 동기/상황의 원인)"
        caused_by: "이전 화의 어떤 사건이 이것을 일으켰는가"
        consequence: "이 사건 때문에 무엇이 바뀌는가"
        prerequisite: "독자가 이 사건을 납득하려면 사전에 무엇을 알아야 하는가"
        requires_items: ["이 사건에 필요한 소품 (이전 화 물건 재활용 우선)"]
        returning_character: "재등장 인물 — 이유 (예: '마르타 — 세탁실 인맥으로 명단 루트 제공')"
        reveal: "immediate"
      - what: "숨기고 싶은 사건"
        why: "나중에 밝혀질 이유"
        caused_by: "1화에서 족쇄가 테오의 손에 반응해 깨짐"
        consequence: "리에나와 칼리언이 함께 있어야만 아이가 안정된다는 사실이 드러남"
        prerequisite: "3화에서 에이렌이 '이 아이의 몸이 불안정하다'고 미리 경고해야 함"
        requires_items: ["족쇄 파편"]
        reveal: "delayed"
        reveal_at: 5
        different_from_prev: "3화에서는 울며 매달렸지만, 이번에는 말없이 손만 잡는다"
    characters_involved:
      - "mc"
    tension_level: 5
    new_info_for_reader: "이 화에서 독자에게 새로 주는 핵심 정보 (예: '레오나가 계약 종료를 선언함')"
    recurring_items: ["이전 화에서 등장했고 이번 화에서 다시 쓰이는 소품"]

story_threads:
  - id: "kasian_true_motive"
    type: secret
    owner: 카시안
    name: "카시안의 진짜 동기"
    description: "레오나를 지키려는 진짜 이유는 봉인 의식의 제물로 바치지 않기 위해서"
    relations: []
    reveal_timeline:
      - chapter_range: "1-14"
        to: reader
        level: hidden
        method: "카시안의 행동이 과보호처럼 보이지만 이유는 숨김"
      - chapter_range: "15"
        to: reader
        level: hinted
        method: "카시안이 제단 앞에서 혼잣말하는 장면"
      - chapter_range: "30-39"
        to: reader
        level: partial
        method: "봉인 의식 관련 문서 조각이 발견됨"
      - chapter_range: "40"
        to: protagonist
        level: revealed
        method: "레오나가 봉인 의식 문서를 발견"
  - id: "leona_emotion"
    type: emotion
    owner: 레오나
    name: "레오나의 카시안에 대한 감정"
    description: "경계 → 호기심 → 신뢰 → 사랑"
    relations:
      - target: "kasian_true_motive"
        relation: "conflicts_with"
        description: "카시안의 비밀을 알게 되면 감정이 흔들림"
    reveal_timeline:
      - chapter_range: "1-10"
        to: reader
        level: hinted
        method: "내면 묘사로 살짝 보여줌 (본인도 자각 못함)"
      - chapter_range: "11-25"
        to: reader
        level: partial
        method: "독백과 행동으로 감정 변화 드러남"
      - chapter_range: "26"
        to: love_interest
        level: revealed
        method: "위기 상황에서 본심이 터져나옴"
  - id: "core_twist"
    type: plot_twist
    owner: ""
    name: "핵심 플롯 트위스트"
    description: "봉인이 풀리면 세계가 멸망하는 것이 아니라 진짜 위협은 봉인을 유지하는 자들"
    relations: []
    reveal_timeline:
      - chapter_range: "1-30"
        to: reader
        level: hidden
        method: "봉인의 중요성만 강조, 진실은 완전히 숨김"
      - chapter_range: "31-44"
        to: reader
        level: hinted
        method: "봉인 수호자들의 수상한 행동이 포착됨"
      - chapter_range: "45-49"
        to: protagonist
        level: partial
        method: "주인공이 옛 기록에서 모순을 발견"
      - chapter_range: "50"
        to: public
        level: revealed
        method: "봉인 수호자의 진짜 목적이 만천하에 드러남"

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

extended_outlines: []  # 별도 생성됩니다

style:
  max_paragraph_length: 3
  dialogue_ratio: 0.6
  sentence_style: "short"
  hook_ending: true
  pov: "1인칭"
  tense: "과거형"
\`\`\`

주의사항:
-1. **세계관 규칙 (world.rules) 필수 포함**:
   world.rules에 반드시 포함할 것:
   - 신분 체계 규칙 (누가 누구에게 어떻게 말하는지 — 존대/반말/칭호)
   - 버릇없이 굴면 어떤 결과가 오는지 (처벌, 사회적 제재)
   - 이 세계에서 금기인 행동 (예: 왕 앞에서 무기 소지, 마법 사용 제한 등)
   - 최소 5개 이상의 규칙을 구체적으로 작성하세요.
0. **스토리 스레드 & 공개 타임라인 (매우 중요!)**:
   story_threads에 최소 3~5개의 스레드를 만드세요:
   - **남주/여주 비밀** (type: "secret"): 주요 캐릭터가 숨기고 있는 것. owner 필수.
   - **여주/남주 감정선** (type: "emotion"): 감정의 변화 과정. owner 필수.
   - **핵심 플롯 트위스트** (type: "plot_twist"): 이야기의 큰 반전.
   - **관계 변화** (type: "relationship"): 두 캐릭터 사이의 관계 전환점.
   - 각 스레드에는 reveal_timeline으로 **hidden → hinted → partial → revealed** 순서의 공개 과정을 설계하세요.
   - reveal_timeline은 소설 전체에 걸쳐 분산하세요. 처음 10화에 모두 공개되면 안 됩니다!
   - "to" 필드로 누구에게 공개되는지 구분하세요:
     reader(독자만 아는), protagonist(주인공이 아는), love_interest(상대역이 아는), public(모두 아는), specific(특정 캐릭터)
   - method에는 구체적 공개 방법을 적으세요: "독백", "문서 발견", "대화 중 실수", "목격", "제3자 고백" 등
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
6. 챕터 아웃라인은 처음 10화까지만 상세하게 (key_points, characters_involved 등)
   extended_outlines는 빈 배열([])로 두세요. 별도로 생성됩니다.
   - **1화에만 opening_context 필수**: 독자에게 알려줄 초기 맥락 (시대, 장소, 주인공의 처지). 2화부터는 생략 가능.
   - **one_liner에 when/where 포함**: "언제, 어디서, 누가 무엇을 한다" 형태로 적으세요. ❌ "주인공이 위기를 맞는다" → ✅ "한밤의 연회장에서 리아가 독잔을 바꿔치기한다"
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
   - **반복 방지**: 같은 캐릭터가 비슷한 상황을 반복할 때, key_points에 different_from_prev를 명시하세요. 예: "3화에서는 울며 매달렸지만, 이번에는 말없이 손만 잡는다". 같은 대사나 행동이 여러 화에 걸쳐 반복되면 안 됩니다.
8. **인과관계 (가장 중요한 규칙)**:
   모든 key_point의 사건에는 반드시:
   - caused_by: 이전 화의 어떤 사건이 이것을 일으켰는가?
   - consequence: 이 사건 때문에 무엇이 바뀌는가?
   - prerequisite: 독자가 이 사건을 납득하려면 사전에 무엇을 알아야 하는가?

   ❌ 갑자기 아프다 (원인 없음)
   ❌ 왕을 방해했는데 아무 일 없다 (결과 없음)
   ❌ 독자가 모르는 설정이 갑자기 나온다 (사전 정보 없음)

   ✅ 1화에서 깨진 족쇄 → 3화에서 에이렌 경고 → 7화에서 고열 (인과 사슬)
   ✅ 처형을 방해함 → 즉시 감금 + 심문 + 의심 (결과가 따라옴)

   1화의 key_points는 caused_by가 없을 수 있습니다 (이야기 시작점). 2화부터는 반드시 이전 화와의 인과관계를 명시하세요.
9. 긴장도(tension_level)는 아크 구조에 맞게 기복 있게. 1~3화는 2~4 수준, 7~10화에서 7~9로 올라가야 자연스럽습니다.
10. state의 relationships 예시: {"heroine": "첫만남, 호기심", "rival": "적대적"}
11. chapter_outlines의 characters_involved도 페이싱을 반영: 1화는 ["mc"] 또는 ["mc", "히로인id"] 수준. 한 화에 4명 이상 등장시키지 말 것
12. **소품 연속성 (requires_items + recurring_items)**:
   - key_points에 requires_items로 이 사건에 필요한 소품/물건을 명시하세요.
   - 이전 화에서 등장한 물건은 반드시 재활용 우선! 매 화마다 새 물건만 만들지 마세요.
   - chapter_outlines에 recurring_items로 이전 화에서 가져오는 소품을 명시하세요. (예: 1화의 자수 조각 → 3화에서 숫자 해독에 사용)
   - **만남의 연속 금지**: 매 화가 "새 인물 만남"으로만 이루어지면 안 됩니다. 3~4화마다 기존 인물이 재등장하여 관계가 깊어져야 합니다. key_points의 returning_character를 사용하세요.
13. **정보 예산 (new_info_for_reader)**:
   - 각 화의 new_info_for_reader에 독자에게 새로 줄 핵심 정보 1~2개를 적으세요.
   - 이 밖의 정보는 이번 화에서 보류합니다. 한 화에 너무 많은 정보를 쏟아부으면 독자가 소화 못 합니다.
   - 이미 공개된 정보를 다시 설명하지 마세요. 대신 그 정보의 결과/파장을 보여주세요.
14. **로판 감정선 페이싱 (로맨스 판타지 장르 필수!)**:
   카카오페이지 독자는 정치/생존만으로 10화를 기다리지 않습니다. **감정선과 사건이 동시에 진행**되어야 합니다.
   - **1~2화**: 첫인상 + 거래/갈등. 아직 감정 없음. 하지만 "이 사람 뭔가 다르다"는 순간 1개.
   - **3~4화**: 예상 밖의 모습 목격 (약한 면, 따뜻한 면). 설렘이 아니라 **혼란** — "왜 저런 짓을 하지?"
   - **5~6화**: 의도치 않은 가까운 물리적 접촉 (손 잡기, 부축, 근접). 심장이 뛰는 건 아직 인정 안 함.
   - **7~10화**: 감정을 의식하기 시작. 상대를 걱정/보호하려는 행동이 거래 논리를 넘어섬.
   - key_points에 감정 관련 사건을 반드시 포함하세요. "거래/협상/조사"로만 10화를 채우면 안 됩니다.
   - story_threads에 emotion 타입 스레드가 반드시 있어야 하고, 3화부터 진전이 시작되어야 합니다.
15. **개연성 검증 (매우 중요! 설정이 말이 되어야 합니다!)**:
   - 캐릭터가 위장/사칭한다면: 왜 안 들키는지 설정에 근거가 있어야 함 (예: 변방 출신이라 얼굴을 아는 사람이 없다, 기록이 소실됐다)
   - 캐릭터가 위험한 선택을 한다면: 그래야만 하는 이유가 backstory나 arc_summary에 명시되어야 함
   - 죽은/처형된 인물의 이름을 쓴다면: 그 죽음이 비공개였거나, 알 수 있는 사람이 제한적이라는 설정 필요
   - "왜 더 쉬운 방법을 안 쓰지?"에 대한 답이 설정 안에 있어야 함
   - 세계관 규칙과 캐릭터 능력이 모순되면 안 됨
16. **logline에 전체 로드맵 포함 (중요)**: logline 필드에 한 줄 로그라인 뒤에 "\n\n[전체 로드맵]\nPart1(1~60화): ...\nPart2(61~130화): ...\nPart3(131~200화): ...\nPart4(201~300화): ..." 형태로 전체 스토리의 큰 흐름을 추가하세요. 이렇게 해야 300화 전체가 어디로 가는지 독자에게 보여줄 수 있습니다.`;
}
