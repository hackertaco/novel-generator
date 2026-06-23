# 장면 다리 (Scene Bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 역전 모드에서 한 화로 묶인 장면들 사이의 간극(경과 시간·장소 전환·미해결 압력·다음 장면이 열린 계기·음모 단계)을 시뮬 로그에서 결정적으로 뽑아 episode writer 입력에 주입한다 — "이어라"는 지시가 아니라 이을 *재료*를 준다.

**Architecture:** 새 순수 모듈 `scene-bridge.ts`가 인접 장면쌍마다 `SceneBridge`를 계산한다(LLM 없음, 입력은 최소 투영 인터페이스 — `derived-outline.ts`의 `DerivedOutlineSceneInput` 패턴). `episode-window-writer`가 `# 장면 다리` 프롬프트 섹션으로 주입하고(기존 `summary_bridge` 처리 모드 활용), `simulate-world.ts`가 episode-llm/episode-prompt 경로에서 다리를 계산해 전달한다. derived outline 아티팩트에도 같은 다리를 기록한다(검수용).

**배경 (이전 세션 진단):** 역전 모드의 beats 절단이 outline 모드에서 beats가 몰래 하던 부업 — cause→consequence 장면 연결 등뼈 — 까지 제거했다. writer는 "하나의 호흡으로 연결한다" 지시만 받고 연결 재료(시간 경과/장소 전환 이유/미해결 압력)를 못 받아 1화 내 장면들이 점프한다. 다리 재료는 이미 로그에 있다: `actualEffect.followUpActionSeed`, `sceneOutcome`, ledger event `payload.triggeredBy`, `schemeTimeline`, chapter(시간단위) 차이.

**주의 — 진단의 함정:** `derived-outline`은 기록용 아티팩트일 뿐 writer 입력이 아니다. writer가 받는 것은 `WorldEpisodeWindow`이므로 다리의 주 경로는 episode writer 입력이고, derived outline 기록은 부차다.

**Tech Stack:** TypeScript (Next.js web/), vitest, zod 없이 plain interface (derived-outline.ts 전례).

**검증 시드:** `/tmp/seed-inverted.json` (chapter_outlines 0개, "악녀는 두 번 죽지 않는다") — Task 5에서 `web/seeds/test-romance-fantasy-inverted.json`으로 영구화.

---

### Task 1: `scene-bridge.ts` — 결정적 다리 계산 모듈

**Files:**
- Create: `web/src/lib/rendering/scene-bridge.ts`
- Test: `web/__tests__/lib/rendering/scene-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

`web/__tests__/lib/rendering/scene-bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildSceneBridges,
  formatSceneBridgesForPrompt,
  type SceneBridge,
} from "@/lib/rendering/scene-bridge";

const scenes = [
  {
    sceneId: "scene_log_ch001_01",
    chapter: 1,
    location: "응접실",
    sceneOutcome: "세레나가 반지 케이스를 닫고 자리를 떴다.",
    sourceActionLogIds: ["log-a1", "log-a2"],
  },
  {
    sceneId: "scene_log_ch002_01",
    chapter: 2,
    location: "서재",
    sceneOutcome: "엘리시아가 명단을 손에 넣었다.",
    sourceActionLogIds: ["log-b1"],
  },
  {
    sceneId: "scene_log_ch003_01",
    chapter: 3,
    location: "서재",
    sceneOutcome: "라엘이 증인을 불러들였다.",
    sourceActionLogIds: [],
  },
];

const actionLogs = [
  { logId: "log-a1", chapter: 1, followUpActionSeed: "" },
  { logId: "log-a2", chapter: 1, followUpActionSeed: "반지 케이스의 행방을 확인해야 한다" },
  { logId: "log-b1", chapter: 2, followUpActionSeed: "" },
];

const events = [
  { id: "evt-b1", chapter: 2, sceneId: "scene_log_ch002_01", triggeredBy: "세레나가 반지 케이스를 닫았다" },
  { id: "evt-c1", chapter: 3, sceneId: "scene_log_ch003_01" },
];

const schemeTimeline = [
  { chapter: 1, characterId: "serena", stageId: "신뢰_쌓기" },
  { chapter: 3, characterId: "serena", stageId: "증거_심기" },
];

describe("scene bridge", () => {
  it("builds one bridge per adjacent scene pair", () => {
    const bridges = buildSceneBridges({ sceneLogs: scenes, actionLogs, events, schemeTimeline });
    expect(bridges).toHaveLength(2);
    const [first, second] = bridges as [SceneBridge, SceneBridge];

    expect(first.fromSceneId).toBe("scene_log_ch001_01");
    expect(first.toSceneId).toBe("scene_log_ch002_01");
    expect(first.timeGapChapters).toBe(1);
    expect(first.fromLocation).toBe("응접실");
    expect(first.toLocation).toBe("서재");
    // 앞 장면의 마지막 "비어있지 않은" followUpActionSeed = 미해결 압력
    expect(first.unresolvedPressure).toBe("반지 케이스의 행방을 확인해야 한다");
    // 다음 장면 첫 사건의 triggeredBy = 장면이 열린 계기
    expect(first.openingCause).toBe("세레나가 반지 케이스를 닫았다");
    // 도착 장면 chapter 기준 가장 최근 단계
    expect(first.schemeStage).toBe("신뢰_쌓기");

    // followUpActionSeed가 모두 비면 sceneOutcome으로 폴백
    expect(second.unresolvedPressure).toBe("엘리시아가 명단을 손에 넣었다");
    // triggeredBy 없는 사건만 있으면 빈 문자열
    expect(second.openingCause).toBe("");
    expect(second.schemeStage).toBe("증거_심기");
  });

  it("returns no bridges for single or empty scene lists", () => {
    expect(buildSceneBridges({ sceneLogs: [], actionLogs, events, schemeTimeline })).toEqual([]);
    expect(buildSceneBridges({ sceneLogs: [scenes[0]!], actionLogs, events, schemeTimeline })).toEqual([]);
  });

  it("formats bridges as prompt material", () => {
    const bridges = buildSceneBridges({ sceneLogs: scenes, actionLogs, events, schemeTimeline });
    const text = formatSceneBridgesForPrompt(bridges);
    expect(text).toContain("scene_log_ch001_01 → scene_log_ch002_01");
    expect(text).toContain("응접실 → 서재");
    expect(text).toContain("반지 케이스의 행방을 확인해야 한다");
    expect(text).toContain("시간단위 1");
    expect(text).toContain("신뢰_쌓기");
    // 같은 장소는 이동으로 표기하지 않는다
    expect(text).toContain("같은 장소(서재)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/lib/rendering/scene-bridge.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rendering/scene-bridge'`

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/rendering/scene-bridge.ts`:

```ts
/**
 * Scene Bridge — 한 화로 묶인 장면 사이의 간극(시간/장소/미해결 압력/계기/음모 단계)을
 * 시뮬 로그에서 결정적으로 뽑는다. LLM 없음.
 *
 * 배경: 역전 모드의 beats 절단이 outline beats가 몰래 하던 부업(장면 연결 등뼈)까지
 * 제거했다. writer에게 "이어라"는 지시 대신 이을 재료를 입력으로 준다.
 * spec: docs/superpowers/specs/2026-06-08-outline-inversion-design.md
 */

export interface SceneBridgeSceneInput {
  sceneId: string;
  chapter: number;
  location: string;
  sceneOutcome: string;
  sourceActionLogIds: string[];
}

export interface SceneBridgeActionLogInput {
  logId: string;
  chapter: number;
  followUpActionSeed: string;
}

export interface SceneBridgeEventInput {
  id: string;
  chapter: number;
  sceneId?: string;
  triggeredBy?: string;
}

export interface SceneBridgeSchemeEntry {
  chapter: number;
  characterId: string;
  stageId: string;
}

export interface SceneBridge {
  fromSceneId: string;
  toSceneId: string;
  /** chapter(시간단위) 차이 — 0이면 같은 시간단위 안에서 이어진다. */
  timeGapChapters: number;
  fromLocation: string;
  toLocation: string;
  /** 앞 장면이 남긴 미해결 압력 — 마지막 비어있지 않은 followUpActionSeed, 없으면 sceneOutcome. */
  unresolvedPressure: string;
  /** 다음 장면 첫 사건의 triggeredBy — 그 장면이 열린 계기. 없으면 빈 문자열. */
  openingCause: string;
  /** 도착 장면 시점에 진행 중인 음모 단계. 없으면 null. */
  schemeStage: string | null;
}

function unresolvedPressureFor(
  scene: SceneBridgeSceneInput,
  actionLogs: SceneBridgeActionLogInput[],
): string {
  const ids = new Set(scene.sourceActionLogIds);
  const sceneActionLogs = ids.size > 0
    ? actionLogs.filter((log) => ids.has(log.logId))
    : actionLogs.filter((log) => log.chapter === scene.chapter);
  for (let index = sceneActionLogs.length - 1; index >= 0; index -= 1) {
    const seed = sceneActionLogs[index]!.followUpActionSeed.trim();
    if (seed.length > 0) return seed;
  }
  return scene.sceneOutcome;
}

function openingCauseFor(
  scene: SceneBridgeSceneInput,
  events: SceneBridgeEventInput[],
): string {
  const sceneEvents = events.filter((event) =>
    event.sceneId === scene.sceneId || (!event.sceneId && event.chapter === scene.chapter)
  );
  for (const event of sceneEvents) {
    const cause = event.triggeredBy?.trim() ?? "";
    if (cause.length > 0) return cause;
  }
  return "";
}

function schemeStageAt(chapter: number, schemeTimeline: SceneBridgeSchemeEntry[]): string | null {
  let stage: string | null = null;
  for (const entry of schemeTimeline) {
    if (entry.chapter <= chapter) stage = entry.stageId;
  }
  return stage;
}

export function buildSceneBridges(input: {
  sceneLogs: SceneBridgeSceneInput[];
  actionLogs: SceneBridgeActionLogInput[];
  events: SceneBridgeEventInput[];
  schemeTimeline: SceneBridgeSchemeEntry[];
}): SceneBridge[] {
  const bridges: SceneBridge[] = [];
  for (let index = 0; index + 1 < input.sceneLogs.length; index += 1) {
    const from = input.sceneLogs[index]!;
    const to = input.sceneLogs[index + 1]!;
    bridges.push({
      fromSceneId: from.sceneId,
      toSceneId: to.sceneId,
      timeGapChapters: to.chapter - from.chapter,
      fromLocation: from.location,
      toLocation: to.location,
      unresolvedPressure: unresolvedPressureFor(from, input.actionLogs),
      openingCause: openingCauseFor(to, input.events),
      schemeStage: schemeStageAt(to.chapter, input.schemeTimeline),
    });
  }
  return bridges;
}

export function formatSceneBridgesForPrompt(bridges: SceneBridge[]): string {
  return bridges.map((bridge, index) => {
    const elapsed = bridge.timeGapChapters <= 0
      ? "같은 시간단위 안에서 이어짐"
      : `시간단위 ${bridge.timeGapChapters} 경과`;
    const move = bridge.fromLocation === bridge.toLocation
      ? `같은 장소(${bridge.toLocation})`
      : `${bridge.fromLocation} → ${bridge.toLocation}`;
    return [
      `- 다리 ${index + 1} [${bridge.fromSceneId} → ${bridge.toSceneId}]`,
      `  - 경과: ${elapsed} / 장소: ${move}`,
      `  - 앞 장면의 미해결 압력: ${bridge.unresolvedPressure || "-"}`,
      bridge.openingCause ? `  - 다음 장면이 열린 계기: ${bridge.openingCause}` : "",
      bridge.schemeStage ? `  - 진행 중인 음모 단계: ${bridge.schemeStage}` : "",
    ].filter((line) => line.length > 0).join("\n");
  }).join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/lib/rendering/scene-bridge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/rendering/scene-bridge.ts web/__tests__/lib/rendering/scene-bridge.test.ts
git commit -m "feat(rendering): scene-bridge — 장면 간극 결정적 추출 (역전 모드 연결 등뼈)"
```

---

### Task 2: episode writer 프롬프트에 `# 장면 다리` 섹션 주입

**Files:**
- Modify: `web/src/lib/rendering/episode-window-writer.ts` (import 블록, `BuildEpisodeWindowWriterPromptInput`, `buildEpisodeWindowWriterPrompt`)
- Test: `web/__tests__/lib/rendering/episode-window-writer.test.ts`

- [ ] **Step 1: Write the failing test**

`web/__tests__/lib/rendering/episode-window-writer.test.ts`에 테스트 추가. import 블록에 추가:

```ts
import { buildSceneBridges } from "@/lib/rendering/scene-bridge";
```

기존 `"builds one episode prompt from a multi-scene timeline window"` 테스트의 expect 목록 끝에 한 줄 추가 (다리 없으면 섹션 없음을 보장):

```ts
    expect(prompt).not.toContain("장면 다리");
```

그리고 describe 블록 안에 새 테스트 추가:

```ts
  it("injects scene bridges as connective material between scenes", { timeout: 30_000 }, () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 5,
      characterActionsPerChapter: 4,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 2,
      maxScenesPerEpisode: 3,
    }).windows[0]!;
    const windowSceneLogs = episodeWindow.sourceSceneIds
      .map((sceneId) => result.sceneLogs.find((sceneLog) => sceneLog.sceneId === sceneId)!)
      .filter(Boolean);
    const sceneBridges = buildSceneBridges({
      sceneLogs: windowSceneLogs,
      actionLogs: result.actionLogs.map((log) => ({
        logId: log.logId,
        chapter: log.chapter,
        followUpActionSeed: log.actualEffect.followUpActionSeed,
      })),
      events: [],
      schemeTimeline: [],
    });
    const prompt = buildEpisodeWindowWriterPrompt({
      seed,
      worldBrain: result.brain,
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      sceneBridges,
    });

    expect(sceneBridges.length).toBeGreaterThan(0);
    expect(prompt).toContain("장면 다리");
    expect(prompt).toContain("미해결 압력");
    expect(prompt).toContain("summary_bridge 한 단락");
    expect(prompt).toContain(`${windowSceneLogs[0]!.sceneId} → ${windowSceneLogs[1]!.sceneId}`);
    expect(prompt.length).toBeLessThan(16000);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/lib/rendering/episode-window-writer.test.ts`
Expected: 새 테스트 FAIL — `sceneBridges` 프로퍼티 없음 (타입 에러) 또는 `장면 다리` 미포함

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/rendering/episode-window-writer.ts` 변경 3곳:

(1) import 블록 — `episode-selector` import 아래 추가:

```ts
import { formatSceneBridgesForPrompt, type SceneBridge } from "./scene-bridge";
```

(2) `BuildEpisodeWindowWriterPromptInput`에 필드 추가 (`worldLogEditorialMap?` 아래):

```ts
  sceneBridges?: SceneBridge[];
```

(3) `buildEpisodeWindowWriterPrompt` 반환 배열에서 `# scene seam contract` 블록과 `# episode 구성 규칙` 사이에 삽입:

```ts
    input.sceneBridges && input.sceneBridges.length > 0
      ? [
          `# 장면 다리 (scene bridges)`,
          `장면 사이의 간극 정보다. 각 다리는 summary_bridge 한 단락으로 본문에서 메운다.`,
          `- 앞 장면의 미해결 압력이 다음 장면 첫 행동의 이유가 되도록 잇는다.`,
          `- 경과 시간/장소 이동은 "다음 날", "장소만 바뀌었을 뿐" 같은 설명문 대신 행동/빛/사물로 보인다.`,
          `- 다리의 단어를 본문에 그대로 베끼지 않는다.`,
          safe(formatSceneBridgesForPrompt(input.sceneBridges)),
        ].join("\n")
      : "",
    ``,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/lib/rendering/episode-window-writer.test.ts`
Expected: PASS (기존 3 + 새 1 = 4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/rendering/episode-window-writer.ts web/__tests__/lib/rendering/episode-window-writer.test.ts
git commit -m "feat(rendering): episode writer에 장면 다리 섹션 주입 — 연결 지시 대신 연결 재료"
```

---

### Task 3: simulate-world 연결 — episode-llm / episode-prompt 경로에 다리 전달

**Files:**
- Modify: `web/scripts/simulate-world.ts` — import 블록, `writeEpisodeWithQa`, episode-llm 루프(859행 근처), episode-prompt 루프(907행 근처)

- [ ] **Step 1: import 추가**

`derived-outline` import 아래에 추가:

```ts
import {
  buildSceneBridges,
  type SceneBridge,
  type SceneBridgeEventInput,
} from "../src/lib/rendering/scene-bridge";
```

- [ ] **Step 2: 다리 입력 빌더 헬퍼 추가**

`writeEpisodeWithQa` 함수 정의 바로 위에 추가:

```ts
function buildEpisodeSceneBridges(input: {
  episodeWindow: WorldEpisodeWindow;
  result: {
    sceneLogs: SceneLog[];
    actionLogs: CharacterActionLog[];
    ledger: { events: Array<{ id: string; chapter: number }> };
    schemeTimeline: Array<{ chapter: number; characterId: string; stageId: string }>;
  };
}): SceneBridge[] {
  const sceneLogById = new Map(input.result.sceneLogs.map((sceneLog) => [sceneLog.sceneId, sceneLog]));
  const windowSceneLogs = input.episodeWindow.sourceSceneIds
    .map((sceneId) => sceneLogById.get(sceneId))
    .filter((sceneLog): sceneLog is SceneLog => Boolean(sceneLog));
  const events: SceneBridgeEventInput[] = input.result.ledger.events.map((event) => {
    const sceneId = (event as { sceneId?: string }).sceneId;
    const triggeredBy = (event as { payload?: { triggeredBy?: unknown } }).payload?.triggeredBy;
    return {
      id: event.id,
      chapter: event.chapter,
      sceneId,
      triggeredBy: typeof triggeredBy === "string" ? triggeredBy : undefined,
    };
  });
  return buildSceneBridges({
    sceneLogs: windowSceneLogs,
    actionLogs: input.result.actionLogs.map((log) => ({
      logId: log.logId,
      chapter: log.chapter,
      followUpActionSeed: log.actualEffect.followUpActionSeed,
    })),
    events,
    schemeTimeline: input.result.schemeTimeline,
  });
}
```

- [ ] **Step 3: `writeEpisodeWithQa`에 다리 스레딩**

input 타입에 추가 (`worldLogEditorialMap` 아래):

```ts
  sceneBridges?: SceneBridge[];
```

`writeEpisodeWindowNovel` 호출 인자에 추가 (`worldLogEditorialMap: input.worldLogEditorialMap,` 아래):

```ts
      sceneBridges: input.sceneBridges,
```

- [ ] **Step 4: episode-llm 루프에서 다리 계산 + 전달**

`if (options.writerMode === "episode-llm")` 루프 안, `writeEpisodeWithQa` 호출 직전에 추가:

```ts
      const sceneBridges = buildEpisodeSceneBridges({ episodeWindow, result });
```

`writeEpisodeWithQa` 호출 인자에 추가 (`worldLogEditorialMap,` 아래):

```ts
        sceneBridges,
```

- [ ] **Step 5: episode-prompt 루프에도 동일 전달**

`if (options.writerMode === "episode-prompt")` 루프 안, `buildEpisodeWindowWriterPrompt` 호출 직전에 추가:

```ts
      const sceneBridges = buildEpisodeSceneBridges({ episodeWindow, result });
```

호출 인자에 추가 (`worldLogEditorialMap,` 아래):

```ts
        sceneBridges,
```

- [ ] **Step 6: 타입체크 + 전체 테스트**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 0, 전체 테스트 green (이전 세션 기준 1562개 + 신규)

주의: `result.schemeTimeline`의 `SchemeTimelineEntry`는 `kind` 필드가 더 있지만 구조적 서브타이핑으로 통과한다. 통과하지 않으면 `buildEpisodeSceneBridges`의 `schemeTimeline` 파라미터 타입을 `SchemeTimelineEntry[]`로 바꾸고 `import type { SchemeTimelineEntry } from "../src/lib/sim/world-runner"`를 추가한다.

- [ ] **Step 7: Commit**

```bash
git add web/scripts/simulate-world.ts
git commit -m "feat(sim): episode-llm/episode-prompt 경로에 장면 다리 전달"
```

---

### Task 4: derived outline 아티팩트에 다리 기록 (검수용)

**Files:**
- Modify: `web/src/lib/rendering/derived-outline.ts` — `DerivedOutlineChapter`에 optional `bridges` 필드
- Modify: `web/scripts/simulate-world.ts` — `writeDerivedOutlineArtifacts`

- [ ] **Step 1: `DerivedOutlineChapter`에 필드 추가**

`web/src/lib/rendering/derived-outline.ts` 상단에 import 추가:

```ts
import type { SceneBridge } from "./scene-bridge";
```

`DerivedOutlineChapter`에 추가 (`tensionPeak` 아래):

```ts
  /** 인접 장면 사이의 연결 재료 — 아티팩트 기록용. 산출은 scene-bridge.ts. */
  bridges?: SceneBridge[];
```

- [ ] **Step 2: `writeDerivedOutlineArtifacts`에서 다리 계산해 붙이기**

`web/scripts/simulate-world.ts`의 `writeDerivedOutlineArtifacts` input 타입을 넓힌다 — `result` 필드를 다음으로 교체:

```ts
  result: {
    seed: NovelSeed;
    sceneLogs: Array<{
      sceneId: string;
      chapter: number;
      sourceEventIds: string[];
      location: string;
      sceneOutcome: string;
      sourceActionLogIds: string[];
    }>;
    actionLogs: Array<{
      logId: string;
      chapter: number;
      actualEffect: { scenePressureDelta: number; followUpActionSeed: string };
    }>;
    ledger: { events: Array<{ id: string; chapter: number; tags?: string[]; summary: string }> };
    schemeTimeline: unknown;
  };
```

`const labeled = await labelDerivedOutline(...)` 직후, `writeJson(... "derived-outline.json" ...)` 직전에 추가:

```ts
  const sceneLogById = new Map(result.sceneLogs.map((scene) => [scene.sceneId, scene]));
  const bridgeEvents = (result.ledger.events ?? []).map((event) => {
    const sceneId = (event as { sceneId?: string }).sceneId;
    const triggeredBy = (event as { payload?: { triggeredBy?: unknown } }).payload?.triggeredBy;
    return {
      id: event.id,
      chapter: event.chapter,
      sceneId,
      triggeredBy: typeof triggeredBy === "string" ? triggeredBy : undefined,
    };
  });
  const bridgeActionLogs = result.actionLogs.map((log) => ({
    logId: log.logId,
    chapter: log.chapter,
    followUpActionSeed: log.actualEffect.followUpActionSeed,
  }));
  const schemeEntries = Array.isArray(result.schemeTimeline)
    ? (result.schemeTimeline as Array<{ chapter: number; characterId: string; stageId: string }>)
    : [];
  const labeledWithBridges: DerivedOutline = {
    ...labeled,
    chapters: labeled.chapters.map((chapter) => ({
      ...chapter,
      bridges: buildSceneBridges({
        sceneLogs: chapter.sourceSceneIds
          .map((sceneId) => sceneLogById.get(sceneId))
          .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene)),
        actionLogs: bridgeActionLogs,
        events: bridgeEvents,
        schemeTimeline: schemeEntries,
      }),
    })),
  };
```

이후의 `writeJson`/markdown 생성에서 `labeled` 대신 `labeledWithBridges`를 쓰고, 함수의 `return labeled;`도 `return labeledWithBridges;`로 바꾼다. markdown 줄에 다리 추가 — chapters map 부분을 다음으로 교체:

```ts
    ...labeledWithBridges.chapters.map((chapter) => [
      `## ${chapter.title} — ${chapter.oneLiner}`,
      `- 장면: ${chapter.sourceSceneIds.join(", ")}`,
      `- 절단: ${chapter.endsOn ?? "-"} (tension ${chapter.tensionPeak})`,
      ...(chapter.bridges ?? []).map((bridge) =>
        `- 다리: ${bridge.fromSceneId} → ${bridge.toSceneId} (시간단위 ${bridge.timeGapChapters}, ${bridge.fromLocation} → ${bridge.toLocation}) 미해결: ${bridge.unresolvedPressure}`,
      ),
    ].join("\n")),
```

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run: `cd web && npx tsc --noEmit && npx vitest run __tests__/lib/rendering/derived-outline.test.ts && npx vitest run`
Expected: 전부 green (bridges는 optional이라 기존 테스트 영향 없음)

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/rendering/derived-outline.ts web/scripts/simulate-world.ts
git commit -m "feat(rendering): derived outline 아티팩트에 장면 다리 기록"
```

---

### Task 5: 역전 시드 영구화 + 무비용 검증 (episode-prompt)

**Files:**
- Create: `web/seeds/test-romance-fantasy-inverted.json` (= `/tmp/seed-inverted.json` 복사)

- [ ] **Step 1: 시드 영구화**

```bash
cp /tmp/seed-inverted.json web/seeds/test-romance-fantasy-inverted.json
python3 -c "
import json
s = json.load(open('web/seeds/test-romance-fantasy-inverted.json'))
assert len(s.get('chapter_outlines', [])) == 0, 'outline이 비어있어야 역전 모드'
print('OK — inverted seed:', s['title'])
"
```

Expected: `OK — inverted seed: 악녀는 두 번 죽지 않는다`

- [ ] **Step 2: episode-prompt 모드 검증 런 (LLM 호출 없음)**

```bash
cd web && npx tsx scripts/simulate-world.ts \
  --seed seeds/test-romance-fantasy-inverted.json \
  --chapters 1-8 --out /tmp/bridge-prompt-check --episodes 3 \
  --writer episode-prompt 2>&1 | tail -8
```

Expected: 정상 종료 (검증 통과 메시지).

- [ ] **Step 3: 산출물에서 다리 확인**

```bash
grep -A6 "장면 다리" /tmp/bridge-prompt-check/episode-prompts/episode-001.prompt.md | head -20
python3 -c "
import json
d = json.load(open('/tmp/bridge-prompt-check/derived-outline.json'))
for ch in d['chapters']:
    print(ch['number'], '다리', len(ch.get('bridges', [])), '장면', len(ch['sourceSceneIds']))
    for b in ch.get('bridges', []):
        assert b['unresolvedPressure'], '미해결 압력 비어있음'
"
grep "다리:" /tmp/bridge-prompt-check/derived-outline.md
```

Expected:
- episode-001 프롬프트에 `# 장면 다리` 섹션 + 미해결 압력/경과/장소 내용
- 각 chapter의 bridges 개수 = 장면 수 - 1
- derived-outline.md에 `- 다리:` 줄

- [ ] **Step 4: Commit**

```bash
git add web/seeds/test-romance-fantasy-inverted.json
git commit -m "test(seeds): 역전 모드 검증 시드 영구화 (줄거리 0줄)"
```

---

### Task 6: 풀 LLM 렌더 재현 — 이어짐 실독 검증 (비용 ~$0.2, 사용자 체크포인트)

**Files:** 없음 (검증만)

- [ ] **Step 0: 사용자 확인** — LLM 비용이 드는 단계. 실행 전 사용자에게 확인한다.

- [ ] **Step 1: 이전 세션과 동일 조건으로 재런**

```bash
cd web && npx tsx scripts/simulate-world.ts \
  --seed seeds/test-romance-fantasy-inverted.json \
  --chapters 1-8 --out /tmp/inverted-novel-bridged --episodes 3 \
  --writer episode-llm 2>&1 | tail -18
```

Expected: QA 3/3 통과 (이전 베이스라인: 평균 0.960).

- [ ] **Step 2: QA 비교 + 본문 합치기**

```bash
python3 -c "
import json, glob
for f in sorted(glob.glob('/tmp/inverted-novel-bridged/episode-qa/*.qa.json')):
    qa = json.load(open(f))
    print(f.split('/')[-1], qa.get('score'), [k for k, v in (qa.get('dimensionScores') or {}).items() if isinstance(v, (int, float)) and v < 0.8])
"
cat /tmp/inverted-novel-bridged/episodes/episode-*.md > /tmp/inverted-novel-bridged/novel-full.md
open /tmp/inverted-novel-bridged/novel-full.md
```

- [ ] **Step 3: 실독 체크 (사용자와 함께)**

1화 안에서: 장면1 → 장면2 전환에 (a) 시간 경과가 행동/빛/사물로 보이는가 (b) 앞 장면의 미해결 압력이 다음 장면 첫 행동의 이유가 되는가 (c) "보고서 나열" 점프가 사라졌는가. 이전 산출(`/tmp/inverted-novel/novel-full.md`)과 같은 화를 나란히 비교.

- [ ] **Step 4: 메모리 기록 + (개선 확인 시) 마무리 커밋/푸시**

검증 결과(개선/잔존 문제)를 메모리 `project_next_session.md`에 기록하고 main에 푸시한다.

---

## Self-Review

1. **Spec coverage:** 진단의 4개 다리 재료(followUpActionSeed/carryoverPressures 계열 압력, schemeTimeline, 시간단위 차, 장소 전환) — Task 1이 전부 계산. `carryoverPressures`는 시뮬 입력측 필드라 직접 쓰지 않고, 같은 정보의 로그측 흔적인 `followUpActionSeed`/`sceneOutcome`을 쓴다(렌더 입력은 로그에서만 — 파이프 원칙 유지). writer 주입 = Task 2, 실제 경로 연결 = Task 3, 진단문대로 "솎기 결과물에 다리 포함" = Task 4, 검증 = Task 5(무비용) + 6(실독).
2. **Placeholder scan:** 모든 코드 블록 실제 코드. TBD 없음.
3. **Type consistency:** `SceneBridge`/`buildSceneBridges`/`formatSceneBridgesForPrompt`/`SceneBridgeEventInput` 명칭 Task 1~4 일치. `sceneBridges?` optional 필드 명칭 writer/script 일치 확인.
