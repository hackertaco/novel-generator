# World Model Novel Pipeline Completion Criteria

이 문서는 300편 장편 생성을 “월드 모델이 실제로 작동한다”고 볼 최소 기준이다.
핵심 구조는 `WorldModel -> Timeline Logs -> EpisodeSelector -> EditorialPlan -> EpisodeWindowWriter -> Novel QA`다.

## 완료 기준

1. WorldModel endurance
   - 100화 이상 시뮬레이션에서 `worldModelQuality.score >= 0.90`.
   - `relationshipDynamics >= 0.85`, `agencyDistribution >= 0.85`, `repetitionControl >= 0.85`.
   - 무원인 불일치 0건, 인과 모순 0건.
   - visible behavior와 utterance 반복 경고가 없어야 한다.

2. Timeline source integrity
   - 모든 scene은 source event/action log를 가져야 한다.
   - 각 action log는 actor, target, visible behavior, effect, follow-up pressure, relationship delta를 포함해야 한다.
   - 캐릭터별 기억은 다음 scene의 행동 선택에 영향을 줘야 한다.

3. Episode selection
   - “300화”는 월드 모델 내부 단위가 아니라 timeline에서 뽑은 episode window 수다.
   - `coveredActionLogRatio >= 0.95`.
   - 한 episode는 필요하면 여러 scene을 묶을 수 있어야 한다.
   - 선택 근거는 score, sourceSceneIds, sourceActionLogIds, editorialIntent로 추적 가능해야 한다.

4. Editorial planning
   - 각 scene은 `setup`, `escalation`, `inflection`, `fallout` 중 필요한 구간으로 나뉜다.
   - spotlight 로그는 길게, summary 로그는 짧게 처리된다.
   - “어디를 길게 쓸지”는 writer 감이 아니라 EditorialPlan의 weight와 section으로 결정된다.

5. Episode writer prompt budget
   - writer에는 원본 로그 전체 덤프가 아니라 compressed source bundle을 넣는다.
   - 모든 sourceActionLogId는 detail 또는 summary 중 하나로 프롬프트에 남아야 한다.
   - 3 scene / 24 action log 기준 writer prompt는 15,000자 미만이어야 한다.
   - hiddenGoal, roleMission 같은 내부 상태 값은 프롬프트에 직접 노출하지 않는다.

6. Novel output QA
   - 출력 본문에는 source id, action log, scene id 같은 메타어가 없어야 한다.
   - 새 사건, 새 단서, 새 비밀, 새 능력, 새 인과를 writer가 임의 추가하지 않아야 한다.
   - 각 episode 끝은 설명이 아니라 다음 행동 압력으로 닫혀야 한다.
   - 장기 떡밥은 90% 이상 회수되고 최대 80화 이내에 회수 후보 상태가 갱신되어야 한다.

## 현재 증거

- 100화 endurance smoke: `web/output/world-model-quality-100ch-stronger-20260517/endurance-report.json`
- 월드 품질: score 0.94, relationshipDynamics 0.934, agencyDistribution 0.872, repetitionControl 0.917.
- 에피소드 선택 smoke: `web/output/episode-window-grouping-smoke-20260517/episode-selection.json`
- 압축 writer prompt smoke: `web/output/episode-window-writer-compressed-smoke-20260517/episode-001.prompt-report.json`
- 3 scene / 24 action log prompt: 22,017자에서 13,921자로 감소.
- 1편 실제 episode writer smoke: `web/output/simulate-world-episode-llm-smoke-20260517/episode-qa-summary.json`
- 1편 QA: score 0.969, pass 1/1, issues 0, cost $0.0623.
- 30편 cost-controlled dry-run: `web/output/simulate-world-30ep-dryrun-20260517/episode-qa-summary.json`
- 30편 QA: pass 28/30, warn 2/30, fail 0/30, averageScore 0.9757, warning은 `low_novelness` 2건.
- 300 episode selection-only: `web/output/simulate-world-300-selection-20260517/selection-only-report.json`
- 300 selection: selectedEpisodeCount 300/300, sourceSceneCount 300, light chronology validation pass, issueCount 0.
- 주의: 300 selection-only는 장기 window 스케일 검증이며 캐릭터 tick/action log 밀도 검증은 30편 dense run을 기준으로 본다.
- 장르소설 표면 개선 smoke: `web/output/simulate-world-genre-qa-polish-8-9-20260517/episode-qa-summary.json`
- 8~9화 재생성 QA: pass 2/2, warn 0, fail 0, averageScore 0.9735. 기존 `low_novelness` warning 구간이 통과로 바뀌었다.
- 300화 dense selection-only: `web/output/simulate-world-300-dense-selection-20260517/selection-only-report.json`
- 300 dense 결과: selectedEpisodeCount 300/300, sourceSceneCount 300, sourceActionLogCount 2400, interactionResolutionCount 2400, validation pass, runtime 약 3.5초.
- 300 dense는 `selection-only`에서 fast event append와 light chronology validation을 사용한다. 전체 canonical state projection 검증은 30편 dense/full validation 또는 별도 targeted run으로 본다.
- 10편 repair-loop stress: `web/output/simulate-world-repair-loop-10ep-polished-context-20260517/episode-qa-summary.json`
- repair-loop 결과: threshold 0.98 기준 pass 10/10, warn 0, fail 0, averageScore 0.9807, minScore 0.964, maxScore 1.000, episodeTotalCostUsd 약 $0.0177.
- repair-loop 선택 안정성: repair 대상 4편 중 2편은 점수 개선, 2편은 두 번째 draft가 더 낮았지만 best-attempt 선택으로 낮은 repair가 최종본을 덮어쓰지 않았다. 최종 선택은 10/10편 모두 최고 점수 attempt다.
- 300장 high-impact episode writer sample: `web/output/simulate-world-300-highimpact-single-scene-gpt4o-3ep-normalized-20260517/episode-qa-summary.json`
- 300장 로그 기반 gpt-4o 3편 샘플: pass 2/3, warn 1/3, fail 0, averageScore 0.968, episodeTotalCostUsd 약 $0.0868. 월드 로그/검증은 통과했고 sourceCoverage는 3/3 모두 1.0이다.
- 3-scene window 샘플은 scene seam warning이 반복되어 장편 기본 단위로 부적합했다. 현재 방향은 `1 episode window = 1 high-impact scene`이 더 안정적이다.
- writer density fix sample: `web/output/simulate-world-300-highimpact-single-scene-gpt4o-3ep-final-clean2-20260517/episode-qa-summary.json`
- 300장 로그 기반 gpt-4o 3편 재검증: pass 3/3, warn 0, fail 0, averageScore 0.9717, minScore 0.960, maxScore 0.984, episodeTotalCostUsd 약 $0.0730. sourceCoverage 3/3 모두 1.0, meta leak 0, scene seam 0.
- pass-only CLI 기준에서는 warning이 남으면 실패 처리한다. 현재 high-impact 단일 scene 3편 샘플은 이 기준을 통과한다.
- fast/full world runner regression: `web/__tests__/lib/sim/world-runner-fast-path.test.ts`
- 회귀 테스트 결과: `npm run test -- __tests__/lib/sim/world-runner-fast-path.test.ts __tests__/lib/rendering/episode-window-writer.test.ts __tests__/lib/rendering/novel-output-qa.test.ts` 통과. fast event append + light validation 경로가 full canonical projection 경로와 event id, scene id, action log id, interaction resolution id, visible behavior, follow-up seed, episode window source coverage에서 같은 결과를 내는지 잠갔다.
- 후반부 250~300장 high-impact episode writer sample: `web/output/simulate-world-late-highimpact-single-scene-gpt4o-3ep-final-20260517/episode-qa-summary.json`
- 후반부 로그 기반 gpt-4o 3편 재검증: pass 3/3, warn 0, fail 0, averageScore 0.9623, minScore 0.954, maxScore 0.972, episodeTotalCostUsd 약 $0.0538. sourceCoverage 3/3 모두 1.0, meta leak 0, scene seam 0.
- 사람 평가 체크리스트: `docs/world-model-human-eval-samples.md`
- 사람 평가는 자동 QA가 놓치는 문장감, 사건 밀도, 인물 자율성, deterministic polish 부작용을 1~5점으로 본다. 현재 합격선은 자동 QA pass 100%, 사람 평가 평균 4.0 이상, 치환 부작용 4점 이상이다.
- 300화 dense endurance: `web/output/world-endurance-300-20260518-thread-carryover/endurance-report.json`
- 300화 endurance 결과: verdict pass, averageScore 1.00, eventCount 3016, actionLogCount 2400, blocking/warning 0. `followUpResolvedRate=1`, `concreteStateDeltaRate=1`, `foreshadowScheduleCoverage=1`.
- renderer 반복 경고 수정 후 10 episode audit: `web/output/simulate-world-10ep-renderer-audit-20260518-agentbrain/episode-renderer-qa-human-proxy.json`
- 10 episode renderer QA 결과: pass 10/10, warn 0, fail 0, averageQaScore 0.9878. proxy human score 평균 4.84는 자동 대리 지표일 뿐 실제 사람 평가로 간주하지 않는다.
- Agent Brain snapshot 산출물: `web/output/simulate-world-10ep-renderer-audit-20260518-agentbrain/action-logs.json`
- 30화 audit의 240개 action log 전부가 `privateState.agentBrain.beliefStore`, `memoryStore`, `intentionStack`, `reflection` 스냅샷을 포함한다.
- Agent Brain persistent runtime store 산출물: `web/output/simulate-world-10ep-renderer-audit-20260518-agentbrain-store/runtime-mind-states.json`
- 30화 audit의 5개 runtime mind state 전부가 `agentBrainState`를 포함한다. 각 store는 `episodicMemory`, `semanticMemory`, `proceduralMemory`, `intentionStack`, `reflection.actionFatigueByType`를 checkpoint 가능한 상태로 유지한다.
- Agent Brain store QA 산출물: `web/output/simulate-world-10ep-renderer-audit-20260518-agentbrain-store/episode-renderer-qa-human-proxy.json`
- Agent Brain store 적용 후 10 episode renderer QA: pass 10/10, warn 0, fail 0, averageQaScore 0.9878.
- Mid-range high/low impact sample comparison: `web/output/simulate-world-mid-120-170-sample-comparison-20260518-v2.json`
- 중반부 120~170화 high-impact renderer 샘플: `web/output/simulate-world-mid-120-170-highimpact-renderer-20260518-v2/episode-renderer-qa-human-proxy.json`
- high-impact 결과: selectedChapters 129/145/147, averageSelectionScore 0.93, QA pass 3/3, warn 0, fail 0, averageQaScore 0.9797.
- 중반부 120~170화 low-impact connector renderer 샘플: `web/output/simulate-world-mid-120-170-lowimpact-renderer-20260518-v2/episode-renderer-qa-human-proxy.json`
- low-impact 결과: selectedChapters 125/132/136, averageSelectionScore 0.81, QA pass 3/3, warn 0, fail 0, averageQaScore 0.9853.
- `lowest_impact` selector mode를 추가해 high-impact 장면만 뽑는 편향을 별도로 검증할 수 있게 했다.
- Agent Brain goal hierarchy audit: `web/output/world-log-goal-hierarchy-audit-20260518/action-logs.json`
- 1~8화 goal hierarchy audit 결과: action log 64개, `missingGoalSnapshots=0`, `unlinkedGoalSnapshots=0`, `genericBeliefRate=0`, `uniqueBeliefRate=1.0`. 모든 action snapshot은 `long/arc/scene` 목표 계층을 갖고 현재 `activeIntentionId`와 연결된다.
- Runtime goal store audit: `web/output/world-log-goal-hierarchy-audit-20260518/runtime-mind-states.json`
- 5개 runtime mind state 모두 `activeGoalId`와 `goalHierarchy`를 유지한다. 각 캐릭터 store에는 `long`, `arc`, `scene` horizon이 함께 존재하고, goal status는 `active`, `pressured`, `blocked`, `satisfied`, `abandoned`로 실제 행동 결과에 따라 갈라진다.
- 300화 goal hierarchy audit: `web/output/world-log-goal-hierarchy-300-audit-20260518-v2/goal-hierarchy-audit-summary.json`
- 300화 goal hierarchy 결과: generatedEventCount 3016, actionLogCount 2400, interactionResolutionCount 2400, sceneLogCount 300, validation pass issue 0. `missingGoalSnapshots=0`, `unlinkedGoalSnapshots=0`, `genericBeliefRate=0`, `uniqueBeliefRate=0.6746`, `minGoalCount=4`, `maxGoalCount=12`.
- 300화 durable goal 상태 전파: `long:active=561`, `long:pressured=1839`, `arc:active=20`, `arc:abandoned=802`, `arc:blocked=706`, `arc:satisfied=960`, `arc:pressured=2312`. 즉 장기/중기 goal이 active로만 고정되지 않고 행동 결과에 따라 압박/차단/만족/포기 상태로 이동한다.
- 편집자 관점 사람 평가 대체 판독: `docs/world-model-editorial-human-eval-20260518.md`
- 초반 high-impact 3편 + 후반 high-impact 3편 판독 결과: 자동 QA는 pass였지만 편집자 관점 평균 3.53/5, 치환 부작용 2.83/5로 fail. 이 결과는 실제 사람 평가를 대체하지 않고 QA/renderer 보강 입력으로만 사용한다.
- `NovelOutputQA` surface polish 보강: `web/src/lib/rendering/novel-output-qa.ts`, `web/__tests__/lib/rendering/novel-output-qa.test.ts`
- 새 `surface_polish_artifact` issue는 `소리은`, `말밑를`, `말끝가`, `움직임을 움직`, `움직임하기`, `잔 받침 소리`, `얇은 의미`, `다음 움직임`을 잡는다. 기존 문제 6편은 새 QA에서 모두 `warn`으로 떨어진다.
- `EpisodeWindowWriter` surface polish source fix: `web/src/lib/rendering/episode-window-writer.ts`, `web/src/lib/rendering/episode-prompt-compressor.ts`, `web/__tests__/lib/rendering/episode-window-writer.test.ts`
- writer 후처리가 `다음 움직임`, `잔 받침 소리`, `얇은 의미`, `말밑를`, `말끝가`, `움직임을 움직...` 같은 deterministic polish 잔재를 다시 만들지 않도록 최종 정규화와 회귀 테스트를 추가했다. 3 scene / multi-action prompt도 15,000자 미만 게이트를 유지하도록 compressed source bundle을 더 압축했다.
- Surface polish regression artifact: `web/output/surface-polish-regression-20260518/surface-polish-regression-report.json`
- 기존 문제 LLM 샘플 6편을 새 후처리에 재통과시킨 결과, deterministic polish + 분위기 filler 잔재 패턴은 49건에서 0건으로 줄었다. `episode-qa-summary.json` 기준 `surfacePolishArtifactCount=0`, `pseudoSceneFillerCount=0`, `abstractTellingSurfaceCount=0`, `weakStateDeltaGroundingCount=6`이다. `weakStateDeltaGrounding`은 과거 selection artifact에 `sourceStateDeltaIds`가 없는 legacy warning이다.
- 최신 검증 명령:
  - `cd web && npm run test -- __tests__/lib/sim/world-model-quality.test.ts __tests__/lib/sim/world-model-endurance.test.ts __tests__/lib/sim/character-action-sim.test.ts`
  - `cd web && npm run test -- --testTimeout=20000 __tests__/lib/rendering/episode-selector.test.ts __tests__/lib/rendering/scene-log-renderer.test.ts __tests__/lib/rendering/episode-window-writer.test.ts __tests__/lib/rendering/novel-output-qa.test.ts`
  - `cd web && npm run build`

## 남은 순서

1. 사람 평가 샘플을 실제로 읽고 점수화한다. 자동 QA 점수와 사람이 느끼는 소설감을 분리해서 본다.
2. deterministic surface polish 규칙이 늘어나고 있으므로, 장기적으로는 치환 규칙을 줄이고 writer prompt/QA rubric 쪽으로 옮긴다. 현재 확인된 치명적 잔재 패턴은 writer 후처리와 QA 회귀 테스트로 잠갔다.
3. 10편 이상 gpt-4o 실제 생성 run으로 cost, 반복, 문체 평탄화가 누적되는지 확인한다.
4. 최신 `sourceStateDeltaIds` 포함 episode selection으로 새 LLM writer 샘플을 생성해 legacy warning 없이 QA pass가 가능한지 확인한다.
