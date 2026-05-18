# World Model Editorial Human Eval - 2026-05-18

이 문서는 실제 독자 평가가 아니라, 자동 QA와 분리한 편집자 관점 수동 판독 결과다.
합격선은 `docs/world-model-human-eval-samples.md`의 기준을 따른다.

## 평가 대상

- 초반 high-impact 3편: `web/output/simulate-world-300-highimpact-single-scene-gpt4o-3ep-final-clean2-20260517/episodes/`
- 후반 high-impact 3편: `web/output/simulate-world-late-highimpact-single-scene-gpt4o-3ep-final-20260517/episodes/`
- 자동 QA:
  - 초반 3편: pass 3/3, warn 0, fail 0, averageScore 0.9717
  - 후반 3편: pass 3/3, warn 0, fail 0, averageScore 0.9623

## 결론

자동 QA는 통과했지만 편집자 관점 합격선에는 아직 미달이다.
월드 로그의 사건/인물 자율성은 확인되지만, 소설 문장감과 deterministic polish 부작용이 독서를 방해한다.

평균 점수: 3.53 / 5
치환 부작용 평균: 2.83 / 5
판정: fail

## 항목별 점수

| 항목 | 점수 | 근거 |
| --- | ---: | --- |
| 사건 밀도 | 4.0 | 각 장면에 5명 내외의 행동과 반응이 있고, 질문/회피/접근/철회가 다음 압력을 만든다. 다만 실제 사건보다 시선/침묵 중심으로 반복되는 구간이 있다. |
| 인물 자율성 | 4.0 | 엘리시아, 라엘, 세레나, 카이젠, 마리안이 각자 다른 목적과 반응을 보인다. 자동 QA의 characterAgency도 대체로 0.92 이상이다. |
| 소설 문장감 | 3.3 | 대사와 손동작은 있으나 `공기가 무겁게 가라앉았다`, `다음 움직임`, `얇은 의미` 같은 안전한 표현이 반복된다. |
| 치환 부작용 | 2.8 | `잔 받침 소리은`, `말밑를`, `말끝가`, `다음 움직임을 움직임하기` 같은 조사/치환 오류가 실제 본문에 남아 있다. |
| 장기 소설 가능성 | 3.5 | 월드 로그를 소스로 삼는 방향은 유효하지만, 이 문장 품질 그대로 300편을 읽기는 어렵다. 표현 QA/renderer polish가 더 필요하다. |

## 샘플별 메모

### 초반 high-impact episode 001

- 장점: 사건 흐름은 비교적 명확하다. 카이젠 관찰, 엘리시아 반응, 라엘 통제, 세레나 가면, 마리안 개입이 한 장면 안에 들어온다.
- 약점: 문단마다 시선/침묵/공기 묘사가 비슷하게 반복된다.
- 점수: 3.8

### 초반 high-impact episode 002

- 장점: 라엘, 세레나, 마리안, 카이젠의 장면 압력이 순서대로 들어온다.
- 약점: `잔 받침 소리은`, `말밑를` 같은 문법 오류가 독서를 직접 깨뜨린다.
- 점수: 3.3

### 초반 high-impact episode 003

- 장점: 엘리시아의 주도 선언이 있어 장면 목적은 보인다.
- 약점: `말끝가`, `잔 받침 소리`, `다음 움직임` 반복이 강하다. 결말부도 일반적인 압력 문장으로 닫힌다.
- 점수: 3.2

### 후반 high-impact episode 001

- 장점: 질문/반문/침묵 구조는 명확하다.
- 약점: `다음 움직임을 움직임하기`가 치명적이다. 후반부인데도 초반과 문장 패턴 차이가 크지 않다.
- 점수: 3.4

### 후반 high-impact episode 002

- 장점: 가장 안정적이다. 명백한 조사 오류는 적고, 인물 배치도 읽힌다.
- 약점: 마지막 문단이 추상 설명으로 느슨해진다.
- 점수: 3.8

### 후반 high-impact episode 003

- 장점: 세레나, 카이젠, 라엘의 상호 견제가 보인다.
- 약점: `다음 움직임` 4회, `잔 받침 소리` 2회, `얇은 의미` 반복. 문체가 자동 생성 티를 낸다.
- 점수: 3.3

## 표면 오류 패턴 집계

대상 6편에서 확인한 주요 패턴:

- `소리은`: 2회
- `말밑를`: 1회
- `말끝가`: 1회
- `움직임을 움직임`: 1회
- `움직임하기`: 1회
- `얇은 의미`: 3회
- `잔 받침 소리`: 7회
- `다음 움직임`: 9회

## 다음 수정 요구

1. `NovelOutputQA` 또는 renderer QA에 조사 오류 패턴을 hard fail/warn으로 추가한다. - 반영됨.
2. `잔 받침 소리`, `얇은 의미`, `다음 움직임` 같은 추상/치환 잔재 표현을 반복 패턴으로 잡는다. - 반영됨.
3. deterministic surface polish는 무작정 치환하지 말고, 불가능한 결합을 삭제하거나 구체 행동으로 바꿔야 한다. - 반영됨.
4. 수정 후 같은 6편 또는 새 6편을 다시 생성/평가해 평균 4.0, 치환 부작용 4.0 이상을 확인한다. - 미반영.

## 2026-05-18 QA 보강 확인

`NovelOutputQA`에 `surface_polish_artifact` issue를 추가했다.
기존 6개 문제 샘플을 새 QA로 재평가한 결과, 모두 `pass`가 아니라 `warn`으로 떨어졌다.

초반 high-impact 3편:

- episode 001: score 0.861, verdict warn, issues `weak_source_state_delta_grounding`, `pseudo_scene_filler`, `surface_polish_artifact`
- episode 002: score 0.856, verdict warn, issues `weak_source_state_delta_grounding`, `pseudo_scene_filler`, `surface_polish_artifact`
- episode 003: score 0.840, verdict warn, issues `weak_source_state_delta_grounding`, `low_novelness`, `pseudo_scene_filler`, `surface_polish_artifact`

후반 high-impact 3편:

- episode 001: score 0.834, verdict warn, issues `weak_source_state_delta_grounding`, `low_novelness`, `pseudo_scene_filler`, `surface_polish_artifact`
- episode 002: score 0.828, verdict warn, issues `weak_source_state_delta_grounding`, `low_novelness`, `pseudo_scene_filler`, `surface_polish_artifact`
- episode 003: score 0.817, verdict warn, issues `weak_source_state_delta_grounding`, `low_novelness`, `pseudo_scene_filler`, `surface_polish_artifact`

주의: `weak_source_state_delta_grounding`은 과거 산출물의 episode selection JSON에 `sourceStateDeltaIds`가 없는 legacy artifact 성격이다.
새 산출물에서는 state delta가 포함되므로, 이 평가의 핵심 증거는 `surface_polish_artifact`와 `pseudo_scene_filler`다.

## 2026-05-18 Writer 후처리 보강 확인

`EpisodeWindowWriter` 후처리에서 deterministic polish 잔재를 다시 생성하던 치환을 제거했다.

- `다음 행동 -> 다음 움직임` 치환을 제거하고 구체 행동/다음 말로 바꿨다.
- `긴장감/압박 -> 잔 받침 소리` 치환을 제거했다.
- `진의/숨은 -> 말밑...` 치환을 제거했다.
- `결단/결심/결정 -> 움직임` 치환을 제거했다.
- 최종 정규화에서 `잔 받침 소리`, `다음 움직임`, `얇은 의미`, `말밑를`, `말끝가`, `움직임을 움직...`, `움직임하기`, `소리은`을 제거한다.

검증:

- `cd web && npm run test -- __tests__/lib/rendering/episode-window-writer.test.ts __tests__/lib/rendering/novel-output-qa.test.ts` 통과.
- `cd web && npm run test -- --testTimeout=20000 __tests__/lib/rendering/episode-selector.test.ts __tests__/lib/rendering/scene-log-renderer.test.ts __tests__/lib/rendering/episode-window-writer.test.ts __tests__/lib/rendering/novel-output-qa.test.ts` 통과.
- `cd web && npm run build` 통과. 기존 `workflow.ts` dynamic path warning은 남아 있으나 이번 renderer 변경과 별개다.

## 2026-05-18 기존 문제 샘플 재후처리 결과

새 LLM 호출 없이 기존 문제 샘플 6편을 현재 `polishGenreSurface`에 다시 통과시켰다.

- 산출물: `web/output/surface-polish-regression-20260518/surface-polish-regression-report.json`
- QA 요약: `web/output/surface-polish-regression-20260518/episode-qa-summary.json`
- 대상: 초반 high-impact 3편 + 후반 high-impact 3편.
- 표면/분위기 filler 잔재 패턴: 49건 -> 0건.
- `surface_polish_artifact`: 6편 중 0건.
- `pseudo_scene_filler`: 0건.
- `abstract_telling_surface`: 0건.
- QA verdict: warn 6/6, fail 0/6, averageScore 0.870.

남은 문제:

- `weak_source_state_delta_grounding` 6/6은 과거 episode selection artifact에 `sourceStateDeltaIds`가 없는 legacy 조건 때문이다.
- 다음 작업은 legacy artifact가 아니라 최신 episode selection/sourceStateDeltaIds를 가진 새 writer 샘플에서 같은 QA를 다시 통과시키는 것이다.
