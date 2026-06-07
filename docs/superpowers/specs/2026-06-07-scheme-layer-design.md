# Scheme Layer (음모 레이어) 설계 — 다화(multi-chapter) 책략의 결정적 실행

날짜: 2026-06-07
상태: 설계 합의됨 (브레인스토밍 + 외부 검증 완료)
선행: Planner Phase 0-2 (`planner-scorer.ts`, commits cf29edf/260dc11/e269a66/44d4264)

## 1. 목적과 배경

현재 시뮬레이터의 인물은 근시안(myopic)이다 — 매 tick 국소 최적 행동만 고르고,
"지금 손해를 감수하고 늦게 회수"하는 다화 책략을 못 한다 (천장 ①).
또한 시드의 `chapter_outlines`가 시뮬을 레일링하는 구조적 역전 문제(③)가 있다.

이 설계는 그 해소의 1단계(A)다:

- **A. 음모 레이어 (이 문서)**: 얇은 시드에 음모 뼈대를 선언하고, 시뮬이 적응 실행.
  로그에 다화 인과(plant→payoff)가 생긴다.
- **B. outline 역전 (다음 사이클)**: outline 레일을 끊고 로그에서 outline을 솎아내는
  에이전트. A가 만든 아크 있는 로그가 B의 전제다.

핵심 통찰: **다화 책략에 lookahead 탐색이 필요 없다.** 단계(stage) 구조가 장기 의도를
운반하고, Planner는 근시안인 채로 단계가 바뀔 때 효용 함수만 갈아끼우면 된다.
forward model은 계획의 "발명"에만 필요한데, 발명은 시드 생성 LLM의 몫이다.

## 2. 핵심 원칙

1. **전략은 시드 선언, 전술은 시뮬 즉흥.** 음모의 큰 단계는 시드에 적히고
   (사람 또는 시드 생성 LLM이 발명), 매 tick 행동은 Planner가 상황 보고 정한다.
2. **시점은 시간이 아니라 상태.** 단계 전환은 화수가 아니라 졸업조건(`advance_when`,
   기계 채점 가능한 술어)이 정한다. 알람시계가 아니라 뇌관.
3. **결정성.** 모든 채점은 월드모델 상태 위의 순수함수. 같은 시드 → 같은 이야기.
4. **추가형 (blast=0).** scheme 없는 인물·시드는 기존과 100% 동일하게 동작.
5. **음모는 악역 전용이 아니다.** 주인공의 역공도 같은 스키마. 소설의 뼈대 =
   서로 맞물린 음모 2-3개 (서로가 서로의 깨짐 조건을 건드리는 시소게임).

## 3. 시드 스키마 v1.1

`character.intent_profile.scheme` (옵셔널):

```jsonc
{
  "objective": "약혼을 파탄내고 엘리시아를 축출한다",
  "motive": "황태자비 자리와 가문의 부채 해소",        // 동기 — 나중에 밝혀질 "왜"
  "target": "elysia",
  "stakes": {                                          // 판돈 — 긴장의 원천
    "on_success": "세레나가 황태자비 내정",
    "on_failure": "세레나 가문 몰락, 사교계 매장",
    "collateral": ["marian"]                           // 휘말리는 주변인
  },
  "cover_story": "언니를 걱정하는 다정한 동생",          // 위장 — 극적 아이러니의 표면
  "stages": [                                          // 3-5개, 순서대로
    {
      "id": "신뢰_쌓기",
      "goal": "다정한 동생으로 곁에 머문다",
      "tactics": ["request_help", "maintain_mask"],    // CharacterActionType 중에서
      "advance_when": {                                 // 복합 졸업조건 (체크리스트 함정 방지)
        "all": [
          { "trust_at_least": { "from": "elysia", "value": 2 } },
          { "chapter_at_least": 2 }
        ]
      },
      "leaves_clue": "세레나가 하인 명단에 손댄 흔적",   // → foreshadow 레지스트리에 plant 등록
      "cost": "자기 비밀 하나를 미끼로 내준다",          // 이 단계에서 감수하는 손해
      "vulnerability": {                                // 이 단계가 노출하는 약점 (시소게임 장치)
        "fact": "세레나가 명단에 접근했다는 기록",
        "exploit_ops": ["request_access", "probe_dialogue"]
      },
      "disrupted_when": {                               // 이 단계가 깨지는 조건
        "any": [ { "secret_known_by": { "secret": "세레나의 명단 조작", "by": "elysia" } } ]
      },
      "dramatic_irony": "reader_knows",                 // 선택: reader_knows|reader_suspects|reader_deceived
      "tension_flow": "build_frustration",              // 선택: build_frustration|release_satisfaction|neutral
      "stall_after_chapters": 4                         // 선택: N화 무진전 시 교착 처리
    }
    // ... "증거_심기", "배신"(최종 단계 = payoff)
  ],
  "payoff": { "op": "confront", "description": "공개 석상에서 폭로" },  // 최종 단계의 사건 모양
  "if_exposed": { "response": "가속", "exposure_threshold": 3 },        // 잠적|가속|포기
  "deadline": { "chapter": 12, "on_miss": "가속" },                     // 선택: 시한
  "accomplices": [                                                       // 선택: 공모자/말
    { "id": "rael", "role": "말", "knows_full_plan": false }
  ]
}
```

`foreknowledge`는 scheme 내부가 아니라 **"아는 쪽" 인물의 `intent_profile` 레벨**에 둔다
(scheme이 없는 인물도 타인의 음모를 알 수 있으므로). 예: 엘리시아의 intent_profile에:

```jsonc
"foreknowledge": {              // 회귀물 핵심 — 한 수 앞서기의 시스템적 근거
  "source": "회귀",
  "knows_schemes_of": ["serena"] // 처음부터 구조(단계/약점)를 아는 타인의 음모
}
```

### 졸업/깨짐 조건 술어 어휘 (v1)

전부 월드모델이 이미 추적하는 상태 위에서 결정적으로 평가 가능해야 한다:

| 술어 | 의미 | 평가 소스 |
|---|---|---|
| `trust_at_least` / `trust_below` | 신뢰 임계 | relationshipModel trust |
| `event_occurred` | 사건 발생 (type/by/target) | 사건 로그/ledger |
| `secret_known_by` | 비밀을 특정 인물이 인지 | knownFacts/belief |
| `chapter_at_least` | 화수 하한 (보조) | clock |
| `scheme_stage_at` | 타 음모가 N단계 이상 (맞물림) | SchemeState |
| `exposure_at_least` | 들킴 게이지 임계 | SchemeState |
| 조합자: `all` / `any` / `not` | 복합 조건 | — |

자유 텍스트 조건("분위기가 무르익으면")은 **금지**. 어휘에 없으면 표현 불가가 맞다.

## 4. 런타임 설계

### 4.1 SchemeState (인물별, runtime mind state 옆)

```ts
{
  characterId, schemeTarget,
  currentStageIndex: number,
  status: "active" | "stalled" | "exposed" | "completed" | "aborted",
  exposureGauge: number,        // 음모성 행동 목격/backfire 시 +1
  stalledChapters: number,      // 무진전 카운터
  history: [{ chapter, kind: "advanced"|"disrupted"|"exposed"|"aborted"|"completed" }]
}
```

### 4.2 평가 시점과 전환

- **매 장면 종료 시** 결정적으로 채점: 현재 단계의 `advance_when` / `disrupted_when` /
  보편 실패조건 → 전환.
- 단계 전환은 **사건으로 기록**되고 `scheme:{char}:{stage}` + `cut-point-candidate`
  태그가 붙는다 (절단신공 후보 자동, B의 솎기 재료).
- `disrupted` → **한 단계 후퇴** (이미 첫 단계면 그 단계 재시도). 단일 결정적 규칙.
- 보편 실패조건 (모든 음모 내장): 대상이 영구 퇴장 / 목표 불능 플래그 → aborted.
- `stall_after_chapters` 무진전 → if_exposed의 포기/수정 분기로 강제 전환 (교착 방지).

### 4.3 Planner 통합 (기존 planner-scorer 점수판에)

- **단계 전술 가산**: 활성 단계의 `tactics`에 든 op에 +W.schemeTactic. 타깃 편향:
  scheme.target 쪽으로. → 신뢰쌓기 단계의 세레나는 엘리시아에게 협조적 행동이
  점수가 높고(겉보기 선의), 배신 단계가 되면 confront가 폭등(회수).
- **payoff 게이팅**: 최종 단계 도달 시에만 payoff op에 대형 가산 (조기 폭발 방지).
- **약점 공략**: 타인의 활성 단계 vulnerability를 "아는" 인물(foreknowledge 또는
  단서 입수)의 Planner에서 해당 `exploit_ops`에 가산.
- **기존 `event_disposition`은 scheme이 있으면 무시** (단계가 동적 성향이므로).
  scheme 없으면 기존 동작 유지 (하위호환).

### 4.4 들킴 메커니즘

- 음모성 행동(sabotage/take_physical + 은폐 전술)이 GM에서 목격(witness)되거나
  backfire → exposureGauge +1.
- `exposure_threshold` 도달 → `if_exposed.response` 실행:
  - 잠적: 한 단계 후퇴 + 은폐 전술셋으로 전환
  - 가속: 최종 단계로 점프 (어설픈 조기 회수 — 긴장 장치)
  - 포기: aborted
- vulnerability의 `fact`는 단계 활성 동안 세계에 "노출된 사실"로 등록 →
  단서 시스템과 연결.

### 4.5 회귀 인지 (foreknowledge)

`foreknowledge.knows_schemes_of: ["serena"]`면 시드 컴파일 시 해당 인물의
knownFacts에 적 음모의 구조(단계/약점)가 주입된다. 주인공이 "한 수 앞서는"
이유의 시스템적 근거. 적이 들켜서 가속하면 주인공의 "미리 앎"이 어긋나기
시작한다 — 회귀물의 긴장이 시스템에서 나온다.

## 5. 외부 검증 근거 (2026-06-07)

- **CK3 scheme 시스템**: phases/agents/secrecy(침식 스칼라)/discovery — 단계·공모자·
  들킴 게이지 구조 일치 확인.
- **QBN/storylet (Emily Short)**: prerequisite qualities = advance_when 패턴,
  menace stat = exposureGauge 패턴 일치.
- **작법론 (K.M. Weiland 등)**: setup/payoff 쌍 = leaves_clue→payoff, ticking clock = deadline.
- **zen(gemini-2.5-pro) 비평으로 추가**: stakes(판돈), vulnerability(약점),
  foreknowledge(회귀 인지), dramatic_irony/tension_flow(독자층·페이싱 태그),
  교착 방지(stall 타임아웃 + 보편 실패조건), 체크리스트 함정 방지(복합 조건).

## 6. 테스트 전략

1. 술어 평가기 단위테스트 (각 술어 + all/any/not 조합, 결정성 2회 동일).
2. 단계 전환 단위테스트 (advance/disrupt/stall/expose/보편실패 각 경로).
3. 시뮬 레벨: 세레나 3단계 음모 → 화를 거치며 행동 분포가 협조→은밀→confront로
   **변하는지** (phase-distinct behavior), byte-identical 재현.
4. 맞물림: 엘리시아 foreknowledge가 세레나 vulnerability를 공략 → disrupted →
   if_exposed 가속 발동 시나리오.
5. 회귀 안전: scheme 없는 시드에서 기존 스위트 전수 green (blast=0).

## 7. 비범위 (명시)

- 음모의 **발명**은 시뮬이 하지 않는다 (시드 생성 LLM의 몫).
- 자유 텍스트 조건 미지원 (술어 어휘만).
- 인물당 scheme 1개 (v1).
- B(outline 레일 절단 + 솎기 에이전트)는 별도 사이클.

## 8. 단계적 도입 (상세는 구현 계획에서)

- **S0**: 스키마(zod) + 술어 평가기 — 순수 모듈, 미호출 (blast=0)
- **S1**: SchemeState 런타임 + shadow 기록 (행동 불변, 전환만 관찰)
- **S2**: Planner 통합 flag-gated (plannerEnabled 패턴 재사용)
- **S3**: 테스트 시드에 음모 태깅 + 시뮬/렌더 A-B 검증

각 단계마다 기존 스위트 전수 green을 게이트로 한다 (Planner Phase 0-2에서 검증된 방법론).
