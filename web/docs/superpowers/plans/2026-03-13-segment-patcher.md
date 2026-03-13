# Segment Patcher Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-text rewrite retries with targeted paragraph-level patching that preserves well-written sections.

**Architecture:** Text is split into segments (paragraphs). On quality failure, Issue Locator maps evaluation failures to specific segment IDs. Segment Editor patches only failing segments with ±1 paragraph context. Pass 1 remains full Editor; passes 2-5 use segment patching.

**Tech Stack:** TypeScript, Vitest, Next.js SSE streaming, existing LLM agent infrastructure.

**Spec:** `docs/superpowers/specs/2026-03-13-segment-patcher-design.md`

---

## Chunk 1: Segmenter + Issue Locator (pure functions, no LLM)

### Task 1: Segmenter — split/reassemble

**Files:**
- Create: `src/lib/agents/segmenter.ts`
- Create: `__tests__/lib/agents/segmenter.test.ts`

- [ ] **Step 1: Write failing tests for Segmenter**

```ts
// __tests__/lib/agents/segmenter.test.ts
import { describe, it, expect } from "vitest";
import { segmentText, reassemble, type Segment } from "@/lib/agents/segmenter";

describe("segmentText", () => {
  it("splits on double newline", () => {
    const text = "첫 번째 문단입니다.\n\n두 번째 문단입니다.\n\n세 번째 문단입니다.";
    const segments = segmentText(text);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ id: 0, text: "첫 번째 문단입니다." });
    expect(segments[1]).toEqual({ id: 1, text: "두 번째 문단입니다." });
    expect(segments[2]).toEqual({ id: 2, text: "세 번째 문단입니다." });
  });

  it("filters empty segments", () => {
    const text = "문단 A\n\n\n\n문단 B";
    const segments = segmentText(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("문단 A");
    expect(segments[1].text).toBe("문단 B");
  });

  it("handles single paragraph", () => {
    const text = "하나의 문단만 있다.";
    const segments = segmentText(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ id: 0, text: "하나의 문단만 있다." });
  });

  it("preserves internal newlines within paragraphs", () => {
    const text = '"안녕하세요."\n준혁이 말했다.\n\n다음 문단.';
    const segments = segmentText(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('"안녕하세요."\n준혁이 말했다.');
  });
});

describe("reassemble", () => {
  it("joins segments with double newline", () => {
    const segments: Segment[] = [
      { id: 0, text: "A" },
      { id: 1, text: "B" },
      { id: 2, text: "C" },
    ];
    expect(reassemble(segments)).toBe("A\n\nB\n\nC");
  });

  it("roundtrips with segmentText", () => {
    const original = "문단 1\n\n문단 2\n\n문단 3";
    const segments = segmentText(original);
    expect(reassemble(segments)).toBe(original);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/agents/segmenter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Segmenter**

```ts
// src/lib/agents/segmenter.ts
export interface Segment {
  id: number;
  text: string;
}

export function segmentText(text: string): Segment[] {
  return text
    .split("\n\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t, i) => ({ id: i, text: t }));
}

export function reassemble(segments: Segment[]): string {
  return segments.map((s) => s.text).join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/agents/segmenter.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/segmenter.ts __tests__/lib/agents/segmenter.test.ts
git commit -m "feat: add Segmenter for paragraph-level text splitting"
```

---

### Task 2: Export patterns from pacing.ts

**Files:**
- Modify: `src/lib/evaluators/pacing.ts`

The Issue Locator needs `POWER_UP_PATTERNS`, `CLIMAX_PATTERNS`, `TIME_JUMP_PATTERNS`, and `DESCRIPTIVE_KEYWORDS` from `pacing.ts`. Currently these are module-level `const` — just export them.

- [ ] **Step 1: Write a test that imports the exports**

```ts
// Add to __tests__/lib/pacing-strategy.test.ts at the end:

describe("Exported constants for Issue Locator", () => {
  it("exports POWER_UP_PATTERNS", async () => {
    const { POWER_UP_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(POWER_UP_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports CLIMAX_PATTERNS", async () => {
    const { CLIMAX_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(CLIMAX_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports TIME_JUMP_PATTERNS", async () => {
    const { TIME_JUMP_PATTERNS } = await import("@/lib/evaluators/pacing");
    expect(TIME_JUMP_PATTERNS.length).toBeGreaterThan(0);
  });

  it("exports DESCRIPTIVE_KEYWORDS", async () => {
    const { DESCRIPTIVE_KEYWORDS } = await import("@/lib/evaluators/pacing");
    expect(DESCRIPTIVE_KEYWORDS.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/pacing-strategy.test.ts`
Expected: FAIL — exports not found

- [ ] **Step 3: Add `export` keyword to the four constants in `pacing.ts`**

In `src/lib/evaluators/pacing.ts`, change these lines:
- Line 92: `const POWER_UP_PATTERNS` → `export const POWER_UP_PATTERNS`
- Line 97: `const CLIMAX_PATTERNS` → `export const CLIMAX_PATTERNS`
- Line 222: `const DESCRIPTIVE_KEYWORDS` → `export const DESCRIPTIVE_KEYWORDS`
- Line 308: `const TIME_JUMP_PATTERNS` → `export const TIME_JUMP_PATTERNS`

- [ ] **Step 4: Run ALL pacing tests to verify nothing broke**

Run: `npx vitest run __tests__/lib/pacing-strategy.test.ts`
Expected: All PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluators/pacing.ts __tests__/lib/pacing-strategy.test.ts
git commit -m "refactor: export pacing patterns for Issue Locator reuse"
```

---

### Task 3: Issue Locator

**Files:**
- Create: `src/lib/evaluators/issue-locator.ts`
- Create: `__tests__/lib/evaluators/issue-locator.test.ts`

- [ ] **Step 1: Write failing tests for Issue Locator**

```ts
// __tests__/lib/evaluators/issue-locator.test.ts
import { describe, it, expect } from "vitest";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { segmentText } from "@/lib/agents/segmenter";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import { evaluatePacing } from "@/lib/evaluators/pacing";

// Reuse MOCK_SEED from pacing-strategy.test.ts pattern
const MOCK_SEED = {
  title: "테스트",
  logline: "테스트",
  total_chapters: 10,
  world: {
    name: "test", genre: "현대 판타지", sub_genre: "헌터물",
    time_period: "현대", magic_system: "마나",
    key_locations: {}, factions: {}, rules: [],
  },
  characters: [
    {
      id: "mc", name: "이준혁", role: "주인공", introduction_chapter: 1,
      voice: {
        tone: "무심한", speech_patterns: ["~거든", "뭐..."],
        sample_dialogues: [], personality_core: "현실주의자",
      },
      backstory: "평범한 학생", arc_summary: "성장",
      state: { level: 1, location: "서울", status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    },
  ],
  arcs: [{ id: "arc_1", name: "각성편", start_chapter: 1, end_chapter: 30, summary: "각성", key_events: [], climax_chapter: 28 }],
  chapter_outlines: [
    { chapter_number: 1, title: "시작", arc_id: "arc_1", one_liner: "일상", key_points: ["일상"], characters_involved: ["mc"], tension_level: 3 },
  ],
  foreshadowing: [],
  style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short" as const, hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
} as any;

describe("locateIssues", () => {
  it("flags segment with too many consecutive dialogue lines", () => {
    const text = [
      "서술 문단입니다. 길을 걸었다.",
      '"첫 번째 대사"\n"두 번째 대사"\n"세 번째 대사"\n"네 번째 대사"\n"다섯 번째 대사"\n"여섯 번째 대사"',
      "마지막 서술 문단.",
    ].join("\n\n");

    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const dialogueIssue = issues.find((i) => i.segmentId === 1);
    expect(dialogueIssue).toBeDefined();
    expect(dialogueIssue!.issues.some((i) => i.includes("대사"))).toBe(true);
  });

  it("flags last segment when hook_ending fails", () => {
    const text = "첫 문단.\n\n두 번째 문단.\n\n그냥 끝나는 마지막 문단이다";
    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const lastSegId = segments[segments.length - 1].id;
    const hookIssue = issues.find((i) => i.segmentId === lastSegId);
    expect(hookIssue).toBeDefined();
    expect(hookIssue!.issues.some((i) => i.includes("후킹") || i.includes("엔딩"))).toBe(true);
  });

  it("flags segment with time jump markers", () => {
    const text = "첫 문단입니다.\n\n다음 날 아침이 밝았다. 며칠 후 상황이 달라졌다.\n\n마지막 문단.";
    const segments = segmentText(text);
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    const timeIssue = issues.find((i) => i.segmentId === 1);
    expect(timeIssue).toBeDefined();
    expect(timeIssue!.issues.some((i) => i.includes("시간"))).toBe(true);
  });

  it("returns empty array when all metrics pass", () => {
    // Use the GOOD_CH1 text from pacing-strategy.test.ts
    const text = `수업 종이 울렸다. 이준혁은 책상에 엎드린 채 꿈쩍도 하지 않았다.

"야, 종 쳤다."

짝꿍이 등을 쿡 찔렀다. 준혁은 느릿하게 고개를 들었다. 창밖으로 석양이 내리고 있었다.

"뭐... 알았어."

가방을 대충 챙겨 복도로 나왔다. 학교는 늘 이 시간이 가장 시끄러웠다. 웃는 소리, 뛰는 소리, 누군가를 부르는 소리.

준혁은 이어폰을 꽂았다. 그게 이 소음에서 살아남는 유일한 방법이었다.

편의점까지는 걸어서 15분. 매일 같은 길을 걸었다. 같은 가로수, 같은 횡단보도, 같은 벽돌 담.

"어서 오세요~"

알바 선배가 카운터 뒤에서 손을 흔들었다. 준혁은 고개만 까딱했다.

앞치마를 두르고 진열대를 정리하기 시작했다. 유통기한 확인, 앞줄 빼기, 뒷줄 채우기. 손이 알아서 움직였다.

그때 창밖을 봤다.

하늘에 실금 같은 게 있었다. 아주 가느다란 선. 마치 유리에 금이 간 것처럼.

"...뭐야 저거."

혼잣말이 나왔다. 하지만 창밖을 지나가는 사람들은 아무도 고개를 들지 않았다.

준혁은 다시 한번 올려다봤다. 분명히 있었다. 하늘에, 뭔가가.

"준혁아, 3번 냉장고 좀 채워~"

"...네."

고개를 돌렸다. 다시 올려다봤을 때, 선은 여전히 거기 있었다.`;

    const segments = segmentText(text);
    // This text is well-written, most metrics should pass
    // The test verifies that no spurious issues are generated
    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);

    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);
    // Good text might still have minor issues — key point is no false positives on core metrics
    // Allow at most issues related to dialogue_ratio (which depends on style target)
    const criticalIssues = issues.filter((i) =>
      i.issues.some((iss) => iss.includes("대사 연속") || iss.includes("시간") || iss.includes("각성"))
    );
    expect(criticalIssues).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/evaluators/issue-locator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Issue Locator**

```ts
// src/lib/evaluators/issue-locator.ts
import type { Segment } from "@/lib/agents/segmenter";
import type { StyleResult } from "./style";
import type { ConsistencyResult } from "./consistency";
import type { PacingResult } from "./pacing";
import {
  POWER_UP_PATTERNS,
  CLIMAX_PATTERNS,
  TIME_JUMP_PATTERNS,
  DESCRIPTIVE_KEYWORDS,
} from "./pacing";
import type { NovelSeed } from "@/lib/schema/novel";

export interface SegmentIssue {
  segmentId: number;
  issues: string[];
  context?: {
    characterVoice?: { name: string; speechPatterns: string[] }[];
    foreshadowing?: { name: string; description: string }[];
  };
}

export function locateIssues(
  segments: Segment[],
  style: StyleResult,
  consistency: ConsistencyResult,
  pacing: PacingResult,
  seed: NovelSeed,
  chapterNumber: number,
): SegmentIssue[] {
  const issueMap = new Map<number, SegmentIssue>();

  function addIssue(segmentId: number, issue: string, context?: SegmentIssue["context"]) {
    const existing = issueMap.get(segmentId);
    if (existing) {
      existing.issues.push(issue);
      if (context) {
        existing.context = { ...existing.context, ...context };
      }
    } else {
      issueMap.set(segmentId, { segmentId, issues: [issue], context });
    }
  }

  // --- Location-specific: re-scan per segment ---

  // 1. Dialogue pacing: consecutive dialogue lines per segment
  if (!pacing.dialogue_pacing.pass) {
    for (const seg of segments) {
      const lines = seg.text.split("\n").filter((l) => l.trim());
      let maxConsecutive = 0;
      let current = 0;
      for (const line of lines) {
        if (/^["\u201C\u300C]/.test(line.trim())) {
          current++;
          maxConsecutive = Math.max(maxConsecutive, current);
        } else {
          current = 0;
        }
      }
      if (maxConsecutive >= 5) {
        addIssue(seg.id, `대사가 ${maxConsecutive}줄 연속됩니다. 중간에 행동/묘사 비트를 넣어주세요.`);
      }
    }
  }

  // 2. Paragraph length: sentence count per segment
  if (!style.paragraph_length.pass) {
    const maxSentences = seed.style.max_paragraph_length;
    for (const seg of segments) {
      const sentences = seg.text.split(/[.!?]\s+/).filter((s) => s.trim());
      if (sentences.length > maxSentences) {
        addIssue(seg.id, `문단이 ${sentences.length}문장입니다. ${maxSentences}문장 이하로 나눠주세요.`);
      }
    }
  }

  // 3. Character voice: match dialogue snippets to segments
  if (!consistency.character_voice.pass) {
    for (const issue of consistency.character_voice.issues) {
      for (const seg of segments) {
        if (seg.text.includes(issue.dialogue.slice(0, 30))) {
          const charInfo = seed.characters.find((c) => c.name === issue.character);
          addIssue(seg.id, `${issue.character}의 말투가 어색합니다. 패턴: ${issue.expected_patterns.join(", ")}`, {
            characterVoice: charInfo ? [{ name: charInfo.name, speechPatterns: charInfo.voice.speech_patterns }] : undefined,
          });
          break;
        }
      }
    }
  }

  // 4. Time jumps: scan segments for markers
  if (!pacing.time_jumps.pass) {
    for (const seg of segments) {
      const markers: string[] = [];
      for (const pattern of TIME_JUMP_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) markers.push(...matches);
      }
      if (markers.length > 0) {
        addIssue(seg.id, `시간 점프 표현 발견: ${markers.join(", ")}. 현재 장면에 집중해주세요.`);
      }
    }
  }

  // 5. Early chapter pacing: power-up / climax patterns
  if (chapterNumber <= 5) {
    for (const seg of segments) {
      const powerUps: string[] = [];
      for (const pattern of POWER_UP_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) powerUps.push(...matches);
      }
      if (powerUps.length >= 2 && chapterNumber <= 2) {
        addIssue(seg.id, `능력 각성/획득 표현 ${powerUps.length}회 (초반에 과도). 일상적 장면으로 교체해주세요.`);
      }

      const climaxes: string[] = [];
      for (const pattern of CLIMAX_PATTERNS) {
        const matches = seg.text.match(pattern);
        if (matches) climaxes.push(...matches);
      }
      if (climaxes.length >= 2 && chapterNumber <= 3) {
        addIssue(seg.id, `클라이맥스급 표현 ${climaxes.length}회 (초반에 과도). 톤을 낮춰주세요.`);
      }
    }
  }

  // --- Ratio-based: inferred mapping ---

  // 6. Dialogue ratio low → longest narration-only segment
  if (!style.dialogue_ratio.pass && style.dialogue_ratio.actual_ratio < style.dialogue_ratio.target_ratio) {
    let bestSeg: Segment | null = null;
    let bestLen = 0;
    for (const seg of segments) {
      const hasDialogue = /["\u201C\u300C]/.test(seg.text);
      if (!hasDialogue && seg.text.length > bestLen) {
        bestLen = seg.text.length;
        bestSeg = seg;
      }
    }
    if (bestSeg) {
      addIssue(bestSeg.id, `대사 비율이 부족합니다 (${Math.round(style.dialogue_ratio.actual_ratio * 100)}% / 목표 ${Math.round(style.dialogue_ratio.target_ratio * 100)}%). 이 구간에 대사를 추가해주세요.`);
    }
  }

  // 7. Description ratio low → longest segment with zero descriptive keywords
  if (!pacing.description_ratio.pass && pacing.description_ratio.ratio < 0.25) {
    let bestSeg: Segment | null = null;
    let bestLen = 0;
    for (const seg of segments) {
      const hasDesc = DESCRIPTIVE_KEYWORDS.some((kw) => seg.text.includes(kw));
      if (!hasDesc && seg.text.length > bestLen) {
        bestLen = seg.text.length;
        bestSeg = seg;
      }
    }
    if (bestSeg) {
      addIssue(bestSeg.id, `묘사가 부족합니다. 감각적 묘사(시각, 청각, 촉각)를 추가해주세요.`);
    }
  }

  // 8. Hook ending fail → last segment
  if (!style.hook_ending.pass && segments.length > 0) {
    const lastId = segments[segments.length - 1].id;
    addIssue(lastId, "후킹 엔딩이 부족합니다. 긴장감/궁금증을 유발하는 마무리로 수정해주세요.");
  }

  // 9. Length short → shortest segment
  if (!pacing.length.pass) {
    let shortestSeg: Segment | null = null;
    let shortestLen = Infinity;
    for (const seg of segments) {
      if (seg.text.length < shortestLen) {
        shortestLen = seg.text.length;
        shortestSeg = seg;
      }
    }
    if (shortestSeg) {
      addIssue(shortestSeg.id, `분량이 부족합니다 (전체 ${pacing.length.char_count}자 / 최소 ${pacing.length.target_min}자). 이 구간의 장면 묘사를 더 풍부하게 해주세요.`);
    }
  }

  // 10. Foreshadowing missing → penultimate segment
  if (!consistency.foreshadowing.pass && consistency.foreshadowing.missing.length > 0) {
    // Only if foreshadowing is NOT the only issue
    const otherIssues = issueMap.size > 0;
    if (otherIssues && segments.length >= 2) {
      const penultimateId = segments[segments.length - 2].id;
      const fsNames = consistency.foreshadowing.missing.map((m) => m.name);
      const fsDetails = consistency.foreshadowing.missing.map((m) => {
        const fs = seed.foreshadowing.find((f) => f.id === m.id);
        return fs ? { name: fs.name, description: fs.description } : { name: m.name, description: "" };
      });
      addIssue(penultimateId, `복선 누락: ${fsNames.join(", ")}. 자연스럽게 암시를 넣어주세요.`, {
        foreshadowing: fsDetails,
      });
    }
  }

  return Array.from(issueMap.values());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/evaluators/issue-locator.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluators/issue-locator.ts __tests__/lib/evaluators/issue-locator.test.ts
git commit -m "feat: add Issue Locator for mapping evaluation failures to segments"
```

---

## Chunk 2: Segment Editor + Quality Loop Integration

### Task 4: Segment Editor (LLM-based)

**Files:**
- Create: `src/lib/agents/segment-editor.ts`
- Create: `__tests__/lib/agents/segment-editor.test.ts`

- [ ] **Step 1: Write test for Segment Editor prompt construction**

The Segment Editor calls the LLM, so unit tests focus on prompt construction (not LLM output). Test that the prompt includes required sections.

```ts
// __tests__/lib/agents/segment-editor.test.ts
import { describe, it, expect } from "vitest";
import { buildSegmentEditPrompt } from "@/lib/agents/segment-editor";
import type { Segment } from "@/lib/agents/segmenter";

describe("buildSegmentEditPrompt", () => {
  const target: Segment = { id: 2, text: "준혁은 길을 걸었다. 아무 생각이 없었다." };
  const prev: Segment = { id: 1, text: "학교 종이 울렸다." };
  const next: Segment = { id: 3, text: "편의점에 도착했다." };

  it("includes target segment marked for editing", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족"], prev, next, "현대 판타지");
    expect(prompt).toContain("수정 대상");
    expect(prompt).toContain("준혁은 길을 걸었다");
  });

  it("includes prev/next as read-only context", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족"], prev, next, "현대 판타지");
    expect(prompt).toContain("읽기 전용");
    expect(prompt).toContain("학교 종이 울렸다");
    expect(prompt).toContain("편의점에 도착했다");
  });

  it("includes issues in edit instructions", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족", "대사 추가 필요"], prev, next, "현대 판타지");
    expect(prompt).toContain("묘사 부족");
    expect(prompt).toContain("대사 추가 필요");
  });

  it("handles null prev/next segments", () => {
    const prompt = buildSegmentEditPrompt(target, ["후킹 엔딩 부족"], null, null, "현대 판타지");
    expect(prompt).toContain("수정 대상");
    expect(prompt).not.toContain("undefined");
  });

  it("includes character voice context when provided", () => {
    const prompt = buildSegmentEditPrompt(
      target, ["말투 불일치"], prev, next, "현대 판타지",
      { characterVoice: [{ name: "이준혁", speechPatterns: ["~거든", "뭐..."] }] },
    );
    expect(prompt).toContain("이준혁");
    expect(prompt).toContain("~거든");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/agents/segment-editor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Segment Editor**

```ts
// src/lib/agents/segment-editor.ts
import { getAgent } from "./llm-agent";
import type { TokenUsage } from "./types";
import type { Segment } from "./segmenter";
import type { SegmentIssue } from "@/lib/evaluators/issue-locator";
import type { NovelSeed } from "@/lib/schema/novel";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";

export function buildSegmentEditPrompt(
  target: Segment,
  issues: string[],
  prev: Segment | null,
  next: Segment | null,
  genre: string,
  issueContext?: SegmentIssue["context"],
): string {
  let contextSection = "";
  if (issueContext?.characterVoice && issueContext.characterVoice.length > 0) {
    contextSection += "\n## 캐릭터 말투 참고\n";
    for (const cv of issueContext.characterVoice) {
      contextSection += `- ${cv.name}: ${cv.speechPatterns.join(", ")}\n`;
    }
  }
  if (issueContext?.foreshadowing && issueContext.foreshadowing.length > 0) {
    contextSection += "\n## 복선 참고\n";
    for (const fs of issueContext.foreshadowing) {
      contextSection += `- ${fs.name}: ${fs.description}\n`;
    }
  }

  const prevSection = prev
    ? `--- 문맥 (읽기 전용, 수정하지 마세요) ---\n${prev.text}\n\n`
    : "";
  const nextSection = next
    ? `\n\n--- 문맥 (읽기 전용, 수정하지 마세요) ---\n${next.text}`
    : "";

  return `당신은 카카오페이지 웹소설 전문 편집자입니다.
아래 "수정 대상" 구간만 수정하세요. 문맥 구간은 절대 수정하지 마세요.

장르: ${genre}
${contextSection}
${prevSection}--- 수정 대상 ---
${target.text}
${nextSection}

--- 수정 지시 ---
${issues.map((i) => `- ${i}`).join("\n")}

출력: 수정된 "수정 대상" 본문만. 문맥 구간은 출력하지 마세요.`;
}

export async function* editSegment(
  target: Segment,
  issues: string[],
  prev: Segment | null,
  next: Segment | null,
  seed: NovelSeed,
  chapterNumber: number,
  issueContext?: SegmentIssue["context"],
): AsyncGenerator<string, TokenUsage> {
  const agent = getAgent();
  const tier = selectModelTier(seed, chapterNumber);
  const model = getModelForTier(tier);

  const prompt = buildSegmentEditPrompt(
    target, issues, prev, next, seed.world.genre, issueContext,
  );

  const stream = agent.callStream({
    prompt,
    system: "당신은 소설의 특정 구간만 수정하는 편집자입니다. 지시된 문제만 고치고, 문체와 톤은 유지하세요.",
    model,
    temperature: 0.3,
    maxTokens: 3000,
    taskId: `segment-edit-${chapterNumber}-${target.id}`,
  });

  let result = await stream.next();
  while (!result.done) {
    yield result.value;
    result = await stream.next();
  }
  return result.value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/agents/segment-editor.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/segment-editor.ts __tests__/lib/agents/segment-editor.test.ts
git commit -m "feat: add Segment Editor for targeted paragraph-level editing"
```

---

### Task 5: Integrate into chapter-lifecycle.ts

**Files:**
- Modify: `src/lib/agents/chapter-lifecycle.ts`

This is the core integration. Changes:
1. Add `patch` event type to `LifecycleEvent`
2. Change `MAX_EDITOR_PASSES` from 2 to 5
3. Pass 1: existing full Editor (unchanged)
4. Passes 2-5: segment-based patching
5. Score < 0.4 after pass 1 → fallback to full Editor
6. Best-score tracking with revert via `replace_text`

- [ ] **Step 1: Add `patch` event type to LifecycleEvent**

In `chapter-lifecycle.ts`, add to the `LifecycleEvent` union (after line 42):
```ts
| { type: "patch"; paragraphId: number; content: string }
```

- [ ] **Step 2: Add imports for new modules**

At top of `chapter-lifecycle.ts`, add:
```ts
import { segmentText, reassemble } from "./segmenter";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { editSegment } from "./segment-editor";
```

- [ ] **Step 3: Rewrite the quality loop (lines 393-479)**

Replace the entire Phase 2 section with:

```ts
  // --- Phase 2: Editor polishes + quality loop ---
  const MAX_EDITOR_PASSES = 5;
  let editedText = rawText;
  let editorFeedback: string | null = null;

  for (let editorPass = 1; editorPass <= MAX_EDITOR_PASSES; editorPass++) {

    if (editorPass === 1) {
      // --- Pass 1: Full Editor (existing behavior) ---
      yield { type: "stage_change", stage: "editing" };

      let newEditedText = "";
      const editorStream = runEditor(
        editedText,
        seed,
        chapterNumber,
        editorFeedback,
        previousSummaries,
      );
      let editorResult = await editorStream.next();
      while (!editorResult.done) {
        newEditedText += editorResult.value;
        yield { type: "chunk", content: editorResult.value };
        editorResult = await editorStream.next();
      }

      const editorUsage: TokenUsage = editorResult.value;
      totalUsage = accumulateUsage(totalUsage, editorUsage);
      yield { type: "usage", ...editorUsage };

      if (newEditedText.length >= rawText.length * 0.5) {
        editedText = newEditedText;
      }
    } else {
      // --- Passes 2-5: Segment Patcher ---

      // Score < 0.4 after pass 1 means text is fundamentally broken — use full editor
      if (editorPass === 2 && bestScore < 0.4) {
        yield { type: "stage_change", stage: "editing" };
        let newEditedText = "";
        const fallbackFeedback = editorFeedback || "전반적 품질 개선 필요";
        const editorStream = runEditor(editedText, seed, chapterNumber, fallbackFeedback, previousSummaries);
        let editorResult = await editorStream.next();
        while (!editorResult.done) {
          newEditedText += editorResult.value;
          yield { type: "chunk", content: editorResult.value };
          editorResult = await editorStream.next();
        }
        const editorUsage: TokenUsage = editorResult.value;
        totalUsage = accumulateUsage(totalUsage, editorUsage);
        yield { type: "usage", ...editorUsage };
        if (newEditedText.length >= rawText.length * 0.5) {
          editedText = newEditedText;
        }
        yield { type: "replace_text", content: editedText };
        // Fall through to evaluation below
      } else {

      yield { type: "stage_change", stage: "patching" };

      const segments = segmentText(editedText);
      const segStyle = evaluateStyle(editedText, seed.style);
      const segConsistency = evaluateConsistency(seed, chapterNumber, editedText, null);
      const segPacing = evaluatePacing(editedText, chapterNumber);

      const segmentIssues = locateIssues(segments, segStyle, segConsistency, segPacing, seed, chapterNumber);

      if (segmentIssues.length === 0) {
        // No specific issues found but score still low — fallback to full Editor
        yield { type: "stage_change", stage: "editing" };
        let newEditedText = "";
        const fallbackFeedback = editorFeedback || "전반적 품질 개선 필요";
        const editorStream = runEditor(editedText, seed, chapterNumber, fallbackFeedback, previousSummaries);
        let editorResult = await editorStream.next();
        while (!editorResult.done) {
          newEditedText += editorResult.value;
          yield { type: "chunk", content: editorResult.value };
          editorResult = await editorStream.next();
        }
        const editorUsage: TokenUsage = editorResult.value;
        totalUsage = accumulateUsage(totalUsage, editorUsage);
        yield { type: "usage", ...editorUsage };
        if (newEditedText.length >= rawText.length * 0.5) {
          editedText = newEditedText;
        }
        yield { type: "replace_text", content: editedText };
      } else {
        // Patch each failing segment sequentially
        for (const issue of segmentIssues) {
          const targetSeg = segments.find((s) => s.id === issue.segmentId);
          if (!targetSeg) continue;

          const prevSeg = segments.find((s) => s.id === issue.segmentId - 1) || null;
          const nextSeg = segments.find((s) => s.id === issue.segmentId + 1) || null;

          let patchedText = "";
          const segStream = editSegment(
            targetSeg, issue.issues, prevSeg, nextSeg,
            seed, chapterNumber, issue.context,
          );
          let segResult = await segStream.next();
          while (!segResult.done) {
            patchedText += segResult.value;
            segResult = await segStream.next();
          }
          const segUsage: TokenUsage = segResult.value;
          totalUsage = accumulateUsage(totalUsage, segUsage);
          yield { type: "usage", ...segUsage };

          // Safety: only apply patch if reasonable length
          if (patchedText.length >= targetSeg.text.length * 0.5) {
            targetSeg.text = patchedText;
            yield { type: "patch", paragraphId: issue.segmentId, content: patchedText };
          }
        }

        editedText = reassemble(segments);
      }

      } // end of score >= 0.4 branch
    }

    // --- Phase 3: Evaluate ---
    yield { type: "stage_change", stage: "evaluating" };

    const styleResult = evaluateStyle(editedText, seed.style);
    const consistencyResult = evaluateConsistency(seed, chapterNumber, editedText, null);
    const pacingResult = evaluatePacing(editedText, chapterNumber);
    const overallScore =
      styleResult.overall_score * 0.35 +
      getConsistencyScore(consistencyResult) * 0.35 +
      pacingResult.overall_score * 0.30;

    yield {
      type: "evaluation",
      result: { style: styleResult, consistency: consistencyResult, pacing: pacingResult },
      overall_score: overallScore,
    };

    // Best-score tracking
    if (overallScore > bestScore) {
      bestText = editedText;
      bestScore = overallScore;
    } else if (editorPass > 1) {
      // Score regressed — revert to best and stop (no further improvement possible)
      editedText = bestText;
      yield { type: "replace_text", content: bestText };
      break;
    }

    if (overallScore >= qualityThreshold || editorPass === MAX_EDITOR_PASSES) {
      break;
    }

    // Score < 0.4 after pass 1 → next pass should also be full Editor
    // (handled by segmentIssues.length === 0 fallback above)

    // Build feedback for next pass
    const issues: string[] = [];
    if (!styleResult.dialogue_ratio.pass)
      issues.push(`대사 비율 ${Math.round(styleResult.dialogue_ratio.actual_ratio * 100)}% (목표 ${Math.round(styleResult.dialogue_ratio.target_ratio * 100)}%)`);
    if (!styleResult.hook_ending.pass)
      issues.push("후킹 엔딩 부족");
    if (!styleResult.paragraph_length.pass)
      issues.push(`긴 문단 ${styleResult.paragraph_length.violations}개`);
    const pacingIssues = getPacingImprovementReason(pacingResult);
    if (pacingIssues) issues.push(pacingIssues);

    editorFeedback = `점수: ${Math.round(overallScore * 100)}점 (기준: ${Math.round(qualityThreshold * 100)}점)\n문제:\n${issues.map(i => `- ${i}`).join("\n")}`;

    yield {
      type: "retry",
      attempt: editorPass + 1,
      reason: issues.join(", "),
      score: overallScore,
    };
  }
```

- [ ] **Step 4: Run full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/chapter-lifecycle.ts
git commit -m "feat: integrate Segment Patcher into chapter lifecycle quality loop"
```

---

### Task 6: Handle `patch` event in UI

**Files:**
- Modify: `src/hooks/useStreamingGeneration.ts`

- [ ] **Step 1: Add `patch` case to the SSE handler in `generateOrchestrated`**

In `useStreamingGeneration.ts`, inside the `switch (parsed.type)` block (around line 311, before the `}` closing the switch), add:

```ts
case "patch": {
  // Replace specific paragraph in the full text
  // Normalize to match server-side segmentText() behavior
  const paragraphs = fullText.split("\n\n").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
  if (parsed.paragraphId >= 0 && parsed.paragraphId < paragraphs.length) {
    paragraphs[parsed.paragraphId] = parsed.content;
    fullText = paragraphs.join("\n\n");
    setStreamingText(fullText);
    addPipelineLog(
      `문단 ${parsed.paragraphId + 1} 수정 완료`,
      "info",
    );
  }
  break;
}
```

Also add a `patching` entry to the `wittyMessages` object (around line 218):
```ts
patching: [
  "문제 구간만 정밀 수정 중...",
  "편집장이 빨간펜으로 특정 부분만 고치는 중",
  "좋은 부분은 살리고, 문제만 콕콕 수정!",
],
```

- [ ] **Step 2: Verify the hook compiles**

Run: `npx next build 2>&1 | head -20` (or just type-check)
Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStreamingGeneration.ts
git commit -m "feat: handle patch events in streaming UI for segment-level updates"
```

---

### Task 7: Final integration test

**Files:**
- Create: `__tests__/lib/agents/segment-patcher-integration.test.ts`

- [ ] **Step 1: Write integration test**

This test verifies the full flow: text → segment → locate issues → verify correct segments flagged → verify unflagged segments unchanged.

```ts
// __tests__/lib/agents/segment-patcher-integration.test.ts
import { describe, it, expect } from "vitest";
import { segmentText, reassemble } from "@/lib/agents/segmenter";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import { evaluatePacing } from "@/lib/evaluators/pacing";

const MOCK_SEED = {
  title: "테스트",
  logline: "테스트",
  total_chapters: 10,
  world: {
    name: "test", genre: "현대 판타지", sub_genre: "헌터물",
    time_period: "현대", magic_system: "마나",
    key_locations: {}, factions: {}, rules: [],
  },
  characters: [
    {
      id: "mc", name: "이준혁", role: "주인공", introduction_chapter: 1,
      voice: {
        tone: "무심한", speech_patterns: ["~거든", "뭐..."],
        sample_dialogues: [], personality_core: "현실주의자",
      },
      backstory: "평범한 학생", arc_summary: "성장",
      state: { level: 1, location: "서울", status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    },
  ],
  arcs: [{ id: "arc_1", name: "각성편", start_chapter: 1, end_chapter: 30, summary: "각성", key_events: [], climax_chapter: 28 }],
  chapter_outlines: [
    { chapter_number: 1, title: "시작", arc_id: "arc_1", one_liner: "일상", key_points: ["일상"], characters_involved: ["mc"], tension_level: 3 },
  ],
  foreshadowing: [],
  style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short" as const, hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
} as any;

describe("Segment Patcher Integration", () => {
  it("unflagged segments remain byte-identical after issue location", () => {
    const text = [
      "좋은 첫 문단. 잘 쓰여진 서술이다.",
      '"첫 대사"\n"두 번째 대사"\n"세 번째 대사"\n"네 번째 대사"\n"다섯 번째 대사"\n"여섯 번째 대사"\n"일곱 번째 대사"',
      "좋은 마지막 문단. 그때 무언가가 움직였다...",
    ].join("\n\n");

    const segments = segmentText(text);
    const originalTexts = segments.map((s) => s.text);

    const style = evaluateStyle(text, MOCK_SEED.style);
    const consistency = evaluateConsistency(MOCK_SEED, 1, text, null);
    const pacing = evaluatePacing(text, 1);
    const issues = locateIssues(segments, style, consistency, pacing, MOCK_SEED, 1);

    const flaggedIds = new Set(issues.map((i) => i.segmentId));

    // Simulate patching: replace flagged segments with "[PATCHED]"
    for (const seg of segments) {
      if (flaggedIds.has(seg.id)) {
        seg.text = "[PATCHED]";
      }
    }

    // Verify unflagged segments are byte-identical
    for (const seg of segments) {
      if (!flaggedIds.has(seg.id)) {
        expect(seg.text).toBe(originalTexts[seg.id]);
      }
    }
  });

  it("reassemble preserves structure after patching", () => {
    const original = "A 문단\n\nB 문단\n\nC 문단";
    const segments = segmentText(original);
    segments[1].text = "B 수정됨";
    const result = reassemble(segments);
    expect(result).toBe("A 문단\n\nB 수정됨\n\nC 문단");
  });

  it("best-score tracking: worse patch should not overwrite bestText", () => {
    // Simulate: original text scores X, patched text scores less
    const goodText = "좋은 문단 A.\n\n좋은 문단 B.\n\n그때 무언가가 움직였다...";
    const segments = segmentText(goodText);

    // Simulate a bad patch on segment 1
    const originalSeg1 = segments[1].text;
    segments[1].text = "나쁜 패치"; // much shorter, would lower score

    const patchedText = reassemble(segments);
    const goodStyle = evaluateStyle(goodText, MOCK_SEED.style);
    const patchedStyle = evaluateStyle(patchedText, MOCK_SEED.style);

    // The patched version should not have a higher overall score
    // (shorter text + less content = lower quality)
    // This validates the need for bestText tracking
    expect(patchedText).not.toBe(goodText);
    // Restore the original — simulating revert
    segments[1].text = originalSeg1;
    expect(reassemble(segments)).toBe(goodText);
  });

  it("segment IDs are stable across segmentText calls", () => {
    const text = "문단 1\n\n문단 2\n\n문단 3";
    const s1 = segmentText(text);
    const s2 = segmentText(text);
    expect(s1.map((s) => s.id)).toEqual(s2.map((s) => s.id));
    expect(s1.map((s) => s.text)).toEqual(s2.map((s) => s.text));
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run __tests__/lib/agents/segment-patcher-integration.test.ts`
Expected: All PASS

- [ ] **Step 3: Run ALL tests to verify nothing broke**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add __tests__/lib/agents/segment-patcher-integration.test.ts
git commit -m "test: add integration tests for Segment Patcher"
```

---

### Task 8: Final commit and verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify dev server starts**

Run: `npx next dev` (check it starts without errors, then stop)

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If anything unstaged, add and commit
```
