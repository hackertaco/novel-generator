# World Model Human Evaluation Samples

자동 QA는 source coverage, meta leak, 반복, scene seam, agency, novelness를 잡는다.
사람 평가는 자동 QA가 놓치기 쉬운 “읽히는 소설인가”를 별도로 본다.

## 현재 기준 샘플

- 300장 high-impact 3편: `web/output/simulate-world-300-highimpact-single-scene-gpt4o-3ep-final-clean2-20260517/episodes/`
- QA summary: `web/output/simulate-world-300-highimpact-single-scene-gpt4o-3ep-final-clean2-20260517/episode-qa-summary.json`
- 결과: pass 3/3, warn 0, fail 0, averageScore 0.9717.
- 용도: 300장 월드 로그에서 high-impact 단일 scene window를 실제 소설 episode로 뽑는 기준 샘플.

## 사람 평가 체크리스트

각 episode를 1~5점으로 평가한다.

1. 사건 밀도
   - 1점: 인물이 말만 반복하고 사건이 없다.
   - 3점: 로그의 행동은 보이지만 장면 압력이 약하다.
   - 5점: 각 행동이 다음 행동을 밀어내고 장면이 전진한다.

2. 인물 자율성
   - 1점: 인물이 writer 지시에 끌려다닌다.
   - 3점: 각자 행동은 있지만 목적 차이가 흐릿하다.
   - 5점: 각 인물이 자기 목적과 기억에 따라 다르게 반응한다.

3. 소설 문장감
   - 1점: 보고서/요약문 같다.
   - 3점: 소설 형태지만 표현이 평평하다.
   - 5점: 대사, 손동작, 침묵, 시선으로 장면이 살아 있다.

4. 치환 부작용
   - 1점: `움직임할`, 조사 오류, 어색한 은유가 눈에 띈다.
   - 3점: 작은 어색함은 있으나 독서를 크게 막지 않는다.
   - 5점: deterministic polish 흔적이 거의 없다.

5. 장기 소설 가능성
   - 1점: 이 방식으로 300편을 읽고 싶지 않다.
   - 3점: 구조는 가능하지만 writer 품질 개선이 더 필요하다.
   - 5점: 월드 로그에서 계속 뽑아 읽을 수 있겠다는 느낌이 든다.

## 합격선

- 자동 QA: pass 100%, warn/fail 0.
- 사람 평가: 평균 4.0 이상.
- 치환 부작용 항목은 4점 이상이어야 한다.
- 한 항목이라도 2점 이하가 나오면 해당 issue를 자동 QA 또는 surface polish 규칙으로 되돌려 잠근다.

## 2026-05-18 편집자 판독 결과

- 평가 문서: `docs/world-model-editorial-human-eval-20260518.md`
- 대상: 초반 high-impact 3편 + 후반 high-impact 3편.
- 자동 QA는 두 샘플 모두 pass 3/3, warn 0, fail 0이지만, 편집자 관점 평균은 3.53/5로 합격선 4.0에 미달한다.
- 치환 부작용 평균은 2.83/5로 합격선 4.0에 미달한다.
- 주요 문제: `잔 받침 소리은`, `말밑를`, `말끝가`, `다음 움직임을 움직임하기`, `얇은 의미`, `잔 받침 소리`, `다음 움직임` 반복.
- 판정: fail. 이 결과는 실제 사람 평가를 대체하지 않고, 다음 QA/renderer 보강의 입력으로 사용한다.
- 후속 조치: `NovelOutputQA`에 `surface_polish_artifact`를 추가했다. 기존 문제 6편은 새 QA에서 모두 `warn`으로 떨어지며 `surface_polish_artifact`와 `pseudo_scene_filler`가 잡힌다.
- 추가 후속 조치: `EpisodeWindowWriter` 후처리가 같은 잔재 표현을 다시 만들지 않도록 최종 정규화와 회귀 테스트를 추가했다.
- 비용 없는 기존 샘플 재후처리 결과: `web/output/surface-polish-regression-20260518/surface-polish-regression-report.json`. 표면/분위기 filler 잔재 패턴은 49건에서 0건으로 줄었고, `surface_polish_artifact`, `pseudo_scene_filler`, `abstract_telling_surface`는 모두 0건이 됐다. 다만 과거 selection artifact에는 `sourceStateDeltaIds`가 없어 `weak_source_state_delta_grounding`은 legacy warning으로 남는다. 최신 샘플 생성/재평가는 아직 필요하다.

## 다음 샘플 축적

- 후반부 250~300장 high-impact 3편.
- 중반부 120~170장 high-impact 3편.
- low-impact 연결 episode 3편.
- 3-scene window는 현재 scene seam risk가 높으므로 기본형이 아니라 별도 실험으로만 본다.
