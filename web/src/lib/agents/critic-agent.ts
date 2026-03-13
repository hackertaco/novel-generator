import { getAgent } from "./llm-agent";
import { getCriticSystemPrompt } from "@/lib/prompts/critic-prompt";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import type { CriticReport, CriticIssue, RuleIssue, ChapterContext } from "./pipeline";
import type { NovelSeed } from "@/lib/schema/novel";

// --- Weights for the 5 evaluation dimensions ---
const DIMENSION_WEIGHTS: Record<string, number> = {
  narrative: 0.25,
  characterVoice: 0.25,
  rhythm: 0.20,
  hookEnding: 0.15,
  immersion: 0.15,
};

/**
 * Compute weighted average score from dimension scores.
 * Missing dimensions default to 0.
 */
export function computeOverallScore(dimensions: Record<string, number>): number {
  let score = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    score += (dimensions[dim] ?? 0) * weight;
  }
  return score;
}

/**
 * Parse raw LLM response into a CriticReport.
 * Handles plain JSON and markdown code blocks.
 * Returns null if parsing fails.
 * Filters out issues with startParagraph >= paragraphCount (when provided).
 */
export function parseCriticResponse(
  raw: string,
  paragraphCount?: number
): CriticReport | null {
  // Try to extract JSON block from markdown fences or raw text
  let jsonStr = raw.trim();

  // Handle ```json ... ``` blocks
  const jsonFenceMatch = jsonStr.match(/```json\s*([\s\S]*?)```/);
  if (jsonFenceMatch) {
    jsonStr = jsonFenceMatch[1].trim();
  } else {
    // Handle generic ``` ... ``` blocks
    const genericFenceMatch = jsonStr.match(/```\s*([\s\S]*?)```/);
    if (genericFenceMatch) {
      const content = genericFenceMatch[1].trim();
      if (content.startsWith("{")) {
        jsonStr = content;
      }
    } else {
      // Try to find a raw JSON object
      const jsonObjectMatch = jsonStr.match(/(\{[\s\S]*\})/);
      if (jsonObjectMatch) {
        jsonStr = jsonObjectMatch[1].trim();
      }
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate dimensions
  if (typeof obj.dimensions !== "object" || obj.dimensions === null) {
    return null;
  }

  const dimensions = obj.dimensions as Record<string, unknown>;
  const validatedDimensions: Record<string, number> = {};
  for (const [key, val] of Object.entries(dimensions)) {
    if (typeof val === "number") {
      validatedDimensions[key] = val;
    }
  }

  // Validate and filter issues
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: CriticIssue[] = [];

  for (const raw of rawIssues) {
    if (typeof raw !== "object" || raw === null) continue;

    const issue = raw as Record<string, unknown>;

    const startParagraph = typeof issue.startParagraph === "number" ? issue.startParagraph : -1;
    const endParagraph = typeof issue.endParagraph === "number" ? issue.endParagraph : -1;

    // Filter out-of-bounds paragraph indices
    if (paragraphCount !== undefined && startParagraph >= paragraphCount) {
      continue;
    }

    issues.push({
      startParagraph,
      endParagraph,
      category: (issue.category as CriticIssue["category"]) ?? "narrative",
      description: String(issue.description ?? ""),
      severity: (issue.severity as CriticIssue["severity"]) ?? "minor",
      suggestedFix: String(issue.suggestedFix ?? ""),
    });
  }

  const overallScore = computeOverallScore(validatedDimensions);

  return {
    overallScore,
    dimensions: validatedDimensions,
    issues,
  };
}

/**
 * Build the user prompt for the Critic agent.
 * Includes text, rule issue hints, and seed genre context.
 */
export function buildCriticPrompt(
  text: string,
  ruleIssues: RuleIssue[],
  seed: NovelSeed
): string {
  const genre = seed.world?.genre ?? "unknown";

  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;

  let ruleHints = "";
  if (ruleIssues.length > 0) {
    ruleHints = `\n## 규칙 검사기가 발견한 힌트 (참고용)\n`;
    for (const issue of ruleIssues) {
      ruleHints += `- [문단 ${issue.position}] ${issue.type}: ${issue.detail}\n`;
    }
    ruleHints += "\n";
  }

  const numberedText = paragraphs
    .map((p, i) => `[${i}] ${p}`)
    .join("\n\n");

  return `장르: ${genre}
총 문단 수: ${paragraphCount}
${ruleHints}
## 평가 대상 텍스트

${numberedText}`;
}

/**
 * CriticAgent: uses LLM to evaluate chapter text quality.
 */
export class CriticAgent {
  /**
   * Full evaluation: returns a CriticReport with dimensions, overallScore, and issues.
   * Retries once on parse failure. Returns null if both attempts fail.
   */
  async evaluate(ctx: ChapterContext): Promise<CriticReport | null> {
    const agent = getAgent();
    const tier = selectModelTier(ctx.seed, ctx.chapterNumber);
    const model = getModelForTier(tier);
    const genre = ctx.seed.world.genre;

    const paragraphs = ctx.text.split(/\n+/).filter((p) => p.trim().length > 0);
    const paragraphCount = paragraphs.length;

    const prompt = buildCriticPrompt(ctx.text, ctx.ruleIssues, ctx.seed);
    const system = getCriticSystemPrompt(genre);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await agent.call({
          prompt,
          system,
          model,
          temperature: 0.2,
          maxTokens: 2048,
          taskId: `critic-evaluate-ch${ctx.chapterNumber}-attempt${attempt}`,
        });

        const report = parseCriticResponse(result.data, paragraphCount);
        if (report !== null) {
          return report;
        }
      } catch (err) {
        console.warn(`[CriticAgent] evaluate attempt ${attempt} failed:`, err);
      }
    }

    return null;
  }

  /**
   * Quick score only: simplified prompt asking for dimensions only (no issues).
   * Uses max_tokens 200. Returns weighted overall score or null on failure.
   */
  async quickScore(ctx: ChapterContext): Promise<number | null> {
    const agent = getAgent();
    const tier = selectModelTier(ctx.seed, ctx.chapterNumber);
    const model = getModelForTier(tier);
    const genre = ctx.seed.world.genre;

    const quickPrompt = `장르: ${genre}

아래 웹소설 텍스트를 5가지 차원으로 평가하고, 점수만 JSON으로 출력하세요.
issues는 포함하지 말고 dimensions만 출력하세요.

형식:
{"dimensions":{"narrative":0.0,"characterVoice":0.0,"rhythm":0.0,"hookEnding":0.0,"immersion":0.0}}

---
${ctx.text}`;

    try {
      const result = await agent.call({
        prompt: quickPrompt,
        system: getCriticSystemPrompt(genre),
        model,
        temperature: 0.1,
        maxTokens: 200,
        taskId: `critic-quickscore-ch${ctx.chapterNumber}`,
      });

      // Try to parse dimensions from response
      let jsonStr = result.data.trim();

      const jsonFenceMatch = jsonStr.match(/```json\s*([\s\S]*?)```/);
      if (jsonFenceMatch) {
        jsonStr = jsonFenceMatch[1].trim();
      } else {
        const jsonObjectMatch = jsonStr.match(/(\{[\s\S]*\})/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[1].trim();
        }
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return null;
      }

      if (typeof parsed !== "object" || parsed === null) return null;

      const obj = parsed as Record<string, unknown>;
      const dimensions = (obj.dimensions ?? obj) as Record<string, unknown>;

      const scores: Record<string, number> = {};
      for (const [key, val] of Object.entries(dimensions)) {
        if (typeof val === "number") {
          scores[key] = val;
        }
      }

      if (Object.keys(scores).length === 0) return null;

      return computeOverallScore(scores);
    } catch (err) {
      console.warn(`[CriticAgent] quickScore failed:`, err);
      return null;
    }
  }
}
