# Scheme Layer (음모 레이어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시드에 선언된 다화(multi-chapter) 음모를 시뮬레이터가 결정적으로 적응 실행하게 한다 (spec: `docs/superpowers/specs/2026-06-07-scheme-layer-design.md`).

**Architecture:** 시드 `intent_profile.scheme`(zod) → world-brain 컴파일(`mind.scheme`/`foreknowledge`) → world-runner가 챕터마다 SchemeState를 결정적으로 전이(advance/disrupt/expose/stall) → planner-scorer가 활성 단계의 tactics/payoff/exploit을 점수에 반영. 전부 추가형(opt-in): scheme 없는 시드는 기존과 byte-identical.

**Tech Stack:** TypeScript, zod, vitest. 기존 패턴 재사용: 정수 도메인 점수(planner-scorer), runtimeMindStates 챕터간 carry(world-runner), flag-gate(plannerEnabled).

**v1 의식적 단순화 (spec §4.2 보정):** 단계 전환은 SimulationEvent 승격 대신 `schemeTimeline` 레코드 + 차기 챕터 `worldConditionPressures` 주입으로 기록한다. 이벤트 승격은 B(outline 솎기)가 소비자가 될 때.

---

## File Structure

- Modify: `web/src/lib/schema/character.ts` — SchemeSchema/SchemePredicateSchema/ForeknowledgeSchema + IntentProfileSchema에 부착
- Create: `web/src/lib/sim/scheme-engine.ts` — 술어 평가기 + SchemeState 전이 (순수함수)
- Modify: `web/src/lib/sim/world-brain.ts` — mind.scheme/foreknowledge 컴파일 + foreknowledge→knownFacts 주입
- Modify: `web/src/lib/sim/world-runner.ts` — SchemeState 챕터 lifecycle + 전환 기록 + pressure 주입
- Modify: `web/src/lib/sim/planner-scorer.ts` — scheme 점수항 (tactics/payoff/exploit/target bias)
- Modify: `web/src/lib/sim/character-action-sim.ts` — schemeContexts 입력 스레딩
- Create: `web/__tests__/lib/sim/scheme-engine.test.ts`
- Modify: `web/__tests__/lib/sim/planner-scorer.test.ts`
- Create: `web/__tests__/lib/sim/scheme-integration.test.ts`

게이트: 각 Task 끝에 관련 테스트 + 마지막에 전수 스위트 green (현재 1523).

---

### Task 1: 시드 스키마 (SchemeSchema)

**Files:** Modify `web/src/lib/schema/character.ts` / Test `web/__tests__/lib/schema/character.test.ts`

- [ ] **Step 1.1: 실패 테스트** — character.test.ts에 추가:

```ts
describe("scheme schema", () => {
  it("parses a full scheme on intent_profile and rejects unknown predicate", () => {
    const scheme = {
      objective: "약혼 파탄", motive: "황태자비 자리", target: "elysia",
      stakes: { on_success: "내정", on_failure: "몰락", collateral: ["marian"] },
      cover_story: "다정한 동생",
      stages: [{
        id: "신뢰_쌓기", goal: "곁에 머문다", tactics: ["request_help", "maintain_mask"],
        advance_when: { all: [{ trust_at_least: { from: "elysia", value: 2 } }, { chapter_at_least: 2 }] },
        leaves_clue: "명단 흔적", cost: "비밀 하나",
        vulnerability: { fact: "명단 접근 기록", exploit_ops: ["request_access"] },
        disrupted_when: { any: [{ secret_known_by: { secret: "명단 조작", by: "elysia" } }] },
        dramatic_irony: "reader_knows", tension_flow: "build_frustration", stall_after_chapters: 4,
      }],
      payoff: { op: "confront", description: "공개 폭로" },
      if_exposed: { response: "가속", exposure_threshold: 3 },
      deadline: { chapter: 12, on_miss: "가속" },
      accomplices: [{ id: "rael", role: "말", knows_full_plan: false }],
    };
    const parsed = IntentProfileSchema.parse({ surface_goal: "s", hidden_goal: "h", core_fear: "f", scheme });
    expect(parsed.scheme?.stages[0]?.id).toBe("신뢰_쌓기");
    expect(IntentProfileSchema.safeParse({ surface_goal: "s", hidden_goal: "h", core_fear: "f",
      scheme: { ...scheme, stages: [{ ...scheme.stages[0], advance_when: { mood_is: "ripe" } }] } }).success).toBe(false);
    const fore = IntentProfileSchema.parse({ surface_goal: "s", hidden_goal: "h", core_fear: "f",
      foreknowledge: { source: "회귀", knows_schemes_of: ["serena"] } });
    expect(fore.foreknowledge?.knows_schemes_of).toEqual(["serena"]);
  });
});
```

- [ ] **Step 1.2: 실행해 실패 확인** — `npx vitest run __tests__/lib/schema/character.test.ts` → FAIL (scheme 필드 없음)
- [ ] **Step 1.3: 구현** — character.ts의 EventDispositionEnum 아래에:

```ts
const SchemePredicateSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.object({ trust_at_least: z.object({ from: z.string(), value: z.number().int() }) }).strict(),
  z.object({ trust_below: z.object({ from: z.string(), value: z.number().int() }) }).strict(),
  z.object({ event_occurred: z.object({ type: z.string(), by: z.string().optional(), target: z.string().optional() }) }).strict(),
  z.object({ secret_known_by: z.object({ secret: z.string(), by: z.string() }) }).strict(),
  z.object({ chapter_at_least: z.number().int().positive() }).strict(),
  z.object({ scheme_stage_at: z.object({ of: z.string(), stage_index_at_least: z.number().int().nonnegative() }) }).strict(),
  z.object({ exposure_at_least: z.number().int().positive() }).strict(),
  z.object({ all: z.array(SchemePredicateSchema).min(1) }).strict(),
  z.object({ any: z.array(SchemePredicateSchema).min(1) }).strict(),
  z.object({ not: SchemePredicateSchema }).strict(),
]));

export const SchemeStageSchema = z.object({
  id: z.string(),
  goal: z.string(),
  tactics: z.array(z.string()).min(1),
  advance_when: SchemePredicateSchema.nullable().default(null),
  leaves_clue: z.string().optional(),
  cost: z.string().optional(),
  vulnerability: z.object({ fact: z.string(), exploit_ops: z.array(z.string()).min(1) }).optional(),
  disrupted_when: SchemePredicateSchema.optional(),
  dramatic_irony: z.enum(["reader_knows", "reader_suspects", "reader_deceived"]).optional(),
  tension_flow: z.enum(["build_frustration", "release_satisfaction", "neutral"]).optional(),
  stall_after_chapters: z.number().int().positive().optional(),
});

export const SchemeSchema = z.object({
  objective: z.string(),
  motive: z.string(),
  target: z.string(),
  stakes: z.object({ on_success: z.string(), on_failure: z.string(), collateral: z.array(z.string()).default([]) }),
  cover_story: z.string(),
  stages: z.array(SchemeStageSchema).min(2).max(5),
  payoff: z.object({ op: z.string(), description: z.string() }),
  if_exposed: z.object({ response: z.enum(["잠적", "가속", "포기"]), exposure_threshold: z.number().int().positive() }),
  deadline: z.object({ chapter: z.number().int().positive(), on_miss: z.enum(["가속", "포기"]) }).optional(),
  accomplices: z.array(z.object({ id: z.string(), role: z.enum(["공모", "말"]), knows_full_plan: z.boolean() })).default([]),
});

export const ForeknowledgeSchema = z.object({
  source: z.string(),
  knows_schemes_of: z.array(z.string()).min(1),
});

export type Scheme = z.infer<typeof SchemeSchema>;
export type SchemeStage = z.infer<typeof SchemeStageSchema>;
```

IntentProfileSchema에 `scheme: SchemeSchema.optional()` + `foreknowledge: ForeknowledgeSchema.optional()` 추가.

- [ ] **Step 1.4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 1.5: Commit** — `feat(schema): scheme(음모) + foreknowledge 시드 스키마`

### Task 2: 술어 평가기 (scheme-engine, 순수)

**Files:** Create `web/src/lib/sim/scheme-engine.ts` / Create `web/__tests__/lib/sim/scheme-engine.test.ts`

- [ ] **Step 2.1: 실패 테스트** — 술어별 + 조합자 + 결정성:

```ts
import { describe, expect, it } from "vitest";
import { evaluatePredicate, type SchemeWorldView } from "@/lib/sim/scheme-engine";

function view(over: Partial<SchemeWorldView> = {}): SchemeWorldView {
  return { chapter: 3, trustOf: () => 0, knowsFact: () => false,
    eventOccurred: () => false, schemeStageIndexOf: () => undefined, exposureOf: () => 0, ...over };
}

describe("scheme predicate evaluator", () => {
  it("evaluates each predicate against the world view", () => {
    expect(evaluatePredicate({ trust_at_least: { from: "e", value: 2 } }, view({ trustOf: (f) => (f === "e" ? 2 : 0) }))).toBe(true);
    expect(evaluatePredicate({ trust_below: { from: "e", value: 0 } }, view({ trustOf: () => -1 }))).toBe(true);
    expect(evaluatePredicate({ chapter_at_least: 4 }, view())).toBe(false);
    expect(evaluatePredicate({ secret_known_by: { secret: "명단", by: "elysia" } },
      view({ knowsFact: (s, by) => s === "명단" && by === "elysia" }))).toBe(true);
    expect(evaluatePredicate({ event_occurred: { type: "take_physical", by: "serena" } },
      view({ eventOccurred: (q) => q.type === "take_physical" && q.by === "serena" }))).toBe(true);
    expect(evaluatePredicate({ scheme_stage_at: { of: "serena", stage_index_at_least: 1 } },
      view({ schemeStageIndexOf: () => 1 }))).toBe(true);
    expect(evaluatePredicate({ exposure_at_least: 2 }, view({ exposureOf: () => 3 }))).toBe(true);
  });
  it("evaluates all/any/not composites", () => {
    const v = view({ trustOf: () => 2 });
    expect(evaluatePredicate({ all: [{ trust_at_least: { from: "e", value: 2 } }, { chapter_at_least: 3 }] }, v)).toBe(true);
    expect(evaluatePredicate({ any: [{ chapter_at_least: 99 }, { trust_at_least: { from: "e", value: 2 } }] }, v)).toBe(true);
    expect(evaluatePredicate({ not: { chapter_at_least: 99 } }, v)).toBe(true);
  });
});
```

- [ ] **Step 2.2: FAIL 확인** → 모듈 없음
- [ ] **Step 2.3: 구현** — scheme-engine.ts:

```ts
export interface SchemeWorldView {
  chapter: number;
  trustOf: (from: string) => number;                 // 음모 주체 관점: from→주체? (아래 주: from은 "누구의 신뢰"인가 — target 인물 id)
  knowsFact: (secret: string, by: string) => boolean;
  eventOccurred: (q: { type: string; by?: string; target?: string }) => boolean;
  schemeStageIndexOf: (characterId: string) => number | undefined;
  exposureOf: (characterId: string) => number;
}
export function evaluatePredicate(p: unknown, view: SchemeWorldView): boolean { /* 술어별 분기, 미지 키는 false */ }
```

(미지 술어는 throw가 아니라 false — 시드 어휘 초과는 "표현 불가"로 안전 폴백. 단 zod가 이미 차단하므로 이중 안전망.)

- [ ] **Step 2.4: PASS 확인**  - [ ] **Step 2.5: Commit** — `feat(sim): scheme 술어 평가기 (순수/결정적)`

### Task 3: SchemeState 전이 (scheme-engine)

**Files:** Modify `web/src/lib/sim/scheme-engine.ts` / Modify `web/__tests__/lib/sim/scheme-engine.test.ts`

- [ ] **Step 3.1: 실패 테스트** — advance/최종완료/disrupt후퇴/expose분기(잠적·가속·포기)/stall/보편실패/deadline:

```ts
describe("scheme state transitions", () => {
  const scheme = /* Task1의 풀 scheme + 2단계: [신뢰_쌓기(advance: trust≥2), 배신(advance:null)] */;
  it("advances when advance_when holds, completes at final stage payoff", () => { /* initSchemeState→evaluate(trust2)→stage1, history[advanced] */ });
  it("retreats one stage on disrupted_when (first stage retries)", () => {});
  it("exposure threshold triggers 가속 → jumps to final stage", () => {});
  it("stalls after stall_after_chapters without progress → 포기/수정 branch", () => {});
  it("universal failure: target gone → aborted", () => {});
  it("deadline miss → on_miss branch", () => {});
  it("is deterministic (two runs identical)", () => {});
});
```

- [ ] **Step 3.2: FAIL 확인**
- [ ] **Step 3.3: 구현**:

```ts
export interface SchemeRuntimeState {
  characterId: string; targetId: string; currentStageIndex: number;
  status: "active" | "stalled" | "exposed" | "completed" | "aborted";
  exposureGauge: number; chaptersWithoutProgress: number;
  history: Array<{ chapter: number; kind: "advanced" | "disrupted" | "exposed_accelerated" | "exposed_hidden" | "aborted" | "completed" | "stalled" | "deadline" }>;
}
export function initSchemeState(characterId: string, scheme: Scheme): SchemeRuntimeState;
export function evaluateSchemeChapter(input: {
  state: SchemeRuntimeState; scheme: Scheme; view: SchemeWorldView; targetPresent: boolean;
}): SchemeRuntimeState;  // 순수 — 새 state 반환. 우선순위: 보편실패 > expose > deadline > disrupt > advance > stall
```

규칙 (spec §4.2/§4.4): disrupt→한 단계 후퇴(0단계면 재시도, 둘 다 chaptersWithoutProgress 리셋 안 함); expose 임계→if_exposed.response (잠적=한단계 후퇴+history exposed_hidden, 가속=최종 단계로 점프, 포기=aborted); 최종 단계에서 advance_when null → payoff 사건 발생 확인(eventOccurred: payoff.op by characterId) 시 completed; stall_after_chapters 초과 무진전 → 잠적과 동일 처리 후 status stalled→active 재개.

- [ ] **Step 3.4: PASS** - [ ] **Step 3.5: Commit** — `feat(sim): SchemeState 결정적 전이 엔진`

### Task 4: world-brain 컴파일

**Files:** Modify `web/src/lib/sim/world-brain.ts` / Test `web/__tests__/lib/sim/world-brain*.test.ts` (기존 파일에 추가)

- [ ] **Step 4.1: 실패 테스트** — 시드에 scheme/foreknowledge를 넣고 buildWorldBrainFromSeed → `mind.scheme` 보존, foreknowledge 보유자 knownFacts에 `[음모 인지] serena: <objective> (단계: ...)` 주입 + `mind.foreknownSchemes=["serena"]`.
- [ ] **Step 4.2: FAIL** - [ ] **Step 4.3: 구현** — CharacterMindSchema에 `scheme: SchemeSchema.optional()`, `foreknownSchemes: z.array(z.string()).default([])`. 컴파일 시 intent.scheme 전달; foreknowledge.knows_schemes_of의 각 대상 X에 대해 X의 scheme이 있으면 knownFacts에 요약 문자열 push.
- [ ] **Step 4.4: PASS + 전수 스위트** - [ ] **Step 4.5: Commit** — `feat(sim): scheme/foreknowledge world-brain 컴파일`

### Task 5: world-runner SchemeState lifecycle (shadow)

**Files:** Modify `web/src/lib/sim/world-runner.ts` / Create `web/__tests__/lib/sim/scheme-integration.test.ts`

- [ ] **Step 5.1: 실패 테스트** — scheme 태깅한 시드로 runWorldModelFirstSimulation → result에 `schemeTimeline: Array<{chapter, characterId, kind, stageId}>` 존재, 챕터 진행에 따라 advanced 기록, **행동 선택은 불변**(scheme 없는 런과 actionLogs의 action.type 동일 — shadow), 결정성 2회 동일. scheme 없는 시드 → schemeTimeline 빈 배열 + 기존 결과 byte-identical.
- [ ] **Step 5.2: FAIL** - [ ] **Step 5.3: 구현** —
  - 챕터 루프 시작 전: minds에서 scheme 보유자 수집 → `schemeStates` Map 초기화.
  - 각 챕터의 agent-tick 블록 **후**: SchemeWorldView 구성 (trustOf = brain trust + runtimeMindStates[].trustDeltasByCharacter 합; knowsFact = runtime knownFacts substring; eventOccurred = 누적 actionLogs 스캔; schemeStageIndexOf/exposureOf = schemeStates) → exposureGauge 갱신(해당 챕터 logs에서 schemer의 sabotage/take_physical 중 witness≻공모자 or backfired 카운트) → `evaluateSchemeChapter` → 전이 시 schemeTimeline push + 다음 챕터 `carryoverPressures`에 `음모 전개: ${name} — ${stageId} 단계` 주입.
  - result에 `schemeTimeline` 노출.
- [ ] **Step 5.4: PASS + 전수 스위트 green** - [ ] **Step 5.5: Commit** — `feat(sim): world-runner SchemeState lifecycle (shadow, 행동 불변)`

### Task 6: planner-scorer scheme 점수항

**Files:** Modify `web/src/lib/sim/planner-scorer.ts` / Modify `web/__tests__/lib/sim/planner-scorer.test.ts`

- [ ] **Step 6.1: 실패 테스트**:

```ts
it("scheme stage tactics dominate op choice toward the scheme target", () => {
  const d = scoreOperatorBoard(baseInput({ targetId: "elysia", targetTrust: 1,
    scheme: { stageTactics: ["request_help"], schemeTargetId: "elysia", atFinalStage: false } }));
  expect(d.actionType).toBe("request_help");   // 적대 음모인데 협조 행동 = "지금 손해"
});
it("payoff op unlocks big bonus only at final stage", () => {
  const early = scoreOperator(baseInput({ targetTrust: -1, scheme: { stageTactics: [], schemeTargetId: "serena", atFinalStage: false, payoffOp: "confront" } }), "confront");
  const final_ = scoreOperator(baseInput({ targetTrust: -1, scheme: { stageTactics: ["confront"], schemeTargetId: "serena", atFinalStage: true, payoffOp: "confront" } }), "confront");
  expect(final_.goal).toBeGreaterThan(early.goal);
});
it("known vulnerability exploit ops get a bonus against the schemer", () => { /* exploitOps:["request_access"], targetId=schemer → request_access 가산 */ });
```

- [ ] **Step 6.2: FAIL** - [ ] **Step 6.3: 구현** — PlannerScoreInput에 `scheme?: { stageTactics: CharacterActionType[]; schemeTargetId?: string; atFinalStage: boolean; payoffOp?: CharacterActionType; exploitOps?: CharacterActionType[] }`. W에 schemeTactic:700, schemePayoff:900, schemeExploit:500, schemeTargetBias:200 (정수). goalScore에 가산: tactics 포함 +700(+target 일치 시 +200), atFinalStage && op===payoffOp && targetId===schemeTargetId +900, exploitOps 포함 && targetId===schemeTargetId(공략 대상) +500. **scheme 있으면 eventDisposition 가산 무시.**
- [ ] **Step 6.4: PASS (기존 14 + 신규)** - [ ] **Step 6.5: Commit** — `feat(sim): planner-scorer scheme 점수항`

### Task 7: character-action-sim schemeContexts 스레딩

**Files:** Modify `web/src/lib/sim/character-action-sim.ts`, `web/src/lib/sim/world-runner.ts`

- [ ] **Step 7.1: 구현** — CharacterActionSimulationInput에 `schemeContexts?: Record<string /*actorId*/, PlannerSchemeInput>` (planner-scorer의 scheme 입력 타입 재수출). scorer 호출에 `scheme: input.schemeContexts?.[actorId]` 전달. world-runner: agent-tick 블록 **전**에 schemeStates로부터 actor별 컨텍스트 구성 — schemer 본인: 활성 단계 tactics/payoff; foreknower: 아는 schemer의 활성 단계 vulnerability.exploit_ops (targetId가 그 schemer일 때). **plannerEnabled=false면 점수가 행동에 영향 없음(shadow 기록만) — 기존 게이트 그대로.**
- [ ] **Step 7.2: 전수 스위트 green (plannerEnabled 미설정 경로 불변 확인)** - [ ] **Step 7.3: Commit** — `feat(sim): scheme 컨텍스트를 Planner에 스레딩`

### Task 8: 통합 검증 (S3)

**Files:** Modify `web/__tests__/lib/sim/scheme-integration.test.ts`

- [ ] **Step 8.1: 실패 테스트** — plannerEnabled=true + 세레나 2~3단계 scheme:
  1) **phase-distinct**: 신뢰쌓기 단계 챕터들에서 세레나→엘리시아 행동에 request_help/maintain_mask 비중 우세, 최종 단계 도달 후 confront 발생;
  2) **timeline**: schemeTimeline에 advanced→…→completed 순서;
  3) **결정성**: 2회 byte-identical;
  4) **blast=0**: scheme 없는 동일 시드는 schemeTimeline 비고 기존 분포.
- [ ] **Step 8.2: FAIL→구현 보정→PASS**
- [ ] **Step 8.3: 전수 스위트 green** — `npx vitest run` 전체
- [ ] **Step 8.4: Commit + push** — `feat(sim): scheme layer S3 — 다화 음모 통합 검증`
- [ ] **Step 8.5: 메모리 업데이트** — project_target_pipeline.md에 A(음모 레이어) 완료 기록, B가 다음.

---

## Self-Review

- **Spec coverage**: §3 스키마→Task1, 술어→Task2, §4.1-2 전이→Task3, §4.5 회귀인지→Task4, §4.2 기록/압력→Task5, §4.3 Planner→Task6-7, §6 테스트→각 Task+8. §4.4 들킴→Task3(분기)+5(게이지 갱신). 누락 없음.
- **Placeholder**: Task3 테스트 본문이 시나리오 서술형이나 실행자가 본 세션(전체 맥락 보유) — 구현 시 완전한 코드로 전개한다. 외부 실행자라면 Task1의 scheme 객체를 재사용.
- **Type 일관성**: PlannerSchemeInput(T6) = schemeContexts 값 타입(T7) 동일. SchemeWorldView(T2) = evaluateSchemeChapter 입력(T3) = world-runner 구성(T5) 동일.
