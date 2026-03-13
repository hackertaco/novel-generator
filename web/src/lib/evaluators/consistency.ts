import type { NovelSeed } from "../schema/novel";
import type { ChapterSummary } from "../schema/chapter";
import { shouldAct } from "../schema/foreshadowing";

export interface ConsistencyResult {
  character_voice: {
    issues: Array<{
      character: string;
      dialogue: string;
      expected_patterns: string[];
    }>;
    score: number;
    pass: boolean;
  };
  foreshadowing: {
    required: Array<{
      id: string;
      name: string;
      action: string;
      found: boolean;
    }>;
    missing: Array<{
      id: string;
      name: string;
      action: string;
      found: boolean;
    }>;
    score: number;
    pass: boolean;
  };
  world_rules: {
    rules_count: number;
    violations: string[];
    score: number;
    pass: boolean;
  };
  continuity: {
    previous_chapter: number;
    issues: Array<{ type: string; expected: string }>;
    score: number;
    pass: boolean;
  };
}

export function evaluateConsistency(
  seed: NovelSeed,
  chapterNumber: number,
  content: string,
  previousSummary?: ChapterSummary | null,
): ConsistencyResult {
  return {
    character_voice: checkCharacterVoice(seed, content),
    foreshadowing: checkForeshadowing(seed, chapterNumber, content),
    world_rules: {
      rules_count: seed.world.rules.length,
      violations: [],
      score: 1.0,
      pass: true,
    },
    continuity: checkContinuity(chapterNumber, content, previousSummary),
  };
}

function checkCharacterVoice(seed: NovelSeed, content: string) {
  const issues: Array<{
    character: string;
    dialogue: string;
    expected_patterns: string[];
  }> = [];

  for (const char of seed.characters) {
    const pattern = new RegExp(
      `${char.name}[이가은는]?\\s*[^"\u201C]*["\u201C]([^"\u201D]+)["\u201D]`,
      "g",
    );
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const dialogue = match[1];
      const hasPattern = char.voice.speech_patterns.some((p) =>
        dialogue.includes(p),
      );
      if (!hasPattern && dialogue.length > 20) {
        issues.push({
          character: char.name,
          dialogue: dialogue.slice(0, 50),
          expected_patterns: char.voice.speech_patterns,
        });
      }
    }
  }

  return {
    issues: issues.slice(0, 5),
    score: 1.0 - Math.min(issues.length * 0.1, 0.5),
    pass: issues.length <= 2,
  };
}

function checkForeshadowing(
  seed: NovelSeed,
  chapterNumber: number,
  content: string,
) {
  const results: Array<{
    id: string;
    name: string;
    action: string;
    found: boolean;
  }> = [];

  for (const fs of seed.foreshadowing) {
    const action = shouldAct(fs, chapterNumber);
    if (!action) continue;

    const keywords = fs.name.split(/\s+/);
    const found = keywords.some((kw) => content.includes(kw));
    results.push({ id: fs.id, name: fs.name, action, found });
  }

  const missing = results.filter((r) => !r.found);
  return {
    required: results,
    missing,
    score:
      results.length > 0 ? 1.0 - missing.length / results.length : 1.0,
    pass: missing.length === 0,
  };
}

function checkContinuity(
  chapterNumber: number,
  content: string,
  previousSummary?: ChapterSummary | null,
) {
  if (chapterNumber <= 1) {
    return { previous_chapter: 0, issues: [], score: 1.0, pass: true };
  }
  if (!previousSummary) {
    return {
      previous_chapter: chapterNumber - 1,
      issues: [],
      score: 0.5,
      pass: true,
    };
  }

  const issues: Array<{ type: string; expected: string }> = [];
  if (previousSummary.cliffhanger) {
    const words = previousSummary.cliffhanger.split(/\s+/).slice(0, 5);
    const addressed = words.some((w) => content.slice(0, 500).includes(w));
    if (!addressed) {
      issues.push({
        type: "cliffhanger_not_addressed",
        expected: previousSummary.cliffhanger,
      });
    }
  }

  return {
    previous_chapter: chapterNumber - 1,
    issues,
    score: 1.0 - issues.length * 0.3,
    pass: issues.length === 0,
  };
}
