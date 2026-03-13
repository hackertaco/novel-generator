import type { NovelSeed } from "../schema/novel";
import { shouldAct } from "../schema/foreshadowing";

export type ModelTier = "low" | "high";

export function selectModelTier(
  seed: NovelSeed,
  chapterNumber: number,
): ModelTier {
  // High tier for: arc starts, climaxes, foreshadowing reveals, high tension
  const arc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNumber && chapterNumber <= a.end_chapter,
  );

  if (!arc) return "low";

  // Arc start or climax
  if (
    chapterNumber === arc.start_chapter ||
    chapterNumber === arc.climax_chapter
  ) {
    return "high";
  }

  // Foreshadowing reveal
  const hasReveal = seed.foreshadowing.some((fs) => {
    const action = shouldAct(fs, chapterNumber);
    return action === "reveal";
  });
  if (hasReveal) return "high";

  // High tension (>= 8)
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  if (outline && outline.tension_level >= 8) return "high";

  return "low";
}

export function getModelForTier(tier: ModelTier): string {
  if (tier === "high") {
    return (
      process.env.NOVEL_MODEL_HIGH || process.env.NOVEL_MODEL || "gpt-4o"
    );
  }
  return process.env.NOVEL_MODEL || "gpt-4o-mini";
}
