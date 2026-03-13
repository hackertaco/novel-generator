# Segment Patcher: Targeted Quality Improvement System

## Problem

Current editor rewrites the entire chapter text on each quality retry, which:
- Destroys well-written sections that already pass quality checks
- Wastes tokens re-generating good content
- Limits retry count (currently 2) because each pass is expensive
- Makes quality improvement unpredictable — good parts can degrade

## Solution

Replace the "full rewrite on retry" loop with a **segment-based patch system** that identifies failing paragraphs and surgically fixes only those, preserving everything else.

## Architecture

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Segmenter | `src/lib/agents/segmenter.ts` | Split text into paragraphs, reassemble after patches |
| Issue Locator | `src/lib/evaluators/issue-locator.ts` | Map evaluation failures to specific paragraph IDs |
| Segment Editor | `src/lib/agents/segment-editor.ts` | LLM-based targeted editing of individual paragraphs |
| Quality Loop | `src/lib/agents/chapter-lifecycle.ts` (modified) | Orchestrate full-edit → segment-patch flow |

### Flow

```
Writer → Draft
    ↓
[Pass 1: Full Editor] — existing whole-text editor, streams to UI
    ↓
[Evaluate] — Style + Consistency + Pacing
    ↓
Pass? → Yes → Done
    ↓ No
[Issue Locator] — map failures to paragraph IDs
    ↓
[Segment Editor] — patch only failing paragraphs (with ±1 paragraph context)
    ↓
[Reassemble] — insert patches, emit patch events to UI
    ↓
[Re-evaluate] — pass or loop (max 4 more times, 5 total)
```

## Component Details

### 1. Segmenter (`src/lib/agents/segmenter.ts`)

```ts
interface Segment {
  id: number;
  text: string;
}

function segmentText(text: string): Segment[]
function reassemble(segments: Segment[]): string
```

- Splits on `\n\n` (Korean novel paragraph convention)
- Preserves segment IDs for patch targeting
- `reassemble()` joins with `\n\n`

### 2. Issue Locator (`src/lib/evaluators/issue-locator.ts`)

```ts
interface SegmentIssue {
  segmentId: number;
  issues: string[];  // human-readable descriptions for Editor prompt
}

function locateIssues(
  segments: Segment[],
  style: StyleResult,
  consistency: ConsistencyResult,
  pacing: PacingResult,
  chapterNumber: number,
): SegmentIssue[]
```

#### Location-specific issues (auto-mapped to segments)

| Evaluator metric | How to find the segment |
|-----------------|------------------------|
| `dialogue_pacing` | Find segments with 5+ consecutive dialogue lines |
| `paragraph_length` | Find segments exceeding max sentence count |
| `character_voice` | Find segments containing mismatched dialogue |
| `time_jumps` | Find segments containing time-jump markers |
| `early_chapter_pacing` | Find segments with power-up/climax patterns |

#### Ratio-based issues (inferred mapping)

| Evaluator metric | How to pick the segment |
|-----------------|------------------------|
| `dialogue_ratio` low | Longest narration-only segment (most room to add dialogue) |
| `description_ratio` low | Longest segment with zero descriptive keywords |
| `hook_ending` fail | Last segment |
| `length` short | Shortest segment (most room to expand) |

### 3. Segment Editor (`src/lib/agents/segment-editor.ts`)

```ts
async function* editSegment(
  target: Segment,
  issues: string[],
  prevSegment: Segment | null,
  nextSegment: Segment | null,
  seed: NovelSeed,
  chapterNumber: number,
): AsyncGenerator<string, TokenUsage>
```

#### Prompt structure

```
당신은 소설 편집자입니다. 아래 "수정 대상" 구간만 수정하세요.

--- 문맥 (읽기 전용) ---
{prevSegment.text}

--- 수정 대상 ---
{target.text}

--- 문맥 (읽기 전용) ---
{nextSegment.text}

--- 수정 지시 ---
{issues joined by newlines}

출력: 수정된 "수정 대상" 본문만. 문맥 구간은 출력하지 마세요.
```

- Each segment is edited independently
- Parallelizable when multiple segments have issues
- Uses same model tier as the full Editor

### 4. Quality Loop Changes (`chapter-lifecycle.ts`)

```
MAX_EDITOR_PASSES: 2 → 5

Pass 1: Full Editor (existing behavior, streams to UI)
Pass 2-5: Segment Patcher
  - Segment text
  - Locate issues from evaluation
  - Edit failing segments only
  - Reassemble and emit patch events
  - Re-evaluate
  - Break if passes or reaches max
```

Best-score tracking remains: if score regresses on a patch pass, revert to previous best.

### 5. Event Types

New event added to chapter lifecycle yield types:

```ts
| { type: "patch"; paragraphId: number; content: string }
```

- Emitted after each segment is patched
- UI replaces the corresponding paragraph with new content
- Existing events (`retry`, `evaluation`, `stage_change`) remain unchanged

## Configuration

| Setting | Old | New |
|---------|-----|-----|
| `MAX_EDITOR_PASSES` | 2 | 5 |
| Pass 1 behavior | Full rewrite | Full rewrite (unchanged) |
| Pass 2-5 behavior | Full rewrite | Segment patch |

## Error Handling

- If Issue Locator finds 0 issues but score is still below threshold: fall back to full Editor for that pass (edge case where metrics disagree)
- If a patched segment is less than 50% of original length: revert that segment (safety check, same as existing `rawText.length * 0.5` guard)
- If all segments have issues (>80% of segments flagged): fall back to full Editor (not worth patching if almost everything is broken)

## Testing Strategy

- Unit tests for Segmenter: split/reassemble roundtrip
- Unit tests for Issue Locator: mock evaluation results → correct segment IDs
- Integration test: full lifecycle with known-bad text → verify only flagged segments change
- Regression: existing tests must still pass (pass 1 behavior unchanged)
