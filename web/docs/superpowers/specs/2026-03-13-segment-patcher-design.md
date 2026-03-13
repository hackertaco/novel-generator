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
  context?: {        // issue-specific context for the Segment Editor
    characterVoice?: { name: string; speechPatterns: string[] }[];
    foreshadowing?: { name: string; description: string }[];
  };
}

function locateIssues(
  segments: Segment[],
  style: StyleResult,
  consistency: ConsistencyResult,
  pacing: PacingResult,
  seed: NovelSeed,
  chapterNumber: number,
): SegmentIssue[]
```

**Critical design decision**: The Issue Locator does NOT rely on evaluator return values for position information. Instead, it **re-scans segments directly** using the same patterns/logic the evaluators use. This avoids coupling to evaluator internals and handles cross-segment boundary cases correctly.

#### Location-specific issues (re-scanned per segment)

| Evaluator metric | How to find the segment |
|-----------------|------------------------|
| `dialogue_pacing` | Re-run consecutive dialogue line count **per segment** (not from evaluator result). Flag segments where count >= 5. |
| `paragraph_length` | Re-run sentence split (`/[.!?]\s+/`) per segment. Flag segments exceeding `seed.style.max_paragraph_length`. |
| `character_voice` | Use `ConsistencyResult.character_voice.issues` which contains `character` name and `dialogue` snippet. Match snippet text to segment via `includes()`. Attach matching character's `speech_patterns` to `context.characterVoice`. |
| `time_jumps` | Re-scan segments using `TIME_JUMP_PATTERNS` (exported from `pacing.ts`). Flag segments containing matches. |
| `early_chapter_pacing` | Re-scan segments using `POWER_UP_PATTERNS` and `CLIMAX_PATTERNS` (exported from `pacing.ts`). Flag segments containing matches. |

#### Ratio-based issues (inferred mapping)

| Evaluator metric | How to pick the segment |
|-----------------|------------------------|
| `dialogue_ratio` low | Longest narration-only segment (most room to add dialogue) |
| `description_ratio` low | Longest segment with zero `DESCRIPTIVE_KEYWORDS` hits (exported from `pacing.ts`) |
| `hook_ending` fail | Last segment |
| `length` short | Shortest segment (most room to expand) |

#### Foreshadowing (special case)

Missing foreshadowing (`ConsistencyResult.foreshadowing.missing`) is content that doesn't exist yet, so it cannot be pinned to any segment. Strategy:
- Assign foreshadowing insertion to the **penultimate segment** (natural place for subtle hints before a chapter-ending hook)
- Attach foreshadowing name + description to `context.foreshadowing` so the Segment Editor knows what to weave in
- If foreshadowing is the **only** failing metric, skip segment patching entirely — a single missing keyword rarely justifies a rewrite

#### Required exports from evaluators

The following constants must be exported from `pacing.ts`:
- `POWER_UP_PATTERNS`
- `CLIMAX_PATTERNS`
- `TIME_JUMP_PATTERNS`
- `DESCRIPTIVE_KEYWORDS`

### 3. Segment Editor (`src/lib/agents/segment-editor.ts`)

```ts
async function* editSegment(
  target: Segment,
  issues: string[],
  prevSegment: Segment | null,
  nextSegment: Segment | null,
  seed: NovelSeed,
  chapterNumber: number,
  issueContext?: SegmentIssue["context"],
): AsyncGenerator<string, TokenUsage>
```

#### Prompt structure

```
당신은 카카오페이지 웹소설 전문 편집자입니다.
아래 "수정 대상" 구간만 수정하세요. 문맥 구간은 절대 수정하지 마세요.

장르: {seed.world.genre}

{issueContext가 있으면:}
## 참고 정보
{characterVoice가 있으면: 캐릭터별 이름 + 말투 패턴}
{foreshadowing이 있으면: 복선 이름 + 설명}

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

#### Token budget

- `maxTokens: 3000` per segment edit (typical segment is 200-500 chars, output should be similar length)
- Sequential execution for initial implementation (simpler, predictable token usage)
- Parallel execution can be added later as optimization

### 4. Quality Loop Changes (`chapter-lifecycle.ts`)

```
MAX_EDITOR_PASSES: 2 → 5

Pass 1: Full Editor (existing behavior, streams to UI)
Pass 2-5: Segment Patcher
  - Segment text
  - Locate issues from evaluation
  - Edit failing segments only (sequentially)
  - Reassemble and emit patch events
  - Re-evaluate
  - Break if passes or reaches max
```

#### Best-score tracking and revert

- `bestText` and `bestScore` are updated after each complete patch round (all segments patched + reassembled), not per individual segment
- If overall score regresses after a patch round: revert `editedText` to `bestText` and emit `{ type: "replace_text", content: bestText }` to reset UI to the last good version
- No `revert_patch` event needed — `replace_text` already exists and handles full replacement

### 5. Event Types

New event added to chapter lifecycle yield types:

```ts
| { type: "patch"; paragraphId: number; content: string }
```

- Emitted after each segment is patched during passes 2-5
- UI contract: the frontend must render paragraphs as an indexed array (split on `\n\n`). `paragraphId` corresponds to the segment index. The UI replaces the paragraph at that index with the new `content`.
- Existing events (`retry`, `evaluation`, `stage_change`, `replace_text`) remain unchanged

## Configuration

| Setting | Old | New |
|---------|-----|-----|
| `MAX_EDITOR_PASSES` | 2 | 5 |
| Pass 1 behavior | Full rewrite | Full rewrite (unchanged) |
| Pass 2-5 behavior | Full rewrite | Segment patch |
| Segment Editor maxTokens | N/A | 3000 |

## Error Handling

- If Issue Locator finds 0 issues but score is still below threshold: fall back to full Editor for that pass (edge case where metrics disagree)
- If a patched segment is less than 50% of original length: revert that segment to pre-patch version (safety check, same as existing `rawText.length * 0.5` guard)
- If overall score < 0.4 after pass 1: fall back to full Editor for pass 2 (text is fundamentally broken, segment patching won't help)
- If foreshadowing is the only failing metric: skip segment patching, accept as-is (single keyword absence doesn't justify rewrite)

## Testing Strategy

- Unit tests for Segmenter: split/reassemble roundtrip, empty segments filtered, single-paragraph text
- Unit tests for Issue Locator: mock evaluation results → correct segment IDs for each metric type
- Unit tests for Issue Locator: cross-segment dialogue runs handled correctly
- Integration test: full lifecycle with known-bad text → verify only flagged segments change, unflagged segments byte-identical
- Regression: existing tests must still pass (pass 1 behavior unchanged)
- Revert test: inject a patch that lowers score → verify bestText is restored
