import type { NovelSeed } from "@/lib/schema/novel";
import { collectChapterGenreConventionCoverage } from "@/lib/sim";
import { enforceMustUnderstandCoverage } from "./must-understand-gate";

export type ProseCoverageRuleSource = "genre_convention";

export interface ProseCoverageEnforcementInput {
  text: string;
  seed: NovelSeed;
  chapter: number;
}

export interface ProseCoverageAppliedEntry {
  source: ProseCoverageRuleSource;
  item: string;
  line: string;
}

export interface ProseCoverageResidualEntry {
  source: ProseCoverageRuleSource;
  item: string;
}

export interface ProseCoverageEnforcementResult {
  text: string;
  mustUnderstand: string[];
  applied: ProseCoverageAppliedEntry[];
  residualMissing: ProseCoverageResidualEntry[];
}

export function enforceProseCoverage(
  input: ProseCoverageEnforcementInput,
): ProseCoverageEnforcementResult {
  const { text, seed, chapter } = input;
  const coverage = collectChapterGenreConventionCoverage(seed, chapter);

  if (coverage.mustUnderstand.length === 0) {
    return {
      text,
      mustUnderstand: [],
      applied: [],
      residualMissing: [],
    };
  }

  const result = enforceMustUnderstandCoverage({
    text,
    mustUnderstand: coverage.mustUnderstand,
    fallbacks: coverage.fallbacks,
  });

  return {
    text: result.text,
    mustUnderstand: coverage.mustUnderstand,
    applied: result.applied.map((entry) => ({
      source: "genre_convention",
      item: entry.item,
      line: entry.line,
    })),
    residualMissing: result.residualMissing.map((item) => ({
      source: "genre_convention",
      item,
    })),
  };
}
