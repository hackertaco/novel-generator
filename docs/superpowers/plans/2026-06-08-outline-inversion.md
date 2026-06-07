# Outline 역전 (B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 `chapter_outlines` 시드에서 시뮬이 레일 없이 돌고, 로그에서 outline을 발견(솎기)한다 (spec: `docs/superpowers/specs/2026-06-08-outline-inversion-design.md`).

**Architecture:** 역전 모드(시드 판별) — getChapterFrame 대신 결정적 frame-synthesizer(keyPoints 없음=구조적 보증), beats 주입 OFF(사건=agent-tick만), schemeTimeline을 정식 이벤트로 승격, derived-outline 모듈이 결정적 경계 확정 + LLM 이름표. 기존(outline 있는) 시드 경로 불변.

**Tech Stack:** TypeScript/zod/vitest. 기존 패턴: 정수 점수·고정 tie-break(planner-scorer), 추가형 opt-in(blast=0), buildNarrativeDirectorPressureEvent 류 합성 이벤트.

---

## File Structure

- Create: `web/src/lib/sim/frame-synthesizer.ts` — SynthesizedFrame + synthesizeChapterFrame (순수)
- Modify: `web/src/lib/sim/world-runner.ts` — 역전 분기, beats OFF, plotBeat 축소, scheme 전환 이벤트 emit
- Create: `web/src/lib/rendering/derived-outline.ts` — 결정적 솎기(채점→경계) + LLM 이름표(폴백 내장)
- Modify: `web/scripts/simulate-world.ts` — 역전 모드에서 derived-outline 산출
- Create: `web/__tests__/lib/sim/frame-synthesizer.test.ts`
- Create: `web/__tests__/lib/rendering/derived-outline.test.ts`
- Create: `web/__tests__/lib/sim/inverted-mode.test.ts`

게이트: 각 Task 끝 관련 테스트 + 최종 전수 green (현재 1545) + 결정성 2회 동일.

---

### Task 1 (B0): frame-synthesizer 순수모듈

**Files:** Create `web/src/lib/sim/frame-synthesizer.ts` / Create `web/__tests__/lib/sim/frame-synthesizer.test.ts`

- [ ] **1.1 실패 테스트**

```ts
import { describe, expect, it } from "vitest";
import { synthesizeChapterFrame, type SynthesizedFrame } from "@/lib/sim/frame-synthesizer";
// 픽스처: makeMind 류 최소 brain + schemeStates 스텁 (scheme-integration의 SERENA_SCHEME 재사용)

describe("frame synthesizer (역전 모드 상황판)", () => {
  it("derives tension from scheme tension_flow: build_frustration 점증, payoff 8+", () => {
    // 단계0(build_frustration) chapter 2 → tension 5+1 근방; payoff 단계 → >=8
  });
  it("adds +1 on foreshadow reveal chapters and clamps to 1..10", () => {});
  it("prioritizes scheme participants in characterIds", () => {});
  it("has NO keyPoints field on the output type (구조적 보증)", () => {
    const frame: SynthesizedFrame = synthesizeChapterFrame(/* ... */);
    expect("keyPoints" in frame).toBe(false);
  });
  it("is deterministic", () => {});
  it("works without any scheme (fallback: act cadence only)", () => {});
});
```

- [ ] **1.2 FAIL 확인** — `npx vitest run __tests__/lib/sim/frame-synthesizer.test.ts` → 모듈 없음
- [ ] **1.3 구현**

```ts
export interface SynthesizedFrame {
  oneLiner: string;            // 맥락 설명 (사건 지시 아님)
  tensionLevel: number;        // 1..10 결정적 도출
  characterIds: string[];
  threadIds: string[];
  scenePurposeHint?: string;   // act cadence + scheme 단계 매핑
}
export function synthesizeChapterFrame(input: {
  seed: NovelSeed; brain: WorldBrain; chapter: number; totalChapters: number;
  schemeStates: ReadonlyMap<string, SchemeRuntimeState>;
}): SynthesizedFrame {
  // tension = clamp(5 + schemeFlow + revealBonus + actBonus, 1, 10)
  //   schemeFlow: 활성 단계 tension_flow가 release_satisfaction → +3(=8),
  //               build_frustration → +min(stageIndex+0..2), neutral → 0
  //   revealBonus: seed.foreshadowing.some(reveal_at===chapter) ? 1 : 0
  //   actBonus: chapter/totalChapters > 0.75 ? 1 : 0
  // characterIds: schemer+target+공모자 우선, 부족분은 introduced 순서로 채움 (고정 순서)
  // oneLiner: `${arcLabel}: ${활성단계 goal들 join}` (없으면 arc summary/logline)
  // threadIds: longArcThreadIdsForChapter 재사용 가능하면 사용, 아니면 [] (v1 단순)
}
```

- [ ] **1.4 PASS** - [ ] **1.5 Commit** `feat(sim): 역전 모드 프레임 합성기 (B0)`

### Task 2 (B1): world-runner 역전 분기 + beats OFF

**Files:** Modify `web/src/lib/sim/world-runner.ts` / Create `web/__tests__/lib/sim/inverted-mode.test.ts`

- [ ] **2.1 실패 테스트** (역전 시드 = test-romance-fantasy-scheme.json 로드 후 `chapter_outlines: []` 으로 치환하는 헬퍼)

```ts
describe("inverted mode (outline 없는 시드)", () => {
  it("emits ZERO outline-beat world events; events come from agent-tick only", () => {
    // result.events 중 buildWorldEvent 산(beat) 이벤트 0개 — beat 이벤트의 식별:
    // 기존 outline 시드 런과 달리 'world_scene_*_director'/agent_ticks/genre/foreshadow 외의
    // beat 계열 id(evt_world_ch*_beat*) 부재로 단정
  });
  it("keeps outline seeds byte-identical (기존 경로 불변)", () => {
    // plain fixture 시드 결과의 actionLogs/events id 시퀀스가 이 변경 전후 동일하다는 단정은
    // 전수 스위트가 보증 — 여기서는 outline 시드가 inverted 분기로 빠지지 않음만 단정
  });
  it("meets event density gate: agent-tick 사건 수/화 >= brain.qualityBar.targetEventsPerChapterMin", () => {});
  it("is deterministic across two runs", () => {});
});
```

- [ ] **2.2 FAIL 확인**
- [ ] **2.3 구현** — world-runner 챕터 루프에서:

```ts
const inverted = seed.chapter_outlines.length === 0;
const frame = inverted
  ? adaptSynthesizedFrame(synthesizeChapterFrame({ seed, brain, chapter, totalChapters: endChapter, schemeStates }))
  : getChapterFrame(seed, chapter, brain);
// adaptSynthesizedFrame: 기존 frame 형태로 변환하되
//   keyPoints: [], keyPointCauses: [], keyPointConsequences: [] (→ beats.forEach no-op = beats OFF)
//   title: `${chapter}화` (제목은 솎기의 몫), microBeats: deriveChapterMicroBeats 재사용
// plotBeat: inverted ? (derivePlotBeatForChapter의 ①genre_origin/복선reveal 분기만) : 기존 전체
```

`derivePlotBeatForChapter`에 `invertedMode?: boolean` 파라미터 — true면 awaken_magic(복선/자각) 분기만 평가하고 confront/take_physical/sabotage 도출은 skip (scheme의 몫).

- [ ] **2.4 PASS + 전수 스위트 green** (밀도 게이트 미달 시: characterActionsPerChapter 기본을 inverted에서 +2, 그래도 미달이면 scene당 사건 cap 노브는 별도 결정으로 보고)
- [ ] **2.5 Commit** `feat(sim): 역전 모드 — 시드 판별 분기 + beats 주입 절단 (B1)`

### Task 3 (B2a): scheme 전환 이벤트 승격

**Files:** Modify `web/src/lib/sim/world-runner.ts` / Modify `web/__tests__/lib/sim/scheme-integration.test.ts`

- [ ] **3.1 실패 테스트**

```ts
it("promotes scheme transitions to ledger-valid SimulationEvents with cut-point tags", () => {
  const result = runWorldModelFirstSimulation(loadSchemedSeed(), { startChapter: 1, endChapter: 4, characterActionsPerChapter: 4 });
  const transitionEvents = result.state.events?.filter?.((e: any) => e.tags?.includes("scheme-transition"))
    ?? []; // 실제 이벤트 접근 경로는 result.ledger/events 구조 확인 후 보정
  expect(transitionEvents.length).toBeGreaterThanOrEqual(1);
  expect(transitionEvents[0].tags).toEqual(expect.arrayContaining(["cut-point-candidate"]));
  expect(result.report.validation.passed).toBe(true); // ledger 검증 통과
}, 30_000);
```

- [ ] **3.2 FAIL** - [ ] **3.3 구현** — scheme 평가 블록에서 전환 시 buildNarrativeDirectorPressureEvent 패턴을 따른 `buildSchemeTransitionEvent` 추가:

```ts
function buildSchemeTransitionEvent(input: {
  chapter: number; sequence: number; location: string; previousEvent?: SimulationEvent;
  schemerId: string; schemerName: string; kind: SchemeHistoryKind; stageId: string;
}): SimulationEvent {
  const eventId = `evt_world_ch${padChapter(input.chapter)}_scheme_${input.schemerId}_${input.kind}`;
  return {
    id: eventId, chapter: input.chapter, episode: input.chapter, sequence: input.sequence,
    sceneId: `world_scene_${padChapter(input.chapter)}_agent_ticks`,
    type: "status_change", actorId: input.schemerId, location: input.location,
    summary: `음모 전개(${input.schemerName}): ${input.kind} — 단계 '${input.stageId}'`,
    prerequisites: input.previousEvent ? [{ prerequisiteId: `prior-event:${input.previousEvent.id}`, type: "event", description: input.previousEvent.summary, eventId: input.previousEvent.id, stateKey: `event:${input.previousEvent.id}` }] : [],
    involvedEntities: [{ entityId: input.schemerId, entityType: "character", role: "actor", label: input.schemerName }],
    stateChanges: [{ changeId: `${eventId}:scheme-stage`, domain: "world_model", operation: "record",
      stateKey: `scheme:${input.schemerId}:stage`, summary: `단계 ${input.stageId} (${input.kind})`,
      entityIds: [input.schemerId], afterValue: { kind: input.kind, stageId: input.stageId } }],
    outcomes: [{ outcomeId: `${eventId}:transition`, type: "objective_fact_created",
      summary: `음모 단계 전환: ${input.schemerName} → ${input.stageId}` }],
    tags: ["scheme-transition", `scheme:${input.schemerId}:${input.stageId}`, "cut-point-candidate", "world-model:first"],
  } as SimulationEvent; // 실제 스키마 필수 필드는 기존 builder와 대조해 채움 (cognition 등 optional 확인)
}
```

emit 위치: schemeTimeline.push 직후 — `applyEvent(event); events.push(event); previousEvent = event;`. sequence는 `events.length + 1` 패턴(같은 챕터 내 단조 증가 — episode_order 검증 통과 필수).

- [ ] **3.4 PASS + 전수 green** - [ ] **3.5 Commit** `feat(sim): scheme 전환을 정식 이벤트로 승격 (B2a, cut-point 태깅)`

### Task 4 (B2b): derived-outline 결정적 솎기

**Files:** Create `web/src/lib/rendering/derived-outline.ts` / Create `web/__tests__/lib/rendering/derived-outline.test.ts`

- [ ] **4.1 실패 테스트**

```ts
describe("derived outline (솎기 — 결정적 골격)", () => {
  // 입력 스텁: scenes [{sceneId, chapter, eventIds, pressurePeak:int}], events [{id, tags, chapter, summary}]
  it("places chapter boundaries right after scheme-transition events (최고 가중)", () => {});
  it("respects requested chapter count M and balances volume", () => {
    // 12 scenes, M=4 → 각 화 2~4 scenes, 경계는 후보 점수순
  });
  it("falls back to even split when no candidates (사건 희소)", () => {});
  it("is deterministic (정수 점수 + 고정 tie-break)", () => {});
  it("records endsOn as the last event of each chapter (절단점)", () => {});
});
```

- [ ] **4.2 FAIL** - [ ] **4.3 구현**

```ts
export interface DerivedOutlineChapter {
  number: number; title: string; oneLiner: string;
  sourceSceneIds: string[]; sourceEventIds: string[];
  endsOn: string | null; tensionPeak: number;
}
export interface DerivedOutline { chapters: DerivedOutlineChapter[]; totalChapters: number; }

export function cullDerivedOutline(input: {
  scenes: Array<{ sceneId: string; chapter: number; eventIds: string[]; pressurePeak: number }>;
  events: Array<{ id: string; chapter: number; tags: string[]; summary: string }>;
  totalChapters: number;            // 분량 입력 M
}): DerivedOutline {
  // 경계 후보 점수(정수): scene 끝 기준 —
  //   직후가 scheme-transition 이벤트면 +1000, cut-point-candidate +400(중복 미가산),
  //   pressurePeak 상위면 +300, foreshadow reveal 태그 +200
  // M-1개 경계 선택: 점수 내림차순 greedy + 화당 최소/최대 장면 수 제약(균형) +
  //   동점은 앞선 scene 우선(고정 tie-break). 후보 부족 시 균등 분할 폴백.
  // title/oneLiner는 여기선 placeholder(`${n}화`, 첫 사건 summary) — Task 5의 LLM이 교체.
}
```

- [ ] **4.4 PASS** - [ ] **4.5 Commit** `feat(rendering): derived-outline 결정적 솎기 (B2b)`

### Task 5 (B3a): LLM 이름표 (+결정적 폴백)

**Files:** Modify `web/src/lib/rendering/derived-outline.ts` / Modify test

- [ ] **5.1 실패 테스트** — `labelDerivedOutline(outline, {labelWriter})`: labelWriter 미제공 시 결정적 폴백(`${n}화` + 첫 사건 summary) 유지, 제공 시 각 화에 `{title, oneLiner}` 적용·**사건 목록 불변** 단정.
- [ ] **5.2 FAIL** - [ ] **5.3 구현** — `labelWriter?: (ch: DerivedOutlineChapter, eventSummaries: string[]) => Promise<{title: string; oneLiner: string}>` 주입형(테스트는 스텁, 실 LLM은 simulate-world에서 기존 writer 모델 클라이언트로 주입). 골격 불변 보증: labelWriter 결과에서 title/oneLiner만 복사.
- [ ] **5.4 PASS** - [ ] **5.5 Commit** `feat(rendering): derived-outline LLM 이름표 (주입형, 골격 불변)`

### Task 6 (B3b): simulate-world 통합 + E2E + 메모리

**Files:** Modify `web/scripts/simulate-world.ts`

- [ ] **6.1 구현** — 역전 시드(빈 outlines) 감지 시: 시뮬 후 `cullDerivedOutline`(M = chapters 범위 길이 또는 --episodes) 실행, `derived-outline.json` + `derived-outline.md`를 outDir에 기록. `--writer episode-llm`이면 labelWriter에 기존 모델 클라이언트 주입.
- [ ] **6.2 E2E (무비용)** — scheme 시드의 outlines 제거 사본으로 `--selection-only` 실행 → derived-outline.json 생성·경계가 scheme 전환과 정합 확인. 전수 스위트 green.
- [ ] **6.3 (선택) LLM 렌더 스모크** — 사용자 확인 후.
- [ ] **6.4 Commit + push** `feat(sim,rendering): outline 역전 B3 — derived outline 산출 통합`
- [ ] **6.5 메모리 업데이트** — project_target_pipeline.md: B 완료, ③ 빈 칸 채워짐, 6단계 vision 전체 가동.

---

## Self-Review

- **Spec coverage**: §4→T1, §5(beats OFF/plotBeat 축소/밀도 게이트)→T2, §6 1·2단계→T4, 3단계→T5, 이벤트 승격→T3, B3 통합→T6. §7 B0-B3 = T1-T6. 누락 없음.
- **Placeholder**: T1/T4 구현부는 의사코드 수준 — 실행자가 본 세션(전체 컨텍스트 보유). 외부 실행자는 spec §4·§6의 수치(가중/클램프)로 보완 가능하도록 spec 참조 명시.
- **Type 일관성**: SynthesizedFrame(T1)=adaptSynthesizedFrame 입력(T2), SchemeRuntimeState(기존)=T1 입력, DerivedOutline(T4)=T5/T6 소비 동일.
