import type { NovelSeed, PlotArc } from "@/lib/schema/novel";
import { getArcForChapter, getForeshadowingActions } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterMemory {
  chapter: number;
  title: string;
  summary: string; // 1-2 sentences
  key_events: string[]; // major plot events
  character_changes: Array<{ characterId: string; change: string }>;
  active_threads: string[]; // narrative threads introduced/advanced
  foreshadowing_actions: Array<{
    id: string;
    action: "plant" | "hint" | "reveal";
  }>;
}

export interface MemorySnapshot {
  /** Layer 1: Global (always included, ~100 tokens) */
  global_summary: string;

  /** Layer 2: Current Part (~200 tokens) */
  current_part_summary: string;

  /** Layer 3: Current Arc (~300 tokens) */
  current_arc_summary: string;
  current_arc_progress: string; // e.g. "아크1 10화 중 7화 완료"

  /** Layer 4: Recent chapters (~600 tokens) — last 3 only */
  recent_chapters: Array<{
    chapter: number;
    summary: string;
  }>;

  /** Layer 5: Relevant characters (~800 tokens) */
  relevant_characters: Array<{
    name: string;
    current_state: string;
    voice_tone: string;
  }>;

  /** Layer 6: Active foreshadowing (~400 tokens) */
  active_foreshadowing: Array<{
    name: string;
    status: string;
    relevance: string;
  }>;
}

// ---------------------------------------------------------------------------
// Token-budget constants (in approximate Korean chars; 1 token ~ 4 chars)
// ---------------------------------------------------------------------------

const LAYER_CHAR_LIMITS: Record<string, number> = {
  global: 400, // ~100 tokens
  part: 800, // ~200 tokens
  arc: 1200, // ~300 tokens
  recent: 2400, // ~600 tokens
  characters: 3200, // ~800 tokens
  foreshadowing: 1600, // ~400 tokens
};

const TOTAL_CHAR_LIMIT = 12000; // ~3000 tokens

// ---------------------------------------------------------------------------
// HierarchicalMemory
// ---------------------------------------------------------------------------

export class HierarchicalMemory {
  private chapters: Map<number, ChapterMemory> = new Map();

  /** Record a completed chapter. */
  addChapter(memory: ChapterMemory): void {
    this.chapters.set(memory.chapter, memory);
  }

  /** Bulk-load previously recorded chapters (e.g. after deserialization). */
  loadChapters(memories: ChapterMemory[]): void {
    for (const m of memories) {
      this.chapters.set(m.chapter, m);
    }
  }

  /** How many chapters are stored. */
  get size(): number {
    return this.chapters.size;
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  /** Build a context snapshot for writing chapter `chapterNumber`. */
  getSnapshot(chapterNumber: number, seed: NovelSeed): MemorySnapshot {
    const currentArc = getArcForChapter(seed, chapterNumber);

    // -- Layer 1: global summary (compress everything before the current part)
    const global_summary = this.compressMemories(
      this.getChaptersBefore(currentArc?.start_chapter ?? chapterNumber),
      "global",
    );

    // -- Layer 2: current part summary
    const partArcs = this.findPartArcs(seed, chapterNumber);
    const partChapters = this.getChaptersInRange(
      partArcs[0]?.start_chapter ?? 1,
      currentArc?.start_chapter ?? chapterNumber,
    );
    const current_part_summary = this.compressMemories(partChapters, "part");

    // -- Layer 3: current arc summary + progress
    const arcChapters = currentArc
      ? this.getChaptersInRange(currentArc.start_chapter, chapterNumber)
      : [];
    const current_arc_summary = this.compressMemories(arcChapters, "arc");

    const arcTotal = currentArc
      ? currentArc.end_chapter - currentArc.start_chapter + 1
      : 0;
    const arcDone = arcChapters.length;
    const current_arc_progress = currentArc
      ? `${currentArc.name} ${arcTotal}화 중 ${arcDone}화 완료`
      : "";

    // -- Layer 4: last 3 chapters
    const recent_chapters = this.getRecentChapters(chapterNumber, 3).map(
      (ch) => ({
        chapter: ch.chapter,
        summary: ch.summary,
      }),
    );

    // -- Layer 5: relevant characters
    const outline = seed.chapter_outlines.find(
      (o) => o.chapter_number === chapterNumber,
    );
    const involvedIds = new Set(outline?.characters_involved ?? []);

    // If no outline exists, include characters that appeared in the last 3 chapters
    if (involvedIds.size === 0) {
      for (const ch of this.getRecentChapters(chapterNumber, 3)) {
        for (const cc of ch.character_changes) {
          involvedIds.add(cc.characterId);
        }
      }
    }

    const relevant_characters = seed.characters
      .filter(
        (c) =>
          involvedIds.has(c.id) ||
          (c.introduction_chapter <= chapterNumber && involvedIds.size === 0),
      )
      .map((c) => ({
        name: c.name,
        current_state: c.state.status,
        voice_tone: c.voice.tone,
      }));

    // -- Layer 6: active foreshadowing
    const fsActions = getForeshadowingActions(seed, chapterNumber);
    const active_foreshadowing: MemorySnapshot["active_foreshadowing"] =
      fsActions.map(({ foreshadowing: fs, action }) => ({
        name: fs.name,
        status: action as string,
        relevance: fs.description,
      }));

    // Also include planted-but-not-yet-revealed items that are close to reveal
    for (const fs of seed.foreshadowing) {
      if (
        fs.status === "planted" &&
        fs.reveal_at &&
        fs.reveal_at > chapterNumber &&
        fs.reveal_at <= chapterNumber + 5 &&
        !active_foreshadowing.some((a) => a.name === fs.name)
      ) {
        active_foreshadowing.push({
          name: fs.name,
          status: "곧 공개 예정",
          relevance: fs.description,
        });
      }
    }

    return {
      global_summary,
      current_part_summary,
      current_arc_summary,
      current_arc_progress,
      recent_chapters,
      relevant_characters,
      active_foreshadowing,
    };
  }

  // -----------------------------------------------------------------------
  // Format for prompt
  // -----------------------------------------------------------------------

  /** Format a MemorySnapshot as markdown prompt text (target ~3K tokens). */
  formatForPrompt(snapshot: MemorySnapshot): string {
    const sections: string[] = [];

    // Layer 1
    if (snapshot.global_summary) {
      sections.push(
        truncate(
          `## 전체 이야기 개요\n${snapshot.global_summary}`,
          LAYER_CHAR_LIMITS.global,
        ),
      );
    }

    // Layer 2
    if (snapshot.current_part_summary) {
      sections.push(
        truncate(
          `## 현재 파트 요약\n${snapshot.current_part_summary}`,
          LAYER_CHAR_LIMITS.part,
        ),
      );
    }

    // Layer 3
    if (snapshot.current_arc_summary) {
      sections.push(
        truncate(
          `## 현재 아크 요약\n${snapshot.current_arc_progress}\n${snapshot.current_arc_summary}`,
          LAYER_CHAR_LIMITS.arc,
        ),
      );
    }

    // Layer 4
    if (snapshot.recent_chapters.length > 0) {
      const lines = snapshot.recent_chapters
        .map((ch) => `- ${ch.chapter}화: ${ch.summary}`)
        .join("\n");
      sections.push(
        truncate(`## 최근 회차 요약\n${lines}`, LAYER_CHAR_LIMITS.recent),
      );
    }

    // Layer 5
    if (snapshot.relevant_characters.length > 0) {
      const lines = snapshot.relevant_characters
        .map(
          (c) =>
            `- **${c.name}**: 상태=${c.current_state}, 어조=${c.voice_tone}`,
        )
        .join("\n");
      sections.push(
        truncate(
          `## 등장 캐릭터 현황\n${lines}`,
          LAYER_CHAR_LIMITS.characters,
        ),
      );
    }

    // Layer 6
    if (snapshot.active_foreshadowing.length > 0) {
      const lines = snapshot.active_foreshadowing
        .map((f) => `- **${f.name}** [${f.status}]: ${f.relevance}`)
        .join("\n");
      sections.push(
        truncate(
          `## 복선 현황\n${lines}`,
          LAYER_CHAR_LIMITS.foreshadowing,
        ),
      );
    }

    let result = sections.join("\n\n");

    // Hard cap on total length
    if (result.length > TOTAL_CHAR_LIMIT) {
      result = result.slice(0, TOTAL_CHAR_LIMIT) + "\n…(이하 생략)";
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Compression helpers
  // -----------------------------------------------------------------------

  /**
   * Compress a list of chapter memories into a summary at the specified depth.
   * - "arc"    → combine into ~5 sentences
   * - "part"   → combine into ~3 sentences
   * - "global" → combine into ~1 sentence
   */
  compressMemories(
    chapters: ChapterMemory[],
    depth: "arc" | "part" | "global",
  ): string {
    if (chapters.length === 0) return "";

    const allSummaries = chapters.map(
      (ch) => `${ch.chapter}화: ${ch.summary}`,
    );

    const sentenceLimit =
      depth === "global" ? 1 : depth === "part" ? 3 : 5;

    // Simple extractive compression: take the most important summaries
    // and concatenate, respecting the sentence limit.
    // For truly large chapter counts, we pick evenly spaced samples.
    if (allSummaries.length <= sentenceLimit) {
      return allSummaries.join(" ");
    }

    const step = Math.max(1, Math.floor(allSummaries.length / sentenceLimit));
    const picked: string[] = [];
    for (let i = 0; i < allSummaries.length && picked.length < sentenceLimit; i += step) {
      picked.push(allSummaries[i]);
    }
    // Always include the last entry (most recent context)
    const lastEntry = allSummaries[allSummaries.length - 1];
    if (!picked.includes(lastEntry)) {
      picked[picked.length - 1] = lastEntry;
    }

    return picked.join(" ");
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getChaptersBefore(beforeChapter: number): ChapterMemory[] {
    const result: ChapterMemory[] = [];
    for (const [num, mem] of this.chapters) {
      if (num < beforeChapter) result.push(mem);
    }
    return result.sort((a, b) => a.chapter - b.chapter);
  }

  private getChaptersInRange(start: number, end: number): ChapterMemory[] {
    const result: ChapterMemory[] = [];
    for (const [num, mem] of this.chapters) {
      if (num >= start && num < end) result.push(mem);
    }
    return result.sort((a, b) => a.chapter - b.chapter);
  }

  private getRecentChapters(
    beforeChapter: number,
    count: number,
  ): ChapterMemory[] {
    const all = this.getChaptersBefore(beforeChapter);
    return all.slice(-count);
  }

  /**
   * Find arcs that belong to the same "part" as the given chapter.
   * A part is a group of consecutive arcs; we detect boundaries by looking
   * for gaps or by examining seed data if available.
   */
  private findPartArcs(seed: NovelSeed, chapterNumber: number): PlotArc[] {
    const currentArc = getArcForChapter(seed, chapterNumber);
    if (!currentArc) return [];

    // Simple heuristic: arcs within 30 chapters of the current arc belong
    // to the same part. This keeps the part summary manageable.
    const PART_RANGE = 30;
    return seed.arcs.filter(
      (arc) =>
        arc.start_chapter >= currentArc.start_chapter - PART_RANGE &&
        arc.start_chapter <= currentArc.end_chapter,
    );
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}
