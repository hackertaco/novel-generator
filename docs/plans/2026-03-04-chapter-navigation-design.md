# Chapter Navigation + Plot Backtracking Design

## Problem
- Reader has no way to go back to plot selection
- No visual feedback when chapters are saved
- Chapter viewing abuses `streamingText` state

## Solution

### 1. New `/chapters` page
- Novel title display
- Card list: chapter title + char count + saved badge
- Click card → `/reader?chapter=N`
- "다음 화 생성" → navigates to `/reader` (generation happens there only)
- "← 플롯 선택으로" → `resetToPlotSelection()` + navigate `/plot`

### 2. Modified `/reader` page
- Add `viewingChapter` state (replaces `streamingText` hack)
- URL sync via `useSearchParams` for `?chapter=N`
- "← 목록으로" button → `/chapters`
- Simplify sidebar: remove chapter list, add prev/next buttons
- No auto-redirect after generation (user reads, then navigates manually)

### 3. Store changes (`useNovelStore.ts`)
- Add `viewingChapter: number | null` + `setViewingChapter()`
- Add `resetToPlotSelection()`: preserves `genre` + `plots`, resets everything else via `...initialState`

## Files
- `web/src/hooks/useNovelStore.ts` — 2 new actions + 1 new state
- `web/src/app/reader/page.tsx` — viewingChapter, URL sync, simplified sidebar
- `web/src/app/chapters/page.tsx` — NEW chapter list page
