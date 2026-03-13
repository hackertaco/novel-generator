import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import { shouldAct } from "@/lib/schema/foreshadowing";
import type { ContextItem } from "./token-estimator";

export interface RelevanceOptions {
  seed: NovelSeed;
  currentChapter: number;
  allSummaries: ChapterSummary[];
  arcSummaries?: Record<string, string>; // compressed arc summaries
}

/**
 * Select the most relevant context items for a given chapter.
 * Returns prioritized ContextItems for use with trimToFit().
 */
export function selectRelevantContext(
  options: RelevanceOptions,
): ContextItem[] {
  const { seed, currentChapter, allSummaries, arcSummaries } = options;
  const items: ContextItem[] = [];

  // 1. Recent 3 chapters — highest priority (full summaries)
  const recentStart = Math.max(1, currentChapter - 3);
  for (let ch = recentStart; ch < currentChapter; ch++) {
    const summary = allSummaries.find((s) => s.chapter_number === ch);
    if (summary) {
      items.push({
        key: `recent-ch-${ch}`,
        content: `${ch}화 "${summary.title}": ${summary.plot_summary}${summary.cliffhanger ? `\n클리프행어: ${summary.cliffhanger}` : ""}`,
        priority: 100 + (ch - recentStart), // more recent = higher
      });
    }
  }

  // 2. Current arc's key chapters (start & climax)
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= currentChapter && currentChapter <= a.end_chapter,
  );
  if (currentArc) {
    // Arc start chapter (if not already in recent)
    if (currentArc.start_chapter < recentStart) {
      const startSummary = allSummaries.find(
        (s) => s.chapter_number === currentArc.start_chapter,
      );
      if (startSummary) {
        items.push({
          key: `arc-start-${currentArc.start_chapter}`,
          content: `[아크 시작] ${currentArc.start_chapter}화 "${startSummary.title}": ${startSummary.plot_summary}`,
          priority: 80,
        });
      }
    }

    // Arc climax chapter (if already written and not in recent)
    if (
      currentArc.climax_chapter < currentChapter &&
      currentArc.climax_chapter < recentStart
    ) {
      const climaxSummary = allSummaries.find(
        (s) => s.chapter_number === currentArc.climax_chapter,
      );
      if (climaxSummary) {
        items.push({
          key: `arc-climax-${currentArc.climax_chapter}`,
          content: `[클라이맥스] ${currentArc.climax_chapter}화 "${climaxSummary.title}": ${climaxSummary.plot_summary}`,
          priority: 85,
        });
      }
    }
  }

  // 3. Foreshadowing-relevant chapters
  for (const fs of seed.foreshadowing) {
    const action = shouldAct(fs, currentChapter);
    if (!action) continue;

    // If this chapter needs to reveal/hint, include where it was planted
    if (
      (action === "reveal" || action === "hint") &&
      fs.planted_at < recentStart
    ) {
      const plantSummary = allSummaries.find(
        (s) => s.chapter_number === fs.planted_at,
      );
      if (plantSummary) {
        items.push({
          key: `foreshadow-plant-${fs.id}`,
          content: `[복선 "${fs.name}" 심기] ${fs.planted_at}화: ${plantSummary.plot_summary}`,
          priority: 90,
        });
      }
    }

    // Include hint chapters for reveals
    if (action === "reveal") {
      for (const hintCh of fs.hints_at) {
        if (hintCh < recentStart && hintCh !== fs.planted_at) {
          const hintSummary = allSummaries.find(
            (s) => s.chapter_number === hintCh,
          );
          if (hintSummary) {
            items.push({
              key: `foreshadow-hint-${fs.id}-${hintCh}`,
              content: `[복선 "${fs.name}" 힌트] ${hintCh}화: ${hintSummary.plot_summary}`,
              priority: 75,
            });
          }
        }
      }
    }
  }

  // 4. Compressed arc summaries for completed arcs
  if (arcSummaries) {
    for (const arc of seed.arcs) {
      if (arc.end_chapter < currentChapter && arcSummaries[arc.name]) {
        items.push({
          key: `arc-compressed-${arc.name}`,
          content: `[완료된 아크] ${arc.name}: ${arcSummaries[arc.name]}`,
          priority: 50,
        });
      }
    }
  }

  // Deduplicate by key
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}
