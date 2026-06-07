# Outline 역전 (B) 설계 — 줄거리를 쓰지 않고 발견한다

날짜: 2026-06-08
상태: 설계 합의됨 (브레인스토밍 완료)
선행: Scheme Layer (docs/superpowers/specs/2026-06-07-scheme-layer-design.md, ~b7e2e9e)

## 1. 목적과 배경

현재 구조는 순환이다: 시드의 `chapter_outlines`가 시뮬을 레일링하고
(getChapterFrame → directorPressure/beats/plotBeat), 그 시뮬의 로그에서 episode를
"선택"하므로 — 선택이 발견이 아니라 재확인이다. 사용자 6단계 vision의 마지막 빈 칸
③(outline 솎기 에이전트)을 채우고 방향을 역전한다:

```
지금:  시드(두꺼움: outline까지) → 시뮬이 outline을 "채움"
목표:  시드(얇음: 인물+세계+scheme+arcs+복선) → 시뮬 → 로그 → outline을 "발견"
```

A(scheme layer)가 전제 — scheme이 로그에 다화 아크(plant→payoff)를 만들어
솎을 재료가 생겼다.

## 2. 합의된 갈림길 결정

1. **솎기 = 하이브리드.** 화 경계·포함 사건은 결정적(같은 로그+같은 분량 → 같은 구성,
   재현/디버깅 가능), 제목·한줄소개 같은 "이름표"만 LLM (writer와 같은 창의 계층).
2. **시드가 모드를 결정.** `chapter_outlines`가 비어있거나 없는 시드 = 역전 모드.
   있으면 기존 동작 — 기존 시드/테스트 100% 불변 (blast=0 패턴).
3. **얇은 시드에 남는 것**: 인물 + 세계 + scheme + **arcs**(막 구조 훅) +
   **foreshadowing**(복선 심기/회수 스케줄 — 장편 안전망). 이들은 "줄거리"가 아니라
   "약속/훅"(rails-as-pressure)이다.
4. **분량은 입력, 경계는 발견.** "~24화 분량"은 주문(연재 형식 제약)으로 받고,
   어느 사건이 어느 화에 들어가고 어디서 끊는지는 로그에서 발견한다.

## 3. 핵심 정정 — "재사용"의 정확한 의미 (사용자 검증 질문에서 도출)

기존 파이프를 그대로 재사용하면 역전이 위장 무력화된다. 기존 파이프엔 매 챕터
**outline key_points를 그대로 사건으로 주입하는 beats 루프**(buildWorldEvent)가 있다.
합성 프레임이 keyPoints를 만들어 또 주입하면 "합성 outline이 주도하는 시뮬" =
역전의 재발명 실패.

따라서:
- **재사용하는 것**: 외압 메커니즘(directorPressure), 로깅, 선택/편집 파이프
  (episode-selector/editorial), agent-tick 시뮬.
- **절단하는 것**: beats 주입. 역전 모드에서 **사건의 유일한 원천 = agent-tick
  (Planner + scheme)**.

## 4. §1 프레임 합성기 (synthesizeChapterFrame — 결정적)

역전 모드에서 getChapterFrame을 대체하는 순수함수. "오늘의 무대 상황판" —
분위기·등장·맥락만 주고 사건 내용은 줄 수 없다.

```
입력: 얇은 시드 + brain + 시간단위 번호 + schemeStates(현재 단계들)
     + totalChapters(분량 입력)
출력: SynthesizedFrame { oneLiner, tensionLevel, characterIds, threadIds }
      ← keyPoints 필드가 타입에 존재하지 않음 (구조적 보증)
```

- **tensionLevel**(결정적 도출): 기본 5
  + 활성 scheme 단계 tension_flow (build_frustration: 단계 진행 따라 점증 +1~2,
    release_satisfaction(payoff 단계): 8+)
  + 복선 reveal 화 +1 + act 위치 보정(클라이맥스 근접). 1~10 클램프.
- **장면 목적**: 기존 act 케이던스(targetScenePurposeForChapter) 재사용
  + scheme 단계 매핑 (증거_심기류 활성 → information_discovery/secret_pressure 가중,
    payoff 단계 → advance_plot/secret_pressure).
- **characterIds**: scheme 관련자(주체/대상/공모자) 우선 + 기존 저활동 순환 재사용.
- **oneLiner**: 활성 scheme 단계 goal + arc 라벨 합성 — 맥락 설명이지 사건 지시가 아님.
- location: v1은 기존 resolveLocation 폴백. (scheme 단계별 무대 필드는 v2.)

## 5. §2 사건 경로 절단 (역전 모드의 world-runner 분기)

역전 모드 판별: `seed.chapter_outlines.length === 0`.
(확인됨: 스키마가 `z.array(...).default([])`라 빈 배열이 이미 유효 — 스키마 변경 불필요.)

역전 모드일 때:
1. **beats 주입 OFF** — buildWorldEvent 루프 스킵. 사건은 agent-tick에서만.
2. directorPressure: 합성 프레임 위에서 기존 로직 그대로 (외압은 정당 —
   환경이지 사건이 아님).
3. plotBeat 도출: **복선 reveal 화의 bias만 잔존** (시드에 남는 foreshadowing
   스케줄 = 약속 이행). 긴장도/secret_pressure 기반 confront 도출은 OFF —
   그 역할은 scheme이 한다.
4. **사건 밀도 게이트**: 역전 모드 검증 시 quality bar(targetEventsPerChapterMin)
   통과를 명시 확인. 미달 대비 역전 모드 한정 노브: characterActionsPerChapter 상향,
   scene당 사건 cap 1→2.

기존(outline 있는) 시드는 코드 경로가 한 줄도 안 바뀐다.

## 6. §3 솎기 에이전트 (derived outline)

입력: WorldModelRunResult(로그/사건/schemeTimeline) + 분량 M.

**1단계 — 절단 후보 채점 (결정적):**
- 🥇 scheme 단계 전환 직후 (timeline 기록 — 최고 가중)
- 🥈 긴장(장면 압력) 피크 직후
- 🥉 복선 reveal 직후

**2단계 — 경계 확정 (결정적):**
M개 화 경계를 후보 점수 + 화별 분량 균형으로 선택 (episode-selector 계열 로직 확장).
각 화의 포함 장면/사건 목록과 절단점(마지막 사건 = cliffhanger)이 전부 확정된다.
같은 로그 + 같은 M → 항상 같은 구성.

**3단계 — 이름표 (LLM):**
각 화에 제목 + 한줄소개(+선택: 다음화 훅 한줄). 입력은 그 화의 사건 요약만.
**사건을 바꾸거나 빼고 더할 권한 없음** — 골격은 2단계에서 잠김.

**산출물 DerivedOutline:**
```ts
{
  chapters: [{
    number, title /*LLM*/, oneLiner /*LLM*/,
    sourceSceneIds, sourceEventIds,
    endsOn /*절단 사건 id*/, tensionPeak,
  }],
  totalChapters: M,
}
```
이것이 기존 chapter_outlines의 자리를 차지한다 — *쓰여진* 것이 아니라 *발견된* 것.
writer 파이프(episode window)가 이를 소비한다.

**포함 작업 — schemeTimeline 이벤트 승격:** 음모 단계 전환을 정식 SimulationEvent로
emit (`scheme:{char}:{stage}` + `cut-point-candidate` 태그) — 솎기/편집 레이어가
정식 장부에서 읽는다. (A에서 v1 보정으로 미뤄둔 것.)

## 7. §4 단계적 도입

- **B0**: synthesizeChapterFrame 순수모듈 + 단위테스트 (미호출, blast=0)
- **B1**: world-runner 역전 분기 (outline 없는 시드에서만 활성) + beats OFF
  + 사건 밀도 게이트 검증. 기존 시드 전수 green 불변.
- **B2**: schemeTimeline 이벤트 승격 + 솎기 골격(결정적 1·2단계) + DerivedOutline 산출
- **B3**: LLM 이름표 + simulate-world에 derived-outline 출력 + 렌더 E2E (역전 시드)

각 단계 게이트: 전수 스위트 green (현재 1545) + 결정성(2회 동일).

## 8. 테스트 전략

1. 합성기: 결정성, keyPoints 부재(타입), tension 도출 경로별 (scheme 단계/복선/act).
2. 역전 분기: outline 있는 시드 byte-identical(blast=0), 역전 시드에서 beats 사건 0
   + agent-tick 사건만 존재, 사건 밀도 게이트.
3. 솎기: 경계가 scheme 전환과 정합(전환 직후 절단 우세), 분량 M 준수,
   같은 입력 → 같은 구성, 빈 로그/사건 희소 케이스.
4. 이벤트 승격: scheme 전환이 ledger 검증 통과하는 정식 이벤트로.
5. E2E: 역전 시드(test-romance-fantasy-scheme 변형, outline 제거)로
   시뮬→솎기→derived outline→렌더.

## 9. 비범위

- 안 2(시간 단위 완전 분리 — chapter 개념 제거)는 안 1 안정 후 별도.
- scheme 단계별 무대(location) 필드는 v2.
- LLM 이름표의 품질 루프(제목 QA)는 v2 — v1은 단순 생성.
- 기존 outline 모드의 제거/폐기는 하지 않는다 (공존).
