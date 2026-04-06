/**
 * ConsistencyChecker — post-generation verification against settings.
 *
 * Separate from CriticAgent (which evaluates style/craft).
 * This checks factual consistency using deterministic regex/heuristic checks:
 * - Character voice matches their profile (speech pattern regex)
 * - Dead/absent characters don't speak or act
 * - Timeline events don't contradict (time marker ordering)
 * - Location/time continuity (movement verb detection)
 * - Honorific/speech-level consistency
 *
 * Previously LLM-based; replaced with regex to reduce cost ($0 per call).
 * The existing evaluators/consistency-gate.ts already handles most checks;
 * this agent wraps those plus adds voice-pattern and character-state checks
 * that feed into the pipeline's ruleIssues.
 */

import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";
import { evaluateConsistencyGate } from "../evaluators/consistency-gate";

export interface ConsistencyIssue {
  type: "voice" | "world_rule" | "timeline" | "character_state" | "location" | "knowledge";
  severity: "critical" | "warning";
  description: string;
  evidence: string;
  fix_suggestion: string;
}

// ---------------------------------------------------------------------------
// Deterministic voice-pattern check
// ---------------------------------------------------------------------------

/**
 * Extract dialogues attributed to each character and check if their
 * speech_patterns appear. This mirrors what the old LLM prompt asked for
 * (존댓말/반말 consistency, character-specific endings).
 */
function checkVoicePatterns(
  text: string,
  characters: Array<{
    name: string;
    id: string;
    voice: { tone: string; speech_patterns?: string[] };
    introduction_chapter: number;
  }>,
  chapterNumber: number,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const char of characters) {
    if (char.introduction_chapter > chapterNumber) continue;
    const patterns = char.voice.speech_patterns;
    if (!patterns || patterns.length === 0) continue;

    // Find dialogues attributed to this character:
    // Pattern: NAME + particle + quote
    const dialogueRegex = new RegExp(
      `${char.name}[이가은는]?\\s*["\u201C]([^"\u201D]{10,})["\u201D]`,
      "g",
    );
    let match: RegExpExecArray | null;
    let totalDialogues = 0;
    let mismatchCount = 0;

    while ((match = dialogueRegex.exec(text)) !== null) {
      const dialogue = match[1];
      totalDialogues++;
      const hasPattern = patterns.some((p) => dialogue.includes(p));
      if (!hasPattern && dialogue.length > 15) {
        mismatchCount++;
        // Only report first 2 mismatches per character to avoid noise
        if (mismatchCount <= 2) {
          issues.push({
            type: "voice",
            severity: mismatchCount === 1 ? "warning" : "critical",
            description: `${char.name}의 대사에 설정된 말투 패턴(${patterns.join(", ")})이 없음`,
            evidence: dialogue.slice(0, 60),
            fix_suggestion: `${char.name}의 대사에 "${patterns[0]}" 등 설정된 말투 패턴을 반영`,
          });
        }
      }
    }

    // Check speech level consistency (존댓말 vs 반말)
    if (totalDialogues >= 2) {
      const politeEndings = /(?:습니다|합니다|입니다|세요|하세요|드리|겠습니다|주세요)/;
      const casualEndings = /(?:해|했어|할게|한다|했다|하자|해라|해봐|했잖아)/;
      const tone = char.voice.tone.toLowerCase();
      const expectPolite = tone.includes("존댓말") || tone.includes("공손") || tone.includes("정중");
      const expectCasual = tone.includes("반말") || tone.includes("건방") || tone.includes("거친");

      if (expectPolite || expectCasual) {
        dialogueRegex.lastIndex = 0;
        while ((match = dialogueRegex.exec(text)) !== null) {
          const dialogue = match[1];
          if (expectPolite && casualEndings.test(dialogue) && !politeEndings.test(dialogue)) {
            issues.push({
              type: "voice",
              severity: "critical",
              description: `${char.name}은 존댓말 설정인데 반말 사용`,
              evidence: dialogue.slice(0, 60),
              fix_suggestion: `${char.name}의 대사를 존댓말로 수정`,
            });
            break; // one report per character is enough
          }
          if (expectCasual && politeEndings.test(dialogue) && !casualEndings.test(dialogue)) {
            issues.push({
              type: "voice",
              severity: "warning",
              description: `${char.name}은 반말 설정인데 존댓말 사용`,
              evidence: dialogue.slice(0, 60),
              fix_suggestion: `${char.name}의 대사를 반말로 수정`,
            });
            break;
          }
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Character state check (dead/absent/injured)
// ---------------------------------------------------------------------------

/**
 * Check if characters whose state is "dead", "absent", or "incapacitated"
 * appear acting or speaking in the text.
 */
function checkCharacterState(
  text: string,
  characters: Array<{
    name: string;
    id: string;
    state: { status?: string | null; location?: string | null; [key: string]: unknown };
    introduction_chapter: number;
  }>,
  chapterNumber: number,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const char of characters) {
    if (char.introduction_chapter > chapterNumber) continue;
    const status = (char.state.status || "normal").toLowerCase();

    // Check dead characters speaking/acting
    if (status === "dead" || status === "deceased") {
      // Check if character appears as a speaker (NAME + particle + quote)
      const speakPattern = new RegExp(
        `${char.name}[이가은는]?\\s*["\u201C]`,
      );
      // Check if character appears performing actions
      const actionPattern = new RegExp(
        `${char.name}[이가은는]?\\s*(?:말했|걸어|뛰어|달려|웃으며|소리쳤|외쳤|일어났|눈을 떴)`,
      );

      if (speakPattern.test(text)) {
        const speakMatch = text.match(speakPattern);
        const evidence = speakMatch
          ? text.slice(Math.max(0, speakMatch.index! - 5), speakMatch.index! + 40)
          : char.name;
        issues.push({
          type: "character_state",
          severity: "critical",
          description: `사망한 캐릭터 "${char.name}"이 대사를 함`,
          evidence,
          fix_suggestion: `${char.name}은 사망 상태이므로 대사를 제거하거나 회상/환상으로 처리`,
        });
      } else if (actionPattern.test(text)) {
        const actionMatch = text.match(actionPattern);
        const evidence = actionMatch
          ? text.slice(Math.max(0, actionMatch.index! - 5), actionMatch.index! + 40)
          : char.name;
        issues.push({
          type: "character_state",
          severity: "critical",
          description: `사망한 캐릭터 "${char.name}"이 행동함`,
          evidence,
          fix_suggestion: `${char.name}은 사망 상태이므로 행동 묘사를 제거`,
        });
      }
    }

    // Check absent characters appearing
    if (status === "absent" || status === "away" || status === "missing") {
      const nameRegex = new RegExp(
        `${char.name}[이가은는]\\s*(?:["\u201C]|말했|걸어|뛰어)`,
      );
      if (nameRegex.test(text)) {
        issues.push({
          type: "character_state",
          severity: "critical",
          description: `부재중인 캐릭터 "${char.name}"이 등장함`,
          evidence: char.name,
          fix_suggestion: `${char.name}은 부재 상태이므로 등장을 제거하거나 복귀 묘사 추가`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * ConsistencyChecker runs after WriterAgent and before QualityLoop.
 * Uses deterministic regex/heuristic checks (no LLM calls, $0 cost).
 *
 * Critical issues are reported via ruleIssues for the state machine to handle.
 * Unlike the old LLM-based version, this does NOT attempt to auto-fix text
 * (the LLM rewrite was found to undo RuleGuard fixes — see config.ts comments).
 */
export class ConsistencyChecker implements PipelineAgent {
  name = "consistency-checker";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    if (!ctx.text || ctx.text.length < 500) return;

    yield { type: "stage_change", stage: "consistency_check" };

    const { seed, chapterNumber } = ctx;

    // 1. Run the deterministic consistency gate (POV, timeline, location, name, rank, companion)
    const activeChars = seed.characters
      .filter((c) => c.introduction_chapter <= chapterNumber);

    const gateResult = evaluateConsistencyGate(
      ctx.text,
      activeChars,
      undefined, // POV auto-detected
      ctx.previousCharacterStates,
    );

    // Map gate issues to ruleIssues
    for (const issue of gateResult.issues) {
      ctx.ruleIssues.push({
        type: "consistency",
        severity: issue.severity === "critical" ? "critical" : "warning",
        message: issue.description,
        position: issue.position ?? 0,
        detail: issue.detail,
      });
    }

    // 2. Voice pattern checks (speech pattern matching per character)
    const voiceIssues = checkVoicePatterns(ctx.text, activeChars, chapterNumber);
    for (const issue of voiceIssues) {
      ctx.ruleIssues.push({
        type: "consistency",
        severity: issue.severity === "critical" ? "critical" : "warning",
        message: `말투 일관성: ${issue.description}`,
        position: 0,
        detail: `${issue.evidence} → ${issue.fix_suggestion}`,
      });
    }

    // 3. Character state checks (dead/absent characters acting)
    const stateIssues = checkCharacterState(ctx.text, activeChars, chapterNumber);
    for (const issue of stateIssues) {
      ctx.ruleIssues.push({
        type: "consistency",
        severity: issue.severity === "critical" ? "critical" : "warning",
        message: issue.description,
        position: 0,
        detail: `${issue.evidence} → ${issue.fix_suggestion}`,
      });
    }

    // Report summary
    const totalCritical = [...gateResult.issues, ...voiceIssues, ...stateIssues]
      .filter((i) => i.severity === "critical").length;
    const totalWarning = [...gateResult.issues, ...voiceIssues, ...stateIssues]
      .filter((i) => i.severity !== "critical").length;

    if (totalCritical > 0 || totalWarning > 0) {
      console.log(
        `[consistency-checker] ${chapterNumber}화: critical=${totalCritical}, warning=${totalWarning} (deterministic, $0)`,
      );
    }

    // NOTE: The old LLM-based version attempted auto-fix via a second LLM call.
    // This was removed because:
    // 1. The full-text LLM rewrite often undoes RuleGuard fixes (see config.ts)
    // 2. Deterministic checks are sufficient for detection; fixes should be
    //    handled by the writer's repair loop (state machine VALIDATE → REPAIR)
    // 3. Cost savings: 2 LLM calls eliminated (~$0.02-0.05 per chapter)
  }
}
