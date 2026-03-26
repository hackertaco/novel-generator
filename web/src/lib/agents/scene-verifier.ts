/**
 * SceneVerifier — post-RuleGuard pipeline agent that verifies must_reveal
 * coverage per scene and deterministically injects missing facts.
 *
 * In fast mode: deterministic injection only (no LLM).
 * In default mode: can trigger scene regeneration (max 2 attempts).
 */

import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";
import type { SceneSpec } from "@/lib/schema/planning";
import { writeChapterByScenes } from "./scene-writer";
import { getAgent } from "./llm-agent";
import { getWriterSystemPrompt } from "@/lib/prompts/writer-system-prompt";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { accumulateUsage } from "./pipeline";
import { sanitize } from "./rule-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SceneAction = "pass" | "inject" | "regenerate";

export interface SceneVerdict {
  sceneIndex: number;
  action: SceneAction;
  missingFacts: string[];
}

// ---------------------------------------------------------------------------
// Korean particle helper
// ---------------------------------------------------------------------------

/**
 * Detect whether a Korean character has a 받침 (final consonant).
 * Used to pick the correct particle (은/는, 이/가, 을/를, etc.).
 */
function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * Pick topic particle 은/는 based on the last character's 받침.
 */
function topicParticle(word: string): string {
  const last = word[word.length - 1];
  return hasBatchim(last) ? "은" : "는";
}

// ---------------------------------------------------------------------------
// Keyword checking
// ---------------------------------------------------------------------------

/**
 * Extract Korean keywords (3+ characters) from a fact string.
 */
function extractKeywords(fact: string): string[] {
  return fact.match(/[가-힣]{3,}/g) || [];
}

/**
 * Check whether a scene text covers a must_reveal fact.
 * Returns true if 50%+ of the keywords appear in the text.
 */
export function checkMustReveal(text: string, fact: string): boolean {
  const keywords = extractKeywords(fact);
  if (keywords.length === 0) return true; // no testable keywords → pass

  const normalizedText = text.replace(/\s+/g, " ").toLowerCase();
  const found = keywords.filter((kw) => normalizedText.includes(kw.toLowerCase()));
  return found.length >= Math.ceil(keywords.length * 0.5);
}

// ---------------------------------------------------------------------------
// Deterministic fact injection
// ---------------------------------------------------------------------------

/**
 * Inject missing facts as narration at the midpoint of a scene text.
 * Facts are rendered as short narration sentences.
 */
export function injectFacts(text: string, facts: string[], scene: SceneSpec): string {
  if (facts.length === 0) return text;

  // Build narration lines for each missing fact
  const narrationLines = facts.map((fact) => {
    // Use the first character name if available for attribution
    const char = scene.characters?.[0];
    if (char) {
      const particle = topicParticle(char);
      return `${char}${particle} 알고 있었다. ${fact}.`;
    }
    return `그것은 분명한 사실이었다. ${fact}.`;
  });

  const injection = "\n\n" + narrationLines.join("\n") + "\n\n";

  // Split into paragraphs and inject at midpoint
  const paragraphs = text.split("\n\n");
  const mid = Math.floor(paragraphs.length / 2);

  paragraphs.splice(mid, 0, injection.trim());

  return paragraphs.join("\n\n");
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze each scene's must_reveal coverage and return verdicts.
 */
export function analyze(
  sceneTexts: string[],
  scenes: SceneSpec[],
  fastMode?: boolean,
): SceneVerdict[] {
  const verdicts: SceneVerdict[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = sceneTexts[i] || "";

    if (!scene.must_reveal || scene.must_reveal.length === 0) {
      verdicts.push({ sceneIndex: i, action: "pass", missingFacts: [] });
      continue;
    }

    const missingFacts = scene.must_reveal.filter(
      (fact) => !checkMustReveal(text, fact),
    );

    if (missingFacts.length === 0) {
      verdicts.push({ sceneIndex: i, action: "pass", missingFacts: [] });
    } else if (fastMode) {
      // Fast mode: always inject, never regenerate
      verdicts.push({ sceneIndex: i, action: "inject", missingFacts });
    } else {
      // Default mode: try regeneration first for better quality
      verdicts.push({ sceneIndex: i, action: "regenerate", missingFacts });
    }
  }

  return verdicts;
}

// ---------------------------------------------------------------------------
// SceneVerifierAgent — PipelineAgent implementation
// ---------------------------------------------------------------------------

const MAX_REGEN_ATTEMPTS = 2;

export class SceneVerifierAgent implements PipelineAgent {
  name = "scene-verifier";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    // Guard: nothing to verify if no blueprint or sceneTexts
    if (!ctx.blueprint || !ctx.sceneTexts || ctx.sceneTexts.length === 0) {
      return;
    }

    yield { type: "stage_change", stage: "scene_verify" };

    const { blueprint, sceneTexts, fastMode } = ctx;
    const scenes = blueprint.scenes;

    // Initial analysis
    let verdicts = analyze(sceneTexts, scenes, fastMode);

    const needsWork = verdicts.some((v) => v.action !== "pass");
    if (!needsWork) return; // all scenes pass

    // --- Handle regeneration (default mode only) ---
    if (!fastMode) {
      let regenAttempts = 0;

      while (regenAttempts < MAX_REGEN_ATTEMPTS) {
        const regenIndices = verdicts
          .filter((v) => v.action === "regenerate")
          .map((v) => v.sceneIndex);

        if (regenIndices.length === 0) break;
        regenAttempts++;

        yield {
          type: "stage_change",
          stage: `scene_regenerate_attempt_${regenAttempts}`,
        };

        // Regenerate individual scenes via scene-writer
        const { seed, chapterNumber } = ctx;
        const tier = selectModelTier(seed, chapterNumber);
        const model = getModelForTier(tier);
        const systemPrompt = getWriterSystemPrompt(seed.world.genre, chapterNumber);

        const sceneResult = await writeChapterByScenes({
          seed,
          chapterNumber,
          blueprint,
          systemPrompt,
          model,
          previousSummaries: ctx.previousSummaries.map((s) => ({
            chapter: s.chapter,
            summary: s.summary,
          })),
          previousChapterEnding: ctx.previousChapterEnding,
          fastMode,
          ...(ctx.trackingContext
            ? {
                memoryContext: ctx.trackingContext.memoryContext,
                toneGuidance: ctx.trackingContext.toneGuidance,
                progressContext: ctx.trackingContext.progressContext,
                correctionContext: ctx.trackingContext.correctionContext,
              }
            : {}),
        });

        ctx.totalUsage = accumulateUsage(ctx.totalUsage, sceneResult.usage);
        yield { type: "usage", ...sceneResult.usage };

        // Replace only the regenerated scenes that improved
        for (const idx of regenIndices) {
          const newText = sceneResult.sceneTexts[idx] || "";
          const scene = scenes[idx];
          if (!scene.must_reveal) continue;

          const oldMissing = scene.must_reveal.filter(
            (f) => !checkMustReveal(sceneTexts[idx] || "", f),
          );
          const newMissing = scene.must_reveal.filter(
            (f) => !checkMustReveal(newText, f),
          );

          // Accept regenerated scene only if it covers more facts
          if (newMissing.length < oldMissing.length) {
            sceneTexts[idx] = newText;
          }
        }

        // Re-analyze after regeneration
        verdicts = analyze(sceneTexts, scenes, false);

        // If remaining issues can only be injected, downgrade to inject
        verdicts = verdicts.map((v) =>
          v.action === "regenerate" ? { ...v, action: "inject" as SceneAction } : v,
        );
      }
    }

    // --- Handle injection (default mode only — injected text is meta, not prose) ---
    if (!fastMode) {
      for (const verdict of verdicts) {
        if (verdict.action !== "inject" || verdict.missingFacts.length === 0) continue;

        const scene = scenes[verdict.sceneIndex];
        sceneTexts[verdict.sceneIndex] = injectFacts(
          sceneTexts[verdict.sceneIndex] || "",
          verdict.missingFacts,
          scene,
        );
      }
    }

    // Reassemble ctx.text from updated sceneTexts
    ctx.sceneTexts = sceneTexts;
    ctx.text = sanitize(sceneTexts.join("\n\n"));
    yield { type: "replace_text", content: ctx.text };
  }
}
