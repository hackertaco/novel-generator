# Progressive Top-Down Planning Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat chapter-outline system with a progressive 4-level planning hierarchy (MasterPlan → Parts → Arcs → ChapterBlueprints) that derives episode count from world complexity and generates plans lazily as needed.

**Architecture:** Planning becomes a separate pipeline phase (Phase 0.5) between seed creation and chapter generation. Each level is an independent LLM call that feeds into the next. Plans are stored in the Zustand store and persisted. The existing `chapter_outlines` in NovelSeed are replaced by richer `ChapterBlueprint` objects generated on-demand per arc.

**Tech Stack:** TypeScript, Zod schemas, Next.js API routes, Zustand, Claude API (via existing llm-agent)

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/lib/schema/planning.ts` | Zod schemas: MasterPlan, PartPlan, ArcPlan, ChapterBlueprint, SceneSpec |
| `src/lib/planning/master-planner.ts` | L1: Analyze world complexity → derive part structure + episode range |
| `src/lib/planning/arc-planner.ts` | L2: Expand a Part into detailed Arcs |
| `src/lib/planning/chapter-planner.ts` | L3: Expand an Arc into ChapterBlueprints with scenes |
| `src/lib/planning/lazy-scheduler.ts` | Decides when to trigger L2/L3 planning based on generation progress |
| `src/lib/prompts/planning-prompts.ts` | All planning-related LLM prompts |
| `src/app/api/plan/master/route.ts` | API: Generate master plan from seed |
| `src/app/api/plan/arc/route.ts` | API: Generate arc-level plans for a part |
| `src/app/api/plan/chapters/route.ts` | API: Generate chapter blueprints for an arc |
| `src/app/plan/page.tsx` | UI: Planning overview page (between preview and reader) |
| `__tests__/lib/schema/planning.test.ts` | Unit tests for planning schemas |
| `__tests__/lib/planning/master-planner.test.ts` | Unit tests for master planner |
| `__tests__/lib/planning/lazy-scheduler.test.ts` | Unit tests for lazy scheduler |

### Modified files
| File | Changes |
|------|---------|
| `src/lib/schema/novel.ts` | Add optional `master_plan` field to NovelSeed, keep `chapter_outlines` for backward compat |
| `src/hooks/useNovelStore.ts` | Add planning state: masterPlan, partPlans, chapterBlueprints, planningStage |
| `src/lib/context/builder.ts` | Use ChapterBlueprint (scenes, dependencies) when available instead of flat outline |
| `src/lib/agents/chapter-lifecycle.ts` | Pass blueprint's target_word_count and scene specs to Writer prompt |
| `src/lib/agents/orchestrator.ts` | Trigger lazy planning before chapter generation when blueprint missing |
| `src/app/preview/page.tsx` | After seed approval, redirect to /plan instead of /reader |

---

## Chunk 1: Planning Schemas + Master Planner

### Task 1: Planning Schemas

**Files:**
- Create: `src/lib/schema/planning.ts`
- Test: `__tests__/lib/schema/planning.test.ts`

- [ ] **Step 1: Write failing tests for planning schemas**

```typescript
// __tests__/lib/schema/planning.test.ts
import { describe, it, expect } from "vitest";
import {
  SceneSpecSchema,
  ChapterBlueprintSchema,
  ArcPlanSchema,
  PartPlanSchema,
  MasterPlanSchema,
} from "@/lib/schema/planning";

describe("SceneSpec", () => {
  it("validates a complete scene spec", () => {
    const scene = SceneSpecSchema.parse({
      purpose: "MC가 던전 입구에서 수상한 기운을 감지한다",
      type: "action",
      characters: ["mc", "companion_1"],
      estimated_chars: 1500,
      emotional_tone: "긴장",
    });
    expect(scene.purpose).toBe("MC가 던전 입구에서 수상한 기운을 감지한다");
    expect(scene.type).toBe("action");
    expect(scene.estimated_chars).toBe(1500);
  });

  it("provides defaults for optional fields", () => {
    const scene = SceneSpecSchema.parse({
      purpose: "대화 장면",
      type: "dialogue",
    });
    expect(scene.characters).toEqual([]);
    expect(scene.estimated_chars).toBe(1000);
    expect(scene.emotional_tone).toBe("neutral");
  });
});

describe("ChapterBlueprint", () => {
  it("validates a full chapter blueprint", () => {
    const blueprint = ChapterBlueprintSchema.parse({
      chapter_number: 5,
      title: "어둠 속의 빛",
      arc_id: "arc_1_2",
      one_liner: "던전 깊숙이 진입하며 첫 보스와 조우",
      role_in_arc: "rising_action",
      scenes: [
        { purpose: "던전 진입", type: "action", estimated_chars: 1200 },
        { purpose: "파티 내 갈등", type: "dialogue", estimated_chars: 1000 },
        { purpose: "보스 등장 클리프행어", type: "hook", estimated_chars: 800 },
      ],
      dependencies: ["ch4에서 얻은 열쇠 사용"],
      target_word_count: 3000,
      emotional_arc: "긴장→갈등→충격",
      key_points: ["첫 보스 조우", "파티 내 의견 충돌"],
      characters_involved: ["mc", "companion_1"],
      tension_level: 7,
      foreshadowing_actions: [{ id: "fs_1", action: "hint" }],
    });
    expect(blueprint.scenes).toHaveLength(3);
    expect(blueprint.target_word_count).toBe(3000);
    expect(blueprint.role_in_arc).toBe("rising_action");
  });

  it("computes target_word_count from scenes if not provided", () => {
    const blueprint = ChapterBlueprintSchema.parse({
      chapter_number: 1,
      title: "시작",
      arc_id: "arc_1",
      one_liner: "이야기의 시작",
      scenes: [
        { purpose: "오프닝", type: "action", estimated_chars: 1500 },
        { purpose: "마무리", type: "hook", estimated_chars: 500 },
      ],
    });
    // target_word_count defaults to sum of scene estimated_chars
    expect(blueprint.target_word_count).toBe(2000);
  });
});

describe("ArcPlan", () => {
  it("validates an arc plan with chapter blueprints", () => {
    const arc = ArcPlanSchema.parse({
      id: "arc_1_2",
      name: "첫 동료",
      part_id: "part_1",
      start_chapter: 11,
      end_chapter: 20,
      summary: "주인공이 첫 동료를 만나고 신뢰를 쌓아간다",
      theme: "신뢰와 배신",
      key_events: ["동료 합류", "첫 공동 전투", "배신 의심"],
      climax_chapter: 19,
      tension_curve: [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
      chapter_blueprints: [],
    });
    expect(arc.theme).toBe("신뢰와 배신");
    expect(arc.tension_curve).toHaveLength(10);
  });
});

describe("PartPlan", () => {
  it("validates a part plan", () => {
    const part = PartPlanSchema.parse({
      id: "part_1",
      name: "각성편",
      start_chapter: 1,
      end_chapter: 60,
      theme: "평범한 일상에서 비범한 세계로",
      core_conflict: "자신의 능력을 받아들이고 살아남기",
      resolution_target: "첫 번째 대규모 위기를 넘기고 동료를 얻는다",
      estimated_chapter_count: 60,
      arcs: [],
      transition_to_next: "새로운 세력의 등장으로 더 큰 세계가 열린다",
    });
    expect(part.estimated_chapter_count).toBe(60);
  });
});

describe("MasterPlan", () => {
  it("validates a master plan", () => {
    const plan = MasterPlanSchema.parse({
      estimated_total_chapters: { min: 200, max: 280 },
      world_complexity: {
        faction_count: 5,
        location_count: 12,
        power_system_depth: "deep",
        subplot_count: 4,
      },
      parts: [
        {
          id: "part_1",
          name: "각성편",
          start_chapter: 1,
          end_chapter: 60,
          theme: "각성",
          core_conflict: "생존",
          resolution_target: "첫 위기 극복",
          estimated_chapter_count: 60,
          arcs: [],
        },
      ],
      global_foreshadowing_timeline: [
        { id: "fs_1", plant_part: "part_1", reveal_part: "part_3", description: "주인공의 진짜 정체" },
      ],
    });
    expect(plan.estimated_total_chapters.min).toBe(200);
    expect(plan.world_complexity.faction_count).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/schema/planning.test.ts`
Expected: FAIL — cannot resolve `@/lib/schema/planning`

- [ ] **Step 3: Implement planning schemas**

```typescript
// src/lib/schema/planning.ts
import { z } from "zod";

// --- Scene within a chapter ---

export const SceneTypeEnum = z.enum([
  "action",
  "dialogue",
  "introspection",
  "exposition",
  "hook",
  "flashback",
  "transition",
]);
export type SceneType = z.infer<typeof SceneTypeEnum>;

export const SceneSpecSchema = z.object({
  purpose: z.string().describe("What this scene accomplishes"),
  type: SceneTypeEnum,
  characters: z.array(z.string()).default([]).describe("Character IDs in scene"),
  estimated_chars: z.number().int().default(1000).describe("Estimated character count"),
  emotional_tone: z.string().default("neutral").describe("Emotional tone of scene"),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

// --- Foreshadowing action reference ---

export const ForeshadowingActionRefSchema = z.object({
  id: z.string(),
  action: z.enum(["plant", "hint", "reveal"]),
});

// --- Chapter Blueprint (replaces ChapterOutline) ---

export const ArcRoleEnum = z.enum([
  "setup",
  "rising_action",
  "midpoint",
  "escalation",
  "climax",
  "falling_action",
  "resolution",
  "transition",
]);
export type ArcRole = z.infer<typeof ArcRoleEnum>;

export const ChapterBlueprintSchema = z
  .object({
    chapter_number: z.number().int(),
    title: z.string(),
    arc_id: z.string(),
    one_liner: z.string().describe("One sentence description"),
    role_in_arc: ArcRoleEnum.default("rising_action"),
    scenes: z.array(SceneSpecSchema).default([]),
    dependencies: z.array(z.string()).default([]).describe("What this chapter needs from prior chapters"),
    target_word_count: z.number().int().optional().describe("Target char count; derived from scenes if omitted"),
    emotional_arc: z.string().default("").describe("e.g. 긴장→갈등→충격"),
    key_points: z.array(z.string()).default([]),
    characters_involved: z.array(z.string()).default([]),
    tension_level: z.number().int().min(1).max(10).default(5),
    foreshadowing_actions: z.array(ForeshadowingActionRefSchema).default([]),
  })
  .transform((data) => ({
    ...data,
    target_word_count:
      data.target_word_count ??
      (data.scenes.length > 0
        ? data.scenes.reduce((sum, s) => sum + s.estimated_chars, 0)
        : 3000),
  }));
export type ChapterBlueprint = z.infer<typeof ChapterBlueprintSchema>;

// --- Arc Plan (10-15 chapters) ---

export const ArcPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  part_id: z.string().default(""),
  start_chapter: z.number().int(),
  end_chapter: z.number().int(),
  summary: z.string(),
  theme: z.string().default(""),
  key_events: z.array(z.string()).default([]),
  climax_chapter: z.number().int(),
  tension_curve: z.array(z.number()).default([]).describe("Tension per chapter in this arc"),
  chapter_blueprints: z.array(ChapterBlueprintSchema).default([]),
});
export type ArcPlan = z.infer<typeof ArcPlanSchema>;

// --- Part Plan (50-70 chapters) ---

export const PartPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_chapter: z.number().int(),
  end_chapter: z.number().int(),
  theme: z.string(),
  core_conflict: z.string(),
  resolution_target: z.string().default(""),
  estimated_chapter_count: z.number().int(),
  arcs: z.array(ArcPlanSchema).default([]),
  transition_to_next: z.string().default("").describe("How this part hands off to the next"),
});
export type PartPlan = z.infer<typeof PartPlanSchema>;

// --- World Complexity Assessment ---

export const WorldComplexitySchema = z.object({
  faction_count: z.number().int().default(0),
  location_count: z.number().int().default(0),
  power_system_depth: z.enum(["shallow", "moderate", "deep"]).default("moderate"),
  subplot_count: z.number().int().default(0),
});
export type WorldComplexity = z.infer<typeof WorldComplexitySchema>;

// --- Global Foreshadowing ---

export const GlobalForeshadowingSchema = z.object({
  id: z.string(),
  plant_part: z.string(),
  reveal_part: z.string(),
  description: z.string(),
});

// --- Master Plan (top level) ---

export const MasterPlanSchema = z.object({
  estimated_total_chapters: z.object({
    min: z.number().int(),
    max: z.number().int(),
  }),
  world_complexity: WorldComplexitySchema,
  parts: z.array(PartPlanSchema),
  global_foreshadowing_timeline: z.array(GlobalForeshadowingSchema).default([]),
});
export type MasterPlan = z.infer<typeof MasterPlanSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/schema/planning.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema/planning.ts __tests__/lib/schema/planning.test.ts
git commit -m "feat: add progressive planning schemas (MasterPlan, PartPlan, ArcPlan, ChapterBlueprint)"
```

---

### Task 2: Planning Prompts

**Files:**
- Create: `src/lib/prompts/planning-prompts.ts`

- [ ] **Step 1: Create planning prompts file**

```typescript
// src/lib/prompts/planning-prompts.ts
import type { NovelSeed } from "@/lib/schema/novel";
import type { PartPlan, ArcPlan } from "@/lib/schema/planning";

/**
 * L1: Master Plan — analyze seed's world complexity and derive part structure.
 */
export function getMasterPlanPrompt(seed: NovelSeed): string {
  const worldInfo = `
세계관: ${seed.world.name}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
시대: ${seed.world.time_period}
능력 체계: ${seed.world.magic_system || "없음"}
주요 장소: ${Object.entries(seed.world.key_locations).map(([k, v]) => `${k}: ${v}`).join(", ")}
진영: ${Object.entries(seed.world.factions).map(([k, v]) => `${k}: ${v}`).join(", ")}
세계 규칙: ${seed.world.rules.join("; ")}`;

  const characterInfo = seed.characters
    .map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`)
    .join("\n");

  const existingArcs = seed.arcs
    .map((a) => `- ${a.name} (${a.start_chapter}~${a.end_chapter}): ${a.summary}`)
    .join("\n");

  return `당신은 한국 웹소설 기획 전문가입니다. 다음 소설 설정을 분석하고, 세계관 규모에 맞는 전체 구조를 설계해주세요.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}

## 세계관
${worldInfo}

## 캐릭터 (${seed.characters.length}명)
${characterInfo}

## 기존 아크 구상 (참고용)
${existingArcs}

## 지시사항

1. **세계관 복잡도 분석**: 진영 수, 장소 수, 능력 체계 깊이, 서브플롯 수를 파악
2. **적정 편수 산출**: 이 세계관과 스토리를 완결하는 데 필요한 편수 범위 (min~max)
   - 진영이 많으면 각 진영의 스토리가 필요 → 편수 증가
   - 능력 체계가 깊으면 성장 과정이 길어짐 → 편수 증가
   - 서브플롯이 많으면 병렬 전개 필요 → 편수 증가
3. **대막(Part) 분할**: 스토리의 자연스러운 큰 단위 (각 50~70화)
   - 각 대막의 테마, 핵심 갈등, 도달점
   - 대막 간 전환점 (왜 이야기가 다음 단계로 넘어가는지)
4. **글로벌 복선**: 대막을 넘어서는 장기 복선

## 출력 형식 (JSON)

\`\`\`json
{
  "estimated_total_chapters": { "min": 200, "max": 280 },
  "world_complexity": {
    "faction_count": 5,
    "location_count": 12,
    "power_system_depth": "deep",
    "subplot_count": 4
  },
  "parts": [
    {
      "id": "part_1",
      "name": "각성편",
      "start_chapter": 1,
      "end_chapter": 60,
      "theme": "평범한 일상에서 비범한 세계로",
      "core_conflict": "자신의 능력을 받아들이고 살아남기",
      "resolution_target": "첫 번째 대규모 위기를 넘기고 동료를 얻는다",
      "estimated_chapter_count": 60,
      "arcs": [],
      "transition_to_next": "새로운 세력의 등장으로 더 큰 세계가 열린다"
    }
  ],
  "global_foreshadowing_timeline": [
    {
      "id": "gfs_1",
      "plant_part": "part_1",
      "reveal_part": "part_3",
      "description": "주인공의 진짜 정체에 대한 단서"
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}

/**
 * L2: Arc Planning — expand a Part into detailed Arcs.
 */
export function getArcPlanPrompt(
  seed: NovelSeed,
  part: PartPlan,
  previousPartSummary?: string,
): string {
  return `당신은 한국 웹소설 기획 전문가입니다. 대막을 아크(호)로 분할해주세요.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 대막 정보
${part.name} (${part.start_chapter}~${part.end_chapter}화, 약 ${part.estimated_chapter_count}화)
테마: ${part.theme}
핵심 갈등: ${part.core_conflict}
도달점: ${part.resolution_target}
${previousPartSummary ? `\n## 이전 대막 요약\n${previousPartSummary}` : ""}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`).join("\n")}

## 지시사항

이 대막을 8~12화 단위의 아크로 분할하세요:
1. 각 아크의 테마와 핵심 사건 3~5개
2. 긴장도 커브 (아크 내 각 화의 1-10 텐션)
3. 클라이맥스 위치
4. 아크 간 전환이 자연스럽도록

## 출력 형식 (JSON)

\`\`\`json
{
  "arcs": [
    {
      "id": "arc_${part.id}_1",
      "name": "던전 발견",
      "part_id": "${part.id}",
      "start_chapter": ${part.start_chapter},
      "end_chapter": ${part.start_chapter + 9},
      "summary": "주인공이 숨겨진 던전을 발견하고...",
      "theme": "호기심과 공포",
      "key_events": ["던전 발견", "첫 전투", "보스 조우"],
      "climax_chapter": ${part.start_chapter + 8},
      "tension_curve": [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
      "chapter_blueprints": []
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}

/**
 * L3: Chapter Blueprint — expand an Arc into per-chapter scene plans.
 */
export function getChapterBlueprintPrompt(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
): string {
  const recentSummaries = previousChapterSummaries.slice(-5);

  return `당신은 한국 웹소설 기획 전문가입니다. 아크 내 각 화의 세부 블루프린트를 작성해주세요.

## 소설 정보
제목: ${seed.title}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 아크 정보
${arc.name} (${arc.start_chapter}~${arc.end_chapter}화)
테마: ${arc.theme}
요약: ${arc.summary}
핵심 사건: ${arc.key_events.join(", ")}
클라이맥스: ${arc.climax_chapter}화
텐션 커브: ${arc.tension_curve.join(", ")}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}): ${c.voice.tone}`).join("\n")}

## 활성 복선
${seed.foreshadowing
  .filter((fs) => fs.planted_at <= arc.end_chapter && fs.reveal_at >= arc.start_chapter)
  .map((fs) => `- ${fs.name}: ${fs.description} (심기:${fs.planted_at}, 회수:${fs.reveal_at})`)
  .join("\n") || "없음"}

${recentSummaries.length > 0 ? `## 이전 내용 요약\n${recentSummaries.map((s) => `- ${s.chapter}화: ${s.summary}`).join("\n")}` : ""}

## 지시사항

${arc.start_chapter}화부터 ${arc.end_chapter}화까지 각 화의 블루프린트를 작성하세요:
1. **씬 구성**: 각 화에 2~4개 씬. 각 씬의 목적, 타입, 예상 분량
2. **감정선**: 화 내에서의 감정 흐름
3. **의존 관계**: 이전 화에서 뭘 넘겨받는지
4. **목표 분량**: 씬들의 합산 (보통 3000~5000자)
5. **복선 처리**: 해당 화에서 심기/힌트/회수할 복선

씬 타입: action, dialogue, introspection, exposition, hook, flashback, transition

## 출력 형식 (JSON)

\`\`\`json
{
  "chapter_blueprints": [
    {
      "chapter_number": ${arc.start_chapter},
      "title": "화 제목",
      "arc_id": "${arc.id}",
      "one_liner": "한 줄 요약",
      "role_in_arc": "setup",
      "scenes": [
        {
          "purpose": "주인공이 던전 입구에서 수상한 기운을 감지한다",
          "type": "action",
          "characters": ["mc"],
          "estimated_chars": 1500,
          "emotional_tone": "긴장"
        },
        {
          "purpose": "동료와의 전략 논의",
          "type": "dialogue",
          "characters": ["mc", "companion_1"],
          "estimated_chars": 1000,
          "emotional_tone": "진지"
        },
        {
          "purpose": "클리프행어 - 예상치 못한 존재의 등장",
          "type": "hook",
          "characters": ["mc"],
          "estimated_chars": 500,
          "emotional_tone": "충격"
        }
      ],
      "dependencies": [],
      "emotional_arc": "긴장→진지→충격",
      "key_points": ["던전 진입", "전략 수립"],
      "characters_involved": ["mc", "companion_1"],
      "tension_level": 5,
      "foreshadowing_actions": [{"id": "fs_1", "action": "plant"}]
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/prompts/planning-prompts.ts
git commit -m "feat: add LLM prompts for 3-level planning pipeline"
```

---

### Task 3: Master Planner

**Files:**
- Create: `src/lib/planning/master-planner.ts`
- Test: `__tests__/lib/planning/master-planner.test.ts`

- [ ] **Step 1: Write failing test for master planner**

```typescript
// __tests__/lib/planning/master-planner.test.ts
import { describe, it, expect, vi } from "vitest";
import { generateMasterPlan } from "@/lib/planning/master-planner";
import type { NovelSeed } from "@/lib/schema/novel";
import type { MasterPlan } from "@/lib/schema/planning";

// Mock the LLM agent
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: () => ({
    callStructured: vi.fn().mockResolvedValue({
      data: {
        estimated_total_chapters: { min: 200, max: 280 },
        world_complexity: {
          faction_count: 3,
          location_count: 8,
          power_system_depth: "moderate",
          subplot_count: 2,
        },
        parts: [
          {
            id: "part_1",
            name: "각성편",
            start_chapter: 1,
            end_chapter: 60,
            theme: "각성",
            core_conflict: "생존",
            resolution_target: "위기 극복",
            estimated_chapter_count: 60,
            arcs: [],
          },
        ],
        global_foreshadowing_timeline: [],
      } satisfies MasterPlan,
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, cost_usd: 0.01 },
    }),
    getTracker: () => ({ getSnapshot: () => ({ total_tokens: 0, total_cost_usd: 0 }) }),
  }),
}));

describe("generateMasterPlan", () => {
  it("returns a validated MasterPlan from seed", async () => {
    const seed = {
      title: "테스트 소설",
      logline: "테스트 로그라인",
      total_chapters: 300,
      world: {
        name: "테스트 세계",
        genre: "판타지",
        sub_genre: "회귀",
        time_period: "현대",
        magic_system: "마나 시스템",
        key_locations: { "서울": "시작 도시" },
        factions: { "길드": "모험가 길드" },
        rules: ["마나 고갈시 사망"],
      },
      characters: [],
      arcs: [],
      chapter_outlines: [],
      foreshadowing: [],
      style: {
        max_paragraph_length: 3,
        dialogue_ratio: 0.6,
        sentence_style: "short",
        hook_ending: true,
        pov: "1인칭",
        tense: "과거형",
        formatting_rules: [],
      },
    } as NovelSeed;

    const result = await generateMasterPlan(seed);
    expect(result.data.estimated_total_chapters.min).toBe(200);
    expect(result.data.parts).toHaveLength(1);
    expect(result.data.world_complexity.faction_count).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/planning/master-planner.test.ts`
Expected: FAIL — cannot resolve `@/lib/planning/master-planner`

- [ ] **Step 3: Implement master planner**

```typescript
// src/lib/planning/master-planner.ts
import { getAgent } from "@/lib/agents/llm-agent";
import { getMasterPlanPrompt } from "@/lib/prompts/planning-prompts";
import { MasterPlanSchema, type MasterPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

export async function generateMasterPlan(
  seed: NovelSeed,
): Promise<{ data: MasterPlan; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getMasterPlanPrompt(seed);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 전체 구조를 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.7,
    maxTokens: 6000,
    schema: MasterPlanSchema,
    format: "json",
    taskId: "master-plan",
  });

  return { data: result.data, usage: result.usage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/planning/master-planner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/master-planner.ts __tests__/lib/planning/master-planner.test.ts
git commit -m "feat: add master planner (L1) — derives structure from world complexity"
```

---

### Task 4: Arc Planner + Chapter Planner

**Files:**
- Create: `src/lib/planning/arc-planner.ts`
- Create: `src/lib/planning/chapter-planner.ts`

- [ ] **Step 1: Implement arc planner**

```typescript
// src/lib/planning/arc-planner.ts
import { getAgent } from "@/lib/agents/llm-agent";
import { getArcPlanPrompt } from "@/lib/prompts/planning-prompts";
import { ArcPlanSchema, type ArcPlan, type PartPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const ArcPlanResponseSchema = z.object({
  arcs: z.array(ArcPlanSchema),
});

export async function generateArcPlans(
  seed: NovelSeed,
  part: PartPlan,
  previousPartSummary?: string,
): Promise<{ data: ArcPlan[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getArcPlanPrompt(seed, part, previousPartSummary);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 아크 구조를 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.7,
    maxTokens: 6000,
    schema: ArcPlanResponseSchema,
    format: "json",
    taskId: `arc-plan-${part.id}`,
  });

  return { data: result.data.arcs, usage: result.usage };
}
```

- [ ] **Step 2: Implement chapter planner**

```typescript
// src/lib/planning/chapter-planner.ts
import { getAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import { ChapterBlueprintSchema, type ChapterBlueprint, type ArcPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

export async function generateChapterBlueprints(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 8000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}`,
  });

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/planning/arc-planner.ts src/lib/planning/chapter-planner.ts
git commit -m "feat: add arc planner (L2) and chapter planner (L3)"
```

---

### Task 5: Lazy Scheduler

**Files:**
- Create: `src/lib/planning/lazy-scheduler.ts`
- Test: `__tests__/lib/planning/lazy-scheduler.test.ts`

- [ ] **Step 1: Write failing tests for lazy scheduler**

```typescript
// __tests__/lib/planning/lazy-scheduler.test.ts
import { describe, it, expect } from "vitest";
import { LazyScheduler } from "@/lib/planning/lazy-scheduler";
import type { MasterPlan, ArcPlan, ChapterBlueprint } from "@/lib/schema/planning";

describe("LazyScheduler", () => {
  const masterPlan: MasterPlan = {
    estimated_total_chapters: { min: 200, max: 280 },
    world_complexity: {
      faction_count: 3,
      location_count: 8,
      power_system_depth: "moderate",
      subplot_count: 2,
    },
    parts: [
      {
        id: "part_1",
        name: "각성편",
        start_chapter: 1,
        end_chapter: 60,
        theme: "각성",
        core_conflict: "생존",
        resolution_target: "위기 극복",
        estimated_chapter_count: 60,
        arcs: [
          {
            id: "arc_1_1",
            name: "시작",
            part_id: "part_1",
            start_chapter: 1,
            end_chapter: 10,
            summary: "시작",
            theme: "발견",
            key_events: [],
            climax_chapter: 9,
            tension_curve: [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
            chapter_blueprints: [],
          },
          {
            id: "arc_1_2",
            name: "성장",
            part_id: "part_1",
            start_chapter: 11,
            end_chapter: 20,
            summary: "성장",
            theme: "훈련",
            key_events: [],
            climax_chapter: 19,
            tension_curve: [],
            chapter_blueprints: [],
          },
        ],
        transition_to_next: "",
      },
      {
        id: "part_2",
        name: "성장편",
        start_chapter: 61,
        end_chapter: 120,
        theme: "성장",
        core_conflict: "경쟁",
        resolution_target: "승리",
        estimated_chapter_count: 60,
        arcs: [],
        transition_to_next: "",
      },
    ],
    global_foreshadowing_timeline: [],
  };

  it("identifies which arc a chapter belongs to", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.getArcForChapter(5)?.id).toBe("arc_1_1");
    expect(scheduler.getArcForChapter(15)?.id).toBe("arc_1_2");
    expect(scheduler.getArcForChapter(65)).toBeUndefined(); // part_2 has no arcs yet
  });

  it("identifies which part a chapter belongs to", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.getPartForChapter(5)?.id).toBe("part_1");
    expect(scheduler.getPartForChapter(65)?.id).toBe("part_2");
    expect(scheduler.getPartForChapter(999)).toBeUndefined();
  });

  it("detects when arc planning is needed", () => {
    const scheduler = new LazyScheduler(masterPlan);
    // part_2 has no arcs — needs L2 planning
    expect(scheduler.needsArcPlanning(65)).toBe(true);
    // part_1 has arcs — no L2 needed
    expect(scheduler.needsArcPlanning(5)).toBe(false);
  });

  it("detects when chapter blueprint is needed", () => {
    const scheduler = new LazyScheduler(masterPlan);
    // arc_1_1 has no blueprints — needs L3 planning
    expect(scheduler.needsChapterBlueprint(5)).toBe(true);
  });

  it("returns false when blueprint exists", () => {
    const planWithBlueprints = structuredClone(masterPlan);
    planWithBlueprints.parts[0].arcs[0].chapter_blueprints = [
      {
        chapter_number: 5,
        title: "test",
        arc_id: "arc_1_1",
        one_liner: "test",
        role_in_arc: "rising_action",
        scenes: [],
        dependencies: [],
        target_word_count: 3000,
        emotional_arc: "",
        key_points: [],
        characters_involved: [],
        tension_level: 5,
        foreshadowing_actions: [],
      },
    ];
    const scheduler = new LazyScheduler(planWithBlueprints);
    expect(scheduler.needsChapterBlueprint(5)).toBe(false);
  });

  it("gets blueprint for a chapter", () => {
    const planWithBlueprints = structuredClone(masterPlan);
    const blueprint = {
      chapter_number: 5,
      title: "test",
      arc_id: "arc_1_1",
      one_liner: "test",
      role_in_arc: "rising_action" as const,
      scenes: [],
      dependencies: [],
      target_word_count: 3000,
      emotional_arc: "",
      key_points: [],
      characters_involved: [],
      tension_level: 5,
      foreshadowing_actions: [],
    };
    planWithBlueprints.parts[0].arcs[0].chapter_blueprints = [blueprint];
    const scheduler = new LazyScheduler(planWithBlueprints);
    expect(scheduler.getBlueprint(5)?.chapter_number).toBe(5);
    expect(scheduler.getBlueprint(99)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/planning/lazy-scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lazy scheduler**

```typescript
// src/lib/planning/lazy-scheduler.ts
import type {
  MasterPlan,
  PartPlan,
  ArcPlan,
  ChapterBlueprint,
} from "@/lib/schema/planning";

/**
 * LazyScheduler determines what planning work is needed
 * before generating a given chapter.
 */
export class LazyScheduler {
  constructor(private plan: MasterPlan) {}

  getPartForChapter(chapter: number): PartPlan | undefined {
    return this.plan.parts.find(
      (p) => p.start_chapter <= chapter && chapter <= p.end_chapter,
    );
  }

  getArcForChapter(chapter: number): ArcPlan | undefined {
    for (const part of this.plan.parts) {
      const arc = part.arcs.find(
        (a) => a.start_chapter <= chapter && chapter <= a.end_chapter,
      );
      if (arc) return arc;
    }
    return undefined;
  }

  getBlueprint(chapter: number): ChapterBlueprint | undefined {
    const arc = this.getArcForChapter(chapter);
    if (!arc) return undefined;
    return arc.chapter_blueprints.find((b) => b.chapter_number === chapter);
  }

  /** Returns true if this chapter's Part has no Arcs yet (needs L2). */
  needsArcPlanning(chapter: number): boolean {
    const part = this.getPartForChapter(chapter);
    if (!part) return false;
    return part.arcs.length === 0;
  }

  /** Returns true if this chapter has no blueprint yet (needs L3). */
  needsChapterBlueprint(chapter: number): boolean {
    return this.getBlueprint(chapter) === undefined;
  }

  /** Get all planning actions needed before generating a chapter. */
  getPlanningNeeds(chapter: number): {
    needsL2: boolean;
    needsL3: boolean;
    part?: PartPlan;
    arc?: ArcPlan;
  } {
    const part = this.getPartForChapter(chapter);
    const needsL2 = this.needsArcPlanning(chapter);
    const arc = this.getArcForChapter(chapter);
    const needsL3 = this.needsChapterBlueprint(chapter);

    return { needsL2, needsL3, part, arc };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/planning/lazy-scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/lazy-scheduler.ts __tests__/lib/planning/lazy-scheduler.test.ts
git commit -m "feat: add lazy scheduler — detects when L2/L3 planning is needed"
```

---

## Chunk 2: API Routes + Store Integration

### Task 6: Planning API Routes

**Files:**
- Create: `src/app/api/plan/master/route.ts`
- Create: `src/app/api/plan/arc/route.ts`
- Create: `src/app/api/plan/chapters/route.ts`

- [ ] **Step 1: Create master plan API route**

```typescript
// src/app/api/plan/master/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateMasterPlan } from "@/lib/planning/master-planner";
import type { NovelSeed } from "@/lib/schema/novel";

export async function POST(request: NextRequest) {
  try {
    const { seed } = (await request.json()) as { seed: NovelSeed };
    if (!seed) {
      return NextResponse.json({ error: "시드가 필요합니다" }, { status: 400 });
    }

    const result = await generateMasterPlan(seed);
    return NextResponse.json({ masterPlan: result.data, usage: result.usage });
  } catch (err) {
    console.error("[plan/master] Error:", err);
    const message = err instanceof Error ? err.message : "마스터 플랜 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create arc plan API route**

```typescript
// src/app/api/plan/arc/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateArcPlans } from "@/lib/planning/arc-planner";
import type { NovelSeed } from "@/lib/schema/novel";
import type { PartPlan } from "@/lib/schema/planning";

export async function POST(request: NextRequest) {
  try {
    const { seed, part, previousPartSummary } = (await request.json()) as {
      seed: NovelSeed;
      part: PartPlan;
      previousPartSummary?: string;
    };
    if (!seed || !part) {
      return NextResponse.json({ error: "시드와 대막 정보가 필요합니다" }, { status: 400 });
    }

    const result = await generateArcPlans(seed, part, previousPartSummary);
    return NextResponse.json({ arcs: result.data, usage: result.usage });
  } catch (err) {
    console.error("[plan/arc] Error:", err);
    const message = err instanceof Error ? err.message : "아크 플랜 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create chapter blueprint API route**

```typescript
// src/app/api/plan/chapters/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ArcPlan } from "@/lib/schema/planning";

export async function POST(request: NextRequest) {
  try {
    const { seed, arc, previousChapterSummaries } = (await request.json()) as {
      seed: NovelSeed;
      arc: ArcPlan;
      previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>;
    };
    if (!seed || !arc) {
      return NextResponse.json({ error: "시드와 아크 정보가 필요합니다" }, { status: 400 });
    }

    const result = await generateChapterBlueprints(seed, arc, previousChapterSummaries || []);
    return NextResponse.json({ blueprints: result.data, usage: result.usage });
  } catch (err) {
    console.error("[plan/chapters] Error:", err);
    const message = err instanceof Error ? err.message : "챕터 블루프린트 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plan/master/route.ts src/app/api/plan/arc/route.ts src/app/api/plan/chapters/route.ts
git commit -m "feat: add planning API routes (/api/plan/master, /api/plan/arc, /api/plan/chapters)"
```

---

### Task 7: Store Integration

**Files:**
- Modify: `src/hooks/useNovelStore.ts`

- [ ] **Step 1: Add planning state to store**

Add to the `NovelState` interface (after `seed: NovelSeed | null;`):

```typescript
  // Step 3.5: Planning
  masterPlan: MasterPlan | null;
  planningStage: "idle" | "master" | "arcs" | "chapters" | "complete";
```

Add imports:

```typescript
import type { MasterPlan } from "@/lib/schema/planning";
```

Add actions to interface:

```typescript
  setMasterPlan: (plan: MasterPlan) => void;
  updateMasterPlan: (updater: (plan: MasterPlan) => MasterPlan) => void;
  setPlanningStage: (stage: "idle" | "master" | "arcs" | "chapters" | "complete") => void;
```

Add to `initialState`:

```typescript
  masterPlan: null,
  planningStage: "idle" as const,
```

Add action implementations:

```typescript
  setMasterPlan: (plan) => set({ masterPlan: plan }),
  updateMasterPlan: (updater) =>
    set((s) => ({
      masterPlan: s.masterPlan ? updater(s.masterPlan) : null,
    })),
  setPlanningStage: (stage) => set({ planningStage: stage }),
```

Add `masterPlan` and `planningStage` to `partialize`:

```typescript
  masterPlan: state.masterPlan,
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useNovelStore.ts
git commit -m "feat: add planning state to novel store (masterPlan, planningStage)"
```

---

## Chunk 3: Context Builder + Orchestrator Integration

### Task 8: Enhanced Context Builder

**Files:**
- Modify: `src/lib/context/builder.ts`

The context builder currently uses `seed.chapter_outlines` (flat outlines). When a `ChapterBlueprint` is available, it should use the richer data (scenes, dependencies, emotional_arc, target_word_count).

- [ ] **Step 1: Add blueprint-aware context building**

Add import at top of `builder.ts`:

```typescript
import type { ChapterBlueprint } from "../schema/planning";
```

Add a new function after `buildSmartChapterContext`:

```typescript
/**
 * Build chapter context using a ChapterBlueprint (richer than flat outline).
 * Falls back to buildChapterContext if no blueprint provided.
 */
export function buildBlueprintContext(
  seed: NovelSeed,
  chapterNum: number,
  previousSummaries: Array<{ chapter: number; title: string; summary: string }>,
  blueprint?: ChapterBlueprint,
): string {
  if (!blueprint) {
    return buildChapterContext(seed, chapterNum, previousSummaries);
  }

  const parts: string[] = [];

  // Novel info
  parts.push(`# 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
`);

  // Current arc
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
${currentArc.summary}
클라이맥스: ${currentArc.climax_chapter}화
`);
  }

  // Blueprint (richer than outline)
  parts.push(`# ${chapterNum}화 블루프린트
제목: ${blueprint.title}
핵심: ${blueprint.one_liner}
아크 내 역할: ${blueprint.role_in_arc}
감정선: ${blueprint.emotional_arc}
목표 분량: ${blueprint.target_word_count}자
`);

  // Scene plan
  if (blueprint.scenes.length > 0) {
    parts.push("## 씬 구성");
    for (let i = 0; i < blueprint.scenes.length; i++) {
      const scene = blueprint.scenes[i];
      parts.push(`${i + 1}. [${scene.type}] ${scene.purpose} (~${scene.estimated_chars}자, 톤: ${scene.emotional_tone})`);
    }
    parts.push("");
  }

  // Dependencies
  if (blueprint.dependencies.length > 0) {
    parts.push(`## 이전 화 의존
${blueprint.dependencies.map((d) => `- ${d}`).join("\n")}
`);
  }

  // Key points
  if (blueprint.key_points.length > 0) {
    parts.push(`## 핵심 포인트
${blueprint.key_points.map((p) => `- ${p}`).join("\n")}
`);
  }

  // Characters
  const characterIds = blueprint.characters_involved;
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(`
## ${char.name} (${char.role})
톤: ${char.voice.tone}
말투: ${char.voice.speech_patterns.join(", ")}
예시 대사:
${char.voice.sample_dialogues.slice(0, 3).map((d) => `- "${d}"`).join("\n")}
`);
    }
  }

  // Foreshadowing
  const activeFs = seed.foreshadowing.filter(
    (fs) => shouldAct(fs, chapterNum) !== null,
  );
  if (activeFs.length > 0) {
    parts.push("# 복선 처리");
    for (const fs of activeFs) {
      const action = shouldAct(fs, chapterNum);
      parts.push(`- [${action}] ${fs.name}: ${fs.description}`);
    }
  }

  // Previous summaries (last 5)
  const recentSummaries = previousSummaries.slice(-5);
  if (recentSummaries.length > 0) {
    parts.push("# 이전 내용 요약");
    for (const s of recentSummaries) {
      parts.push(`- ${s.chapter}화: ${s.summary.slice(0, 100)}...`);
    }
  }

  // Style guide
  parts.push(`# 스타일 가이드
- 문단: ${seed.style.max_paragraph_length}문장 이하
- 대화 비율: ${Math.round(seed.style.dialogue_ratio * 100)}%
- 시점: ${seed.style.pov}
- 시제: ${seed.style.tense}
- 후킹 엔딩: ${seed.style.hook_ending ? "필수" : "선택"}
규칙:
${seed.style.formatting_rules.map((r) => `- ${r}`).join("\n")}
`);

  return parts.join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/context/builder.ts
git commit -m "feat: add blueprint-aware context builder (buildBlueprintContext)"
```

---

### Task 9: Update Chapter Lifecycle to Use Blueprints

**Files:**
- Modify: `src/lib/agents/chapter-lifecycle.ts`

- [ ] **Step 1: Add blueprint support to lifecycle options**

Add import:

```typescript
import type { ChapterBlueprint } from "@/lib/schema/planning";
import { buildBlueprintContext } from "@/lib/context/builder";
```

Add to `ChapterLifecycleOptions`:

```typescript
  blueprint?: ChapterBlueprint;
```

- [ ] **Step 2: Use blueprint in context building and Writer prompt**

In `runChapterLifecycle`, replace:

```typescript
  const context = buildChapterContext(seed, chapterNumber, previousSummaries);
```

With:

```typescript
  const context = options.blueprint
    ? buildBlueprintContext(seed, chapterNumber, previousSummaries, options.blueprint)
    : buildChapterContext(seed, chapterNumber, previousSummaries);
```

In the `chapterRequirements` string for non-first chapters, add blueprint-specific instructions when available:

```typescript
  const blueprintInstructions = options.blueprint
    ? `\n목표 분량: ${options.blueprint.target_word_count}자
씬 구성을 반드시 따라주세요 (위 블루프린트 참조).
각 씬의 예상 분량을 참고하여 적절히 배분하세요.`
    : "";
```

Append `blueprintInstructions` to the chapter requirements string.

Also update `MIN_CHAR_COUNT` to use blueprint target if available:

```typescript
  const MIN_CHAR_COUNT = options.blueprint?.target_word_count
    ? Math.max(options.blueprint.target_word_count * 0.7, 2000)
    : 3000;
```

Also update the title extraction near the end of `runChapterLifecycle` (around line 467-470) to use blueprint title:

Replace:
```typescript
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  const title = outline?.title || `${chapterNumber}화`;
```

With:
```typescript
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  const title = options.blueprint?.title || outline?.title || `${chapterNumber}화`;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/chapter-lifecycle.ts
git commit -m "feat: chapter lifecycle uses blueprint for context and word count targets"
```

---

### Task 10: Update Orchestrator for Lazy Planning

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`

- [ ] **Step 1: Add planning-aware orchestration**

Add imports:

```typescript
import type { MasterPlan, ChapterBlueprint } from "@/lib/schema/planning";
import { LazyScheduler } from "@/lib/planning/lazy-scheduler";
import { generateArcPlans } from "@/lib/planning/arc-planner";
import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";
```

Add to `OrchestratorOptions`:

```typescript
  masterPlan?: MasterPlan;
  /** Called when lazy planning produces new data (arcs or blueprints). */
  onPlanUpdate?: (plan: MasterPlan) => void;
```

Extend the `PipelineStage` type (lines 12-20 of `orchestrator.ts`):

```typescript
export type PipelineStage =
  | "idle"
  | "generating_plots"
  | "awaiting_plot_selection"
  | "generating_seed"
  | "planning_arcs"
  | "planning_chapters"
  | "generating_chapter"
  | "evaluating"
  | "improving"
  | "chapter_complete";
```

Add `plan_update` to `OrchestratorEvent`:

```typescript
  | { type: "plan_update"; plan: MasterPlan }
```

Update `generateChapter` to check planning needs before generation:

```typescript
  /** Generate a single chapter through the full lifecycle */
  async *generateChapter(
    seed: NovelSeed,
    chapterNumber: number,
    previousSummaries: Array<{
      chapter: number;
      title: string;
      summary: string;
    }>,
  ): AsyncGenerator<OrchestratorEvent> {
    let blueprint: ChapterBlueprint | undefined;

    // Lazy planning: generate arcs/blueprints if needed
    if (this.options.masterPlan) {
      const scheduler = new LazyScheduler(this.options.masterPlan);
      const needs = scheduler.getPlanningNeeds(chapterNumber);

      if (needs.needsL2 && needs.part) {
        this.stage = "planning_arcs";
        yield { type: "pipeline_stage", stage: this.stage };

        const arcResult = await generateArcPlans(seed, needs.part);
        // Update plan in-place
        needs.part.arcs = arcResult.data;
        this.options.onPlanUpdate?.(this.options.masterPlan);
        yield { type: "plan_update", plan: this.options.masterPlan };

        yield { type: "usage", ...arcResult.usage };
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }

      // Re-check after L2 (arc might now exist)
      const arc = scheduler.getArcForChapter(chapterNumber);
      if (arc && scheduler.needsChapterBlueprint(chapterNumber)) {
        this.stage = "planning_chapters";
        yield { type: "pipeline_stage", stage: this.stage };

        const bpResult = await generateChapterBlueprints(seed, arc, previousSummaries);
        arc.chapter_blueprints = bpResult.data;
        this.options.onPlanUpdate?.(this.options.masterPlan);
        yield { type: "plan_update", plan: this.options.masterPlan };

        yield { type: "usage", ...bpResult.usage };
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }

      blueprint = scheduler.getBlueprint(chapterNumber);
    }

    this.stage = "generating_chapter";
    yield { type: "pipeline_stage", stage: this.stage };

    const lifecycle = runChapterLifecycle({
      seed,
      chapterNumber,
      previousSummaries,
      qualityThreshold: this.options.qualityThreshold,
      maxAttempts: this.options.maxAttemptsPerChapter,
      blueprint,
    });

    for await (const event of lifecycle) {
      if (event.type === "stage_change") {
        if (event.stage === "evaluating") this.stage = "evaluating";
        else if (event.stage === "improving") this.stage = "improving";
      }
      yield event;
      if (event.type === "usage") {
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }
    }

    this.stage = "chapter_complete";
    yield { type: "pipeline_stage", stage: this.stage };
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agents/orchestrator.ts
git commit -m "feat: orchestrator triggers lazy planning before chapter generation"
```

---

## Chunk 4: UI + Navigation

### Task 11: Plan Overview Page

**Files:**
- Create: `src/app/plan/page.tsx`

- [ ] **Step 1: Create the planning page**

This page sits between `/preview` (seed approval) and `/reader` (chapter generation). It:
1. Triggers master plan generation from the seed
2. Shows the hierarchical plan (Parts → Arcs)
3. Lets user approve or regenerate before proceeding

```typescript
// src/app/plan/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";

export default function PlanPage() {
  const router = useRouter();
  const { seed, masterPlan, setMasterPlan, setPlanningStage, error, setError } =
    useNovelStore();
  const [loading, setLoading] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (seed && !masterPlan && !loading && !didFetch.current) {
      didFetch.current = true;
      generatePlan();
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const generatePlan = async () => {
    if (!seed) return;
    setLoading(true);
    setError(null);
    setPlanningStage("master");

    try {
      const res = await fetch("/api/plan/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "플랜 생성 실패" }));
        throw new Error(err.error);
      }

      const data = await res.json();
      setMasterPlan(data.masterPlan);
      setPlanningStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "플랜 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  if (!seed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">시드를 먼저 생성해주세요.</p>
          <button
            onClick={() => router.push("/genre")}
            className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
          >
            처음부터 시작
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">전체 구조 설계 중...</h1>
          <p className="mt-2 text-sm text-zinc-400">
            세계관 복잡도를 분석하고, 대막과 아크를 설계하고 있습니다.
          </p>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!masterPlan) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          {error ? (
            <>
              <p className="text-red-400">플랜 생성 실패: {error}</p>
              <button
                onClick={() => { didFetch.current = false; generatePlan(); }}
                className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
              >
                다시 시도
              </button>
            </>
          ) : (
            <p className="text-zinc-400">플랜을 생성하고 있습니다...</p>
          )}
        </div>
      </div>
    );
  }

  const { estimated_total_chapters, world_complexity, parts } = masterPlan;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{seed.title} — 전체 구조</h1>
        <p className="mt-2 text-sm text-zinc-400">{seed.logline}</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            예상 {estimated_total_chapters.min}~{estimated_total_chapters.max}화
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            대막 {parts.length}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            진영 {world_complexity.faction_count}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            장소 {world_complexity.location_count}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            능력 체계: {world_complexity.power_system_depth === "deep" ? "심층" : world_complexity.power_system_depth === "moderate" ? "보통" : "단순"}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {parts.map((part, i) => (
          <div key={part.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">
                Part {i + 1}: {part.name}
              </h2>
              <span className="text-xs text-zinc-500">
                {part.start_chapter}~{part.end_chapter}화 ({part.estimated_chapter_count}화)
              </span>
            </div>
            <p className="text-sm text-zinc-300 mb-2">{part.theme}</p>
            <div className="text-xs text-zinc-500 space-y-1">
              <p>핵심 갈등: {part.core_conflict}</p>
              <p>도달점: {part.resolution_target}</p>
              {part.transition_to_next && (
                <p className="text-violet-400">→ {part.transition_to_next}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {masterPlan.global_foreshadowing_timeline.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">장기 복선</h2>
          <div className="space-y-2">
            {masterPlan.global_foreshadowing_timeline.map((fs) => (
              <div key={fs.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                {fs.description}
                <span className="text-xs text-zinc-500 ml-2">
                  (심기: {fs.plant_part} → 회수: {fs.reveal_part})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => { didFetch.current = false; generatePlan(); }}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          다시 생성
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/preview")}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            이전
          </button>
          <button
            onClick={() => router.push("/reader")}
            className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            소설 생성 시작
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/plan/page.tsx
git commit -m "feat: add /plan page — shows master plan with parts and foreshadowing"
```

---

### Task 12: Update Navigation Flow

**Files:**
- Modify: `src/app/preview/page.tsx`

- [ ] **Step 1: Change "소설 생성 시작" button to go to /plan instead of /reader**

In `preview/page.tsx`, change:

```typescript
onClick={() => router.push("/reader")}
```

To:

```typescript
onClick={() => router.push("/plan")}
```

And update the button text:

```typescript
소설 구조 설계
```

- [ ] **Step 2: Commit**

```bash
git add src/app/preview/page.tsx
git commit -m "feat: preview page now navigates to /plan before reader"
```

---

### Task 13: Wire Orchestrate API to Pass Master Plan

**Files:**
- Modify: `src/app/api/orchestrate/route.ts`

- [ ] **Step 1: Read current orchestrate route**

Read the file first to understand the exact current implementation.

- [ ] **Step 2: Accept masterPlan in request body and handle plan_update events**

Add `masterPlan` to the request body parsing and pass it to the Orchestrator constructor:

```typescript
const { seed, chapterNumber, previousSummaries, options, batch, masterPlan } = body;

const orchestrator = new Orchestrator({
  ...options,
  masterPlan,
});
```

In the SSE event loop, handle `plan_update` events by serializing the updated plan to the client:

```typescript
// Inside the for-await loop over orchestrator events:
if (event.type === "plan_update") {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: "plan_update", plan: event.plan })}\n\n`));
}
```

The client (in `useStreamingGeneration.ts` or wherever the SSE is consumed) should handle `plan_update` events:

```typescript
case "plan_update":
  store.updateMasterPlan(() => data.plan);
  break;
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orchestrate/route.ts
git commit -m "feat: orchestrate API accepts masterPlan for lazy planning"
```

---

### Task 14: Build Check + Final Verification

- [ ] **Step 1: Run TypeScript compilation check**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all unit tests**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Fix any issues found**

If there are compilation errors or test failures, fix them and commit.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any build/test issues from planning integration"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|------------------|
| 1 | T1-T5 | Planning schemas, prompts, planners (L1/L2/L3), lazy scheduler |
| 2 | T6-T7 | API routes, store integration |
| 3 | T8-T10 | Context builder + orchestrator use blueprints + lazy planning |
| 4 | T11-T14 | UI page, navigation flow, build verification |

### Token budget estimate

| Level | Input | Output | Calls | Total |
|-------|-------|--------|-------|-------|
| L1 Master Plan | ~2K | ~3K | 1 | ~5K |
| L2 Arc Planning | ~3K | ~4K | 4-5 per novel | ~35K |
| L3 Chapter Blueprints | ~4K | ~5K | 25-30 per novel | ~270K |
| **Total planning overhead** | | | | **~310K tokens (~2,000원)** |

This is <5% of the total generation cost for a 250-chapter novel, but provides dramatically better Writer guidance.
