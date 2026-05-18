# World Model Simulation Upgrade Plan

## Goal

현재 월드 모델을 "소설용 로그 생성기"에서 "장기 연재를 버틸 수 있는 시뮬레이션 공간"으로 올린다.

핵심 성공 기준은 다음이다.

1. 인물은 각자 belief/desire/intention/plan/memory를 가지고 행동한다.
2. 행동은 world state를 실제로 바꾼다.
3. 다음 tick은 이전 tick의 추상 follow-up이 아니라 구체 state delta를 해소한다.
4. 사건은 작가가 매번 만들어 넣는 것이 아니라 인물, 장소, 정보, 제약, 비용의 충돌에서 발생한다.
5. Renderer는 월드 로그를 소설로 번역할 뿐, 새 인과를 만들지 않는다.

## Requirement Coverage Checklist

이 문서는 다음 질문에 답하기 위해 작성됐다.

- 월드 로그가 논리적인가: 현재 로그의 반복률, follow-up 미해소, scene outcome 중복을 수치로 판정한다.
- 정말 월드 모델로 작동하는가: objective world state, agent belief, plan lifecycle, action precondition/effect가 있는지로 판정한다.
- 소설 쓰기 방법에서 무엇을 가져올 것인가: narrative planning, drama management, MEXICA식 reflection으로 인과/긴장/회수 기준을 가져온다.
- 뇌 구조에서 무엇을 가져올 것인가: CoALA와 generative agents에서 memory, reflection, retrieval, decision loop를 가져온다.
- 시뮬레이션 방법에서 무엇을 가져올 것인가: Concordia식 world/game master, BDI agent, operator/precondition/effect 구조를 가져온다.
- 300화 장편 기준으로 무엇을 고칠 것인가: Phase 0~6으로 실패 고정, state delta, agent brain, world GM, director, selector/renderer를 순서대로 만든다.

## Current Diagnosis

현재 구현은 구조적으로는 월드 로그가 돈다.

- 최신 후반부 run 기준 51 scene, 408 action log, 408 interaction resolution이 생성됐다.
- 모든 action log에 target reaction, follow-up, memory update, belief update가 붙는다.
- runtime mind state도 갱신된다.

하지만 "진짜 월드가 굴러간다"고 보기엔 약하다.

- `targetReaction` unique 7개 / 408개.
- `followUpActionSeed` unique 7개 / 408개.
- `sceneOutcome` unique 4개 / 51개.
- 다음 로그는 이전 `visibleBehavior`를 100% 관찰하지만, 이전 `followUpActionSeed`를 구체 행동으로 해소하지 않는다.
- actor/action chain도 51개 장면 중 unique typed chain이 6개뿐이다.

핵심 원인은 [character-action-sim.ts](/Users/seungahjung/Documents/opensource/kakao-novel-generator/web/src/lib/sim/character-action-sim.ts:1239)에서 반응과 후속 압력이 템플릿으로 생성되고, [world-runner.ts](/Users/seungahjung/Documents/opensource/kakao-novel-generator/web/src/lib/sim/world-runner.ts:1399)에서 마지막 `leadsTo`가 scene outcome으로 그대로 올라가기 때문이다.

## Research Synthesis

### Generative agents

Generative Agents는 believable behavior를 위해 observation, planning, reflection을 분리한다. 에이전트는 경험을 memory stream에 저장하고, 고수준 reflection을 만들고, 기억을 동적으로 검색해 행동을 계획한다.

적용점:

- 지금 `runtimeMindStates`는 append에 가깝다. reflection과 retrieval scoring이 필요하다.
- action 선택 전에 "최근 관찰 + 장기 기억 + 현재 계획 + 장소 affordance"를 검색해야 한다.
- 매 chapter/tick마다 기억을 모두 넣지 말고, relevance/recency/importance로 골라야 한다.

Source: https://arxiv.org/abs/2304.03442

### Cognitive architecture for language agents

CoALA는 language agent를 memory modules, structured action space, decision-making process로 본다. 이 관점은 "프롬프트가 뇌"가 아니라, memory/action/decision loop가 뇌 구조라는 점을 분명히 한다.

적용점:

- `Agent Brain`은 working/episodic/semantic/procedural memory를 분리해야 한다.
- action은 external action만이 아니라 internal cognitive action도 포함해야 한다. 예: remember, reflect, infer, replan, suppress.
- decision loop는 `perceive -> retrieve -> deliberate -> act -> observe result -> learn` 순서로 고정해야 한다.

Source: https://arxiv.org/abs/2309.02427

### Concordia-style grounded simulation

Concordia는 agent action attempt를 world/game master가 물리/사회/디지털 공간에서 가능한지 확인하고 효과를 설명한다.

적용점:

- 현재 action은 선택되면 거의 그대로 성공한다.
- `WorldGameMaster`가 필요하다. 이 모듈은 "이 장소에서 이 인물이 이 행동을 할 수 있는가", "누가 봤는가", "어떤 object/access/fact가 바뀌었는가"를 판정해야 한다.
- `actualEffect`는 템플릿 문장이 아니라 `stateDelta[]`에서 생성되어야 한다.

Source: https://arxiv.org/abs/2312.03664

### Narrative planning and IPOCL

Narrative planning의 핵심은 plot이 causally sound해야 하고, character action은 character goal/intention으로 설명 가능해야 한다는 점이다. IPOCL은 사건 진행과 인물 의도를 함께 다룬다.

적용점:

- 현재 action은 role별 선호 action type으로 고른다. "왜 이 행동을 지금 해야 하는가"의 causal link가 약하다.
- action log에는 `intentionId`, `goalId`, `preconditionIds`, `expectedEffectIds`, `actualEffectIds`가 필요하다.
- 사건 선택은 "멋있는 장면"보다 causal chain completeness를 먼저 봐야 한다.

Source: https://arxiv.org/abs/1401.3841

### BDI narrative agents

BDI는 plot을 character motivation으로 모델링하기 좋다. belief, desire, intention을 분리하면 작가가 plot을 강제로 밀지 않아도 캐릭터가 자기 목적을 추구한다.

적용점:

- 현재 `privateState`는 BDI처럼 보이지만 action operator와 연결이 약하다.
- belief가 바뀌면 available plan/intention이 바뀌어야 한다.
- intention은 한 tick짜리가 아니라 지속 상태여야 한다. 실패하면 abandon/replan해야 한다.

Source: https://ojs.aaai.org/index.php/AIIDE/article/view/12627

### Intention management

좋은 캐릭터 시뮬레이션은 인물이 계획을 세우고, 계획이 막히면 sub-plan을 버리거나 새 sub-plan을 채택한다.

적용점:

- 현재 plan은 `반응할 이유가 생긴다` 같은 결과 문장으로 오염된다.
- `PlanStack`이 필요하다. 각 plan은 status `active | blocked | abandoned | completed`를 가진다.
- 장면은 "누가 누구에게 반응한다"가 아니라 "어떤 plan이 막혔고, 누가 비용을 내고 우회했는가"를 기록해야 한다.

Source: https://ojs.aaai.org/index.php/AIIDE/article/view/12986

### Drama management

Drama manager는 omniscient background agent로 story space를 조정하되 player/character agency를 제거하지 않는 방식으로 작동한다.

적용점:

- 완전 방임형 시뮬레이션은 장편 구조를 잃고, 완전 top-down은 인물 자율성을 잃는다.
- `NarrativeDirector`는 action을 직접 쓰지 않고 pressure, constraints, opportunity를 world에 주입해야 한다.
- 예: "황실 감사가 내일 시작된다"는 environment event로 넣고, 각 agent가 각자 대응한다.

Source: https://ojs.aaai.org/index.php/AIIDE/article/view/12665

### Voyager-style curriculum, skill library, self-verification

Voyager는 automatic curriculum, skill library, environment feedback, self-verification으로 장기 탐험을 유지한다.

적용점:

- 장기 300화에서는 agent가 매번 같은 probe/deflect만 하면 안 된다.
- 성공한 행동 패턴은 `SkillLibrary`에 저장하고, 실패한 패턴은 재사용 비용을 높인다.
- 자동 curriculum은 "이번 20 tick에서 새로 확인할 세계 기능/관계 기능"을 정한다.

Source: https://arxiv.org/abs/2305.16291

### MEXICA engagement/reflection

MEXICA는 writing을 engagement와 reflection으로 나누고, reflection에서 novelty, interestingness, coherence를 평가한다.

적용점:

- 월드 시뮬레이션도 tick 생성 후 reflection pass가 필요하다.
- reflection은 "재미있는가"가 아니라 tension cluster가 변했는지 본다.
- 관계, 감정, 위험, 정보 비대칭이 변하지 않은 tick은 소설 episode 후보에서 제외해야 한다.

Source: https://www.researchgate.net/publication/220080099_MEXICA_A_computer_model_of_a_cognitive_account_of_creative_writing

## Target Architecture

### 1. World Kernel

세계의 객관 상태를 관리한다.

Required stores:

- `ObjectState`: 물건, 문서, 반지, 독약, 편지, 열쇠, 증거.
- `LocationState`: 위치, 출입권, 현재 참석자, 감시자, 사회적 규칙.
- `FactStore`: 객관 사실, 공개 사실, 비공개 사실, 소문.
- `EventLedger`: 모든 state delta의 원인/결과.
- `AffordanceIndex`: 이 장소/물건/인물 조합에서 가능한 action.

Acceptance criteria:

- 모든 action은 최소 하나의 concrete state delta를 만든다.
- state delta 없는 action은 `observe`로만 허용되고 episode 후보 점수에서 감점된다.
- `sceneOutcome`은 text가 아니라 `stateDeltaIds[]`에서 생성된다.

### 2. Agent Brain

각 인물의 뇌 구조를 분리한다.

Required components:

- `BeliefStore`: 사실에 대한 주관적 믿음, confidence, source memory.
- `DesireStore`: 장기 욕망, 단기 욕구, 금기.
- `IntentionStack`: 현재 실행 중인 plan과 commitment.
- `EpisodicMemory`: 경험 로그.
- `SemanticMemory`: 세계/인물에 대한 일반화된 지식.
- `ProceduralMemory`: 반복 성공한 행동 방식.
- `Reflection`: 새 기억을 요약하고 plan을 수정하는 pass.

Acceptance criteria:

- action decision은 retrieved memory ids와 active intention id를 참조한다.
- belief update가 다음 3 tick 안에 action choice를 바꾸는지 테스트한다.
- 같은 인물이 같은 target에게 같은 action type을 반복하면 plan fatigue가 쌓인다.

### 3. Action Operators

현재 action type은 너무 추상적이다. action은 precondition/effect/cost를 가져야 한다.

Example:

```ts
type ActionOperator = {
  id: string;
  category: "social" | "physical" | "information" | "magic" | "political";
  preconditions: WorldPredicate[];
  actorRequirements: AgentPredicate[];
  consumes?: ResourceDelta[];
  effects: StateDeltaTemplate[];
  risks: RiskTemplate[];
  visibleSurface: SurfaceTemplate[];
};
```

Required operator categories:

- Social: 압박, 회유, 공개 망신, 동맹 요청, 협박.
- Information: 엿듣기, 문서 확인, 거짓 정보 흘리기, 질문 회피.
- Physical: 이동, 물건 숨기기, 문 잠그기, 약 건네기.
- Political: 명령, 초대, 약혼 발표, 감시 배치.
- Magic: 감지, 봉인, 회귀 흔적 확인, 기억 교란.

Acceptance criteria:

- `probe_dialogue` 같은 generic action 비율이 30% 미만.
- physical/information/political/magic action이 전체 tick의 40% 이상.
- action failure가 전체 tick의 10~30% 사이로 발생하고, 실패는 replan을 유발한다.

### 4. World Game Master

agent가 action attempt를 내면 GM이 가능성, 충돌, 결과를 판정한다.

Inputs:

- actor brain snapshot
- intended action
- location state
- object state
- visible observers
- active constraints

Outputs:

- `accepted | blocked | partial | backfired`
- concrete state deltas
- witness observations
- belief update candidates
- new affordances
- unresolved pressures

Acceptance criteria:

- impossible action은 자동 성공하지 않는다.
- blocked action은 reason과 alternative affordance를 남긴다.
- witness가 있는 행동은 actor 외 인물의 memory에도 들어간다.

### 5. Narrative Director

작가적 top-down 구조는 제거하지 않는다. 다만 직접 사건을 쓰지 않고 world pressure를 넣는다.

Director inputs:

- arc target
- unresolved threads
- current tension map
- character intention map
- pacing budget

Director outputs:

- environment event
- constraint
- opportunity
- deadline
- rumor
- resource scarcity

Acceptance criteria:

- Director output은 action log가 아니라 world condition이어야 한다.
- agent action의 70% 이상은 director가 직접 지정한 행동이 아니라 agent plan에서 나온다.
- 장기 떡밥은 director가 "회수 행동"을 쓰는 게 아니라 회수 가능한 affordance를 만든다.

### 6. Episode Selector and Renderer

소설은 world timeline에서 뽑는다.

Selection metrics:

- `concreteStateDeltaCount`
- `beliefChangedAndUsed`
- `planBlockedOrCompleted`
- `informationAsymmetryChanged`
- `relationshipMagnitude`
- `objectMovement`
- `followUpResolvedRate`
- `readerTensionDelta`

Renderer contract:

- source log에 없는 사건 추가 금지.
- source state delta는 독자가 알 수 있는 행동/대사/물건/정보 변화로 번역.
- abstract pressure는 직접 쓰지 않고 concrete delta만 쓴다.

Acceptance criteria:

- episode 후보의 `concreteStateDeltaCount >= 3`.
- `followUpResolvedRate >= 0.8`.
- selected window의 `uniqueOutcomeRate >= 0.7`.
- 자동 QA가 "분위기 반복"뿐 아니라 "state delta 없음"을 fail 처리한다.

## New Metrics

### followUpResolvedRate

이전 tick의 unresolved pressure가 다음 N tick 안에 concrete action/state delta로 해소되는 비율.

Target: `>= 0.80`.

### uniqueOutcomeRate

sceneOutcome/stateDelta summary의 고유성.

Target: `>= 0.70` per 50 scenes.

### actorChainEntropy

장면별 actor/action chain 다양성.

Target: 50 scenes 기준 unique typed chain `>= 25`.

### concreteStateDeltaRate

action log 중 objective world state를 바꾸는 비율.

Target: `>= 0.60`.

### beliefUsedAfterUpdateRate

belief update가 이후 action choice/rationale에 참조되는 비율.

Target: `>= 0.50` within next 5 ticks.

### planLifecycleCoverage

active/blocked/abandoned/completed plan 상태가 모두 발생하는지.

Target: 100 scene run에서 각 status 1회 이상.

## Implementation Roadmap

### Phase 0: Lock Current Failure

Purpose: 지금 문제를 회귀 테스트로 고정한다.

Work:

- Add diagnostics for duplicate targetReaction/followUp/sceneOutcome.
- Add tests that current "반응할 이유가 생긴다" loops fail.
- Add quality report fields for followUpResolvedRate and uniqueOutcomeRate.

Files:

- [world-model-quality.ts](/Users/seungahjung/Documents/opensource/kakao-novel-generator/web/src/lib/sim/world-model-quality.ts)
- [character-action-sim.ts](/Users/seungahjung/Documents/opensource/kakao-novel-generator/web/src/lib/sim/character-action-sim.ts)
- [world-runner-fast-path.test.ts](/Users/seungahjung/Documents/opensource/kakao-novel-generator/web/__tests__/lib/sim/world-runner-fast-path.test.ts)

Exit gate:

- Existing run that produced 7 unique follow-ups over 408 logs fails the new quality check.

### Phase 1: Concrete State Delta Schema

Purpose: action result를 문장이 아니라 state mutation으로 만든다.

Work:

- Add `WorldStateDelta` schema.
- Add `ActionOutcome` schema.
- Add `sceneOutcomeDeltaIds` to scene log.
- Generate targetReaction/followUp from state deltas only.

Exit gate:

- 8-action scene has at least 5 concrete deltas.
- sceneOutcome no longer equals generic follow-up text.

### Phase 2: Action Operator Library

Purpose: agent가 할 수 있는 행동을 world affordance 기반으로 바꾼다.

Work:

- Replace generic action choice with operator selection.
- Add precondition checking.
- Add action failure and partial success.
- Add object/location/information/social operators.

Exit gate:

- `probe/counter/observe/maintain_mask` combined share below 60%.
- At least 4 action categories appear in a 30-scene run.

### Phase 3: Agent Brain with Plan Lifecycle

Purpose: 인물이 단발 반응이 아니라 계획을 갖고 움직이게 한다.

Work:

- Add `IntentionStack`.
- Add `PlanLifecycleEvent`.
- Add `ReflectionPass`.
- Add memory retrieval scoring.
- Add plan fatigue for repeated low-effect actions.

Exit gate:

- Every action references active intention id.
- Failed/blocked action causes replan in next 3 ticks.
- Belief update appears in later action rationale.

### Phase 4: World Game Master

Purpose: 행동의 가능성과 결과를 world가 판정하게 한다.

Work:

- Add GM resolver between action attempt and final event.
- GM reads location/object/fact/social constraints.
- GM writes witness memories and available affordances.

Exit gate:

- Impossible action test blocks action.
- Witness memory test passes.
- Same action in different location yields different possible outcomes.

### Phase 5: Narrative Director

Purpose: 300화 장기 구조를 유지하되 character agency를 보존한다.

Work:

- Add director pressure events.
- Add thread/deadline/rumor/resource constraints.
- Director cannot directly choose actor action.

Exit gate:

- 100-scene run keeps long-term thread progress.
- At least 70% of agent actions originate from agent intention/operator selection.
- Director pressure changes affordances, not prose.

### Phase 6: Episode Selection and Novel QA Upgrade

Purpose: 소설화 가능한 window만 고른다.

Work:

- Selector scores concrete deltas and plan lifecycle events.
- Novel QA rejects windows with weak state change.
- Human eval checklist maps to automated metrics.

Exit gate:

- 3 sampled episodes pass automatic QA and human score average >= 4.0.
- Low-impact episode can still read as a scene because it has concrete state movement.

## Recommended Work Order

1. Phase 0 first. 지금 실패를 수치로 고정하지 않으면 다시 "QA pass인데 소설 아님"이 반복된다.
2. Phase 1 next. state delta 없이 prompt를 고쳐도 writer는 계속 얇은 문장을 만든다.
3. Phase 2 and Phase 3 together. 행동 operator와 agent brain은 서로 물려 있다.
4. Phase 4 after operator library. GM은 판정할 action vocabulary가 있어야 의미가 있다.
5. Phase 5 after world simulation is trustworthy. director를 먼저 넣으면 top-down plot forcing으로 돌아간다.
6. Phase 6 last. 좋은 로그가 생긴 뒤에 renderer/QA를 강화해야 한다.

## What Not To Do

- 프롬프트만 늘리지 않는다.
- "소설처럼 써라" 규칙을 더 추가하지 않는다.
- `targetReaction`/`followUpActionSeed`를 더 다양한 문장 템플릿으로만 바꾸지 않는다.
- 모든 tick에 LLM을 직접 호출하지 않는다.
- Director가 actor의 행동을 직접 쓰게 하지 않는다.

## Planning ADR

Decision:

- 월드 모델의 다음 개선은 writer가 아니라 simulation core다.

Drivers:

- 현재 로그는 구조적으로 생성되지만 concrete state change가 부족하다.
- 장기 300화에서는 action/result 다양성보다 causal resolution이 더 중요하다.
- Renderer는 월드 로그 이상으로 좋은 소설을 안정적으로 만들 수 없다.

Alternatives considered:

- Prompt-only writer improvement: 이미 실패했다. source log가 추상적이면 writer도 추상적이다.
- More LLM calls per action: 비용이 커지고 검증 가능성이 낮다.
- Pure top-down plot outline: 장기 구조는 잡지만 사용자가 원하는 동적 agent world와 다르다.

Consequences:

- 초기 구현량은 커진다.
- 대신 300화 테스트의 판단 기준이 명확해진다.
- 소설 생성 품질 문제를 writer 문제가 아니라 world-state 문제로 분리할 수 있다.

Follow-ups:

- Phase 0 diagnostics부터 구현한다.
- 이후 Phase 1 state delta schema를 설계한다.
- 30-scene and 100-scene benchmark를 고정한다.
