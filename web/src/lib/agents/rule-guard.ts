import type { RuleIssue, ChapterContext, PipelineAgent, LifecycleEvent } from "@/lib/agents/pipeline";
import { enforceLength, DEFAULT_TARGET_CHARS, DEFAULT_TOLERANCE } from "@/lib/agents/length-enforcer";
import { enforceSpeechLevels } from "@/lib/evaluators/speech-level-enforcer";

// ---------------------------------------------------------------------------
// Sanitize — remove LLM meta markers from generated text
// ---------------------------------------------------------------------------

export function sanitize(text: string): string {
  let result = text;

  // Remove lines like "--- 수정 대상 ---", "--- 수정 지시 ---", "--- 문맥 ---", etc.
  result = result.replace(/^-{2,}\s*(수정|편집|문맥|수정\s*대상|수정\s*지시).*-{2,}$/gm, "");

  // Remove lines starting with "수정:" or "수정 :"
  result = result.replace(/^수정\s*:\s*.*/gm, "");

  // Remove editor note bracket lines like "[편집자 노트: ...]"
  result = result.replace(/^\[편집[^\]]*\]$/gm, "");

  // Remove LLM meta commentary that leaks into novel text
  result = result.replace(/^.*(수정본|정리했습니다|교정[된하]|다듬[었어]|윤문[했된]|아래는.*본문).{0,30}$/gm, "");

  // Remove scene meta markers from bridge stitching and LLM output
  result = result.replace(/^#{0,3}\s*(수정된\s*)?씬\s*\d+\s*(시작부분|끝부분|연결부분|시작|끝)?.*$/gm, "");

  // Remove LLM format acknowledgments and meta markers
  result = result.replace(/^(출력은|결과물은|아래는|다음은).*?(형식|포맷|요청).*$/gm, "");
  result = result.replace(/^\[(원문|계속|이어서|다음|원본)\]$/gm, "");

  // Remove editorial headers: "## 교정 결과", "### 수정 사항" etc.
  result = result.replace(/^#{1,3}\s*(교정|수정|편집|윤문|개선).*$/gm, "");

  // Collapse multiple blank lines left behind by removals
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

// ---------------------------------------------------------------------------
// DeduplicateParagraphs — remove repeat paragraphs (exact or near-match)
// ---------------------------------------------------------------------------

export function deduplicateParagraphs(text: string): string {
  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const para of paragraphs) {
    // Use first 50 characters as the fingerprint
    const fingerprint = para.slice(0, 50);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(para);
    }
  }

  return unique.join("\n\n");
}

// ---------------------------------------------------------------------------
// FixEndingRepeat — deterministic ending variation (no LLM)
// ---------------------------------------------------------------------------

/**
 * Fix ending repeats by merging the 2nd sentence of a 3-run into the 3rd
 * using a connective ending (~었고, / ~였으며, / ~인 채).
 *
 * Example:
 *   "문은 닫혀 있었다. 정원사가 흙을 고르고 있었다. 그녀는 가까이 붙었다."
 * → "문은 닫혀 있었다. 정원사가 흙을 고르고 있었고, 그녀는 가까이 붙었다."
 */
export function fixEndingRepeat(text: string): string {
  const paragraphs = text.split("\n\n");
  let changed = false;

  const connectives: Record<string, string[]> = {
    "었다": ["었고,", "었으며,"],
    "였다": ["였고,", "였으며,"],
    "렸다": ["렸고,", "렸으며,"],
    "했다": ["했고,", "했으며,"],
    "니다": ["니다만,", "는데,"],
    "는다": ["는데,", "으며,"],
    "인다": ["인데,", "이며,"],
    "는지": ["는지,", "는지는 모르겠으나"],
    "왔다": ["왔고,", "왔으며,"],
    "갔다": ["갔고,", "갔으며,"],
    "졌다": ["졌고,", "졌으며,"],
    "났다": ["났고,", "났으며,"],
    "셨다": ["셨고,", "셨으며,"],
  };

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi]
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length < 3) continue;

    const fixed = [...sentences];
    let i = 0;
    while (i < fixed.length - 2) {
      const e1 = fixed[i].match(/(.{2})[.]\s*$/)?.[1];
      const e2 = fixed[i + 1].match(/(.{2})[.]\s*$/)?.[1];
      const e3 = fixed[i + 2].match(/(.{2})[.]\s*$/)?.[1];

      if (e1 && e1 === e2 && e2 === e3) {
        // Merge sentence i+1 into sentence i+2 using connective
        const options = connectives[e2] || [`${e2.slice(-1)}고,`];
        const replacement = options[0];
        // Replace "었다." at end of sentence i+1 with connective
        const merged = fixed[i + 1].replace(/(.{2})[.]\s*$/, replacement);
        // Lowercase first char of sentence i+2 (Korean doesn't have case, just merge)
        fixed[i + 1] = merged + " " + fixed[i + 2];
        fixed.splice(i + 2, 1);
        changed = true;
        i += 2; // skip past the merged sentence
      } else {
        i++;
      }
    }

    if (changed) {
      paragraphs[pi] = fixed.join(" ");
    }
  }

  return changed ? paragraphs.join("\n\n") : text;
}

// ---------------------------------------------------------------------------
// FixSentenceStartRepeat — replace repeated name with pronoun
// ---------------------------------------------------------------------------

/**
 * When 3+ consecutive sentences start with the same name,
 * replace the 2nd sentence's name with a pronoun (그/그녀).
 */
export function fixSentenceStartRepeat(
  text: string,
  characterGenders?: Map<string, string>,
): string {
  const paragraphs = text.split("\n\n");
  let changed = false;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi]
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length < 3) continue;

    const fixed = [...sentences];
    let i = 0;
    while (i < fixed.length - 2) {
      const s1 = fixed[i].trimStart().slice(0, 3);
      const s2 = fixed[i + 1].trimStart().slice(0, 3);
      const s3 = fixed[i + 2].trimStart().slice(0, 3);

      if (s1.length >= 2 && s1 === s2 && s2 === s3) {
        const nameMatch = fixed[i + 1].match(/^([가-힣]{2,}[이가은는의]?\s?)/);
        if (nameMatch) {
          const name = nameMatch[1].replace(/[이가은는의]\s?$/, "");
          const gender = characterGenders?.get(name);
          const pronoun = gender === "female" ? "그녀는" : "그는";
          fixed[i + 1] = fixed[i + 1].replace(nameMatch[1], pronoun + " ");
          changed = true;
        }
        i += 3;
      } else {
        i++;
      }
    }

    if (changed) {
      paragraphs[pi] = fixed.join(" ");
    }
  }

  return changed ? paragraphs.join("\n\n") : text;
}

// ---------------------------------------------------------------------------
// DeduplicateSentences — remove repeated sentences within/across paragraphs
// ---------------------------------------------------------------------------

/**
 * Remove duplicate sentences that appear within the same chapter.
 * This catches bridge-stitching artifacts where the same sentence
 * appears twice in adjacent paragraphs or within the same paragraph.
 */
export function deduplicateSentences(text: string): string {
  const paragraphs = text.split("\n\n");
  const seenSentences = new Set<string>();
  const result: string[] = [];

  for (const para of paragraphs) {
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const uniqueSentences: string[] = [];
    for (const sent of sentences) {
      // Use first 30 chars as fingerprint (handles minor trailing differences)
      const fp = sent.slice(0, 30);
      if (fp.length >= 15 && seenSentences.has(fp)) {
        continue; // skip duplicate
      }
      seenSentences.add(fp);
      uniqueSentences.push(sent);
    }

    if (uniqueSentences.length > 0) {
      result.push(uniqueSentences.join(" "));
    }
  }

  return result.join("\n\n");
}

// ---------------------------------------------------------------------------
// Sentence splitting helper
// ---------------------------------------------------------------------------

/**
 * Split text into individual sentences.
 * Handles Korean sentence endings (다., 요., 지., 나., 까.) and standard punctuation.
 */
function splitSentences(text: string): string[] {
  // Split on whitespace that follows a sentence-ending punctuation character.
  // Korean sentences typically end with 다. 요. 지. 나. 까. or plain . ! ?
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

// ---------------------------------------------------------------------------
// DetectEndingRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the 2-character ending suffix before the final punctuation mark.
 * e.g. "걸었다." → "었다", "웃었다!" → "었다"
 */
function extractEnding(sentence: string): string | null {
  // Match the two chars immediately before a terminal punctuation
  const match = sentence.match(/(.{2})[.!?]\s*$/);
  return match ? match[1] : null;
}

export function detectEndingRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentEnding = extractEnding(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const ending = extractEnding(sentences[i]);
      if (ending !== null && ending === currentEnding) {
        runLength++;
        if (runLength >= 3) {
          // Only emit one issue per run (when we first hit 3)
          if (runLength === 3) {
            issues.push({
              type: "ending_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 어미 "${currentEnding}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentEnding = ending;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// DetectSentenceStartRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the first 2 characters of a trimmed sentence.
 * e.g. "그는 걸었다." → "그는"
 */
function extractStart(sentence: string): string {
  return sentence.trimStart().slice(0, 2);
}

export function detectSentenceStartRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentStart = extractStart(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const start = extractStart(sentences[i]);
      if (start === currentStart) {
        runLength++;
        if (runLength >= 3) {
          if (runLength === 3) {
            issues.push({
              type: "sentence_start_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 문장 시작 "${currentStart}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentStart = start;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Short dialogue sequence detection
// ---------------------------------------------------------------------------

/**
 * Detect chains of short dialogue lines without meaningful narration between them.
 * "Short" = dialogue text (excluding quotes/punctuation) is 5 chars or fewer.
 * "Meaningful narration" = non-dialogue text of 6+ chars between two dialogues.
 * Chains of 3+ short dialogues trigger issues.
 */
export function detectShortDialogueSequence(text: string): RuleIssue[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const issues: RuleIssue[] = [];
  const dPattern = /[""\u201C]([^""\u201D]*?)[""\u201D]/g;

  let chainStart = -1;
  let chainCount = 0;
  let veryShortCount = 0;

  const flushChain = (endLine: number) => {
    if (chainCount >= 3) {
      const severity = chainCount >= 5 || veryShortCount / chainCount >= 0.75 ? "critical" : "warning";
      issues.push({
        type: "short_dialogue_sequence",
        position: chainStart,
        detail: `${chainStart + 1}~${endLine}행: 짧은 대사 ${chainCount}개가 서술 없이 연속됩니다. 대사 사이에 행동/감정 묘사를 추가하세요.`,
        severity,
      });
    }
    chainCount = 0;
    veryShortCount = 0;
    chainStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dialogues: string[] = [];
    let match: RegExpExecArray | null;
    dPattern.lastIndex = 0;

    while ((match = dPattern.exec(line)) !== null) {
      dialogues.push(match[1]);
    }

    if (dialogues.length === 0) {
      // Pure narration — meaningful if 6+ chars
      const pureText = line.replace(/[""\u201C\u201D]/g, "").trim();
      if (pureText.length >= 6) flushChain(i);
      continue;
    }

    for (const d of dialogues) {
      const cleaned = d.replace(/[.!?…。\s]/g, "");
      if (cleaned.length <= 5) {
        if (chainStart === -1) chainStart = i;
        chainCount++;
        if (cleaned.length <= 2) veryShortCount++;
      } else {
        flushChain(i);
      }
    }

    // Check narration after dialogue in same line
    const afterDialogue = line.replace(dPattern, "").trim();
    if (afterDialogue.length >= 6 && chainCount > 0) {
      flushChain(i);
    }
  }

  flushChain(lines.length);
  return issues;
}

// ---------------------------------------------------------------------------
// RuleGuardAgent — PipelineAgent implementation
// ---------------------------------------------------------------------------

export class RuleGuardAgent implements PipelineAgent {
  name = "rule-guard";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "rule_check" };

    ctx.text = sanitize(ctx.text);
    ctx.text = deduplicateParagraphs(ctx.text);
    ctx.text = deduplicateSentences(ctx.text);
    ctx.text = fixEndingRepeat(ctx.text);

    // Fix sentence start repetition (e.g., "세레인이... 세레인은... 세레인의..." → pronoun)
    const genderMap = new Map<string, string>();
    for (const c of ctx.seed.characters) {
      genderMap.set(c.name, c.gender || "male");
      // Also map first 2 chars of name for partial matching
      if (c.name.length >= 2) genderMap.set(c.name.slice(0, 2), c.gender || "male");
    }
    ctx.text = fixSentenceStartRepeat(ctx.text, genderMap);

    // Speech level enforcement — fix Korean 화계 violations based on social_rank
    const speechResult = enforceSpeechLevels(
      ctx.text,
      ctx.seed,
      ctx.chapterNumber,
      ctx.blueprint,
    );
    ctx.text = speechResult.text;

    // Length enforcement — trim low-density paragraphs if too long
    const mustRevealKeywords = ctx.blueprint?.scenes
      ?.flatMap((s) => s.must_reveal ?? [])
      .flatMap((fact) => fact.match(/[가-힣]{3,}/g) ?? []) ?? [];
    const lengthResult = enforceLength(
      ctx.text,
      DEFAULT_TARGET_CHARS,
      DEFAULT_TOLERANCE,
      mustRevealKeywords,
    );
    ctx.text = lengthResult.text;

    ctx.ruleIssues = [
      ...detectEndingRepeat(ctx.text),
      ...detectSentenceStartRepeat(ctx.text),
      ...detectShortDialogueSequence(ctx.text),
      ...detectMissingInformation(ctx.text, ctx.blueprint),
      ...speechResult.violations.map((v) => ({
        type: "speech_level_violation" as const,
        position: v.position,
        detail: `[화계 위반] ${v.speaker}->${v.listener}: "${v.dialogueText.slice(0, 30)}..." 감지=${v.detectedLevel}, 기대=${v.expectedLevel}`,
        severity: "warning" as const,
      })),
    ];
  }
}

// ---------------------------------------------------------------------------
// DetectMissingInformation — check must_reveal facts against actual text
// ---------------------------------------------------------------------------

/**
 * Check if blueprint's must_reveal facts actually appear in the written text.
 * Uses keyword extraction from each fact and checks presence in text.
 */
function detectMissingInformation(
  text: string,
  blueprint?: { scenes: Array<{ must_reveal?: string[] }> },
): RuleIssue[] {
  if (!blueprint || !blueprint.scenes) return [];

  const issues: RuleIssue[] = [];
  const normalizedText = text.replace(/\s+/g, " ").toLowerCase();

  for (const scene of blueprint.scenes) {
    if (!scene.must_reveal) continue;
    for (const fact of scene.must_reveal) {
      // Extract meaningful keywords (3+ char Korean words) from the fact
      const keywords = fact.match(/[가-힣]{3,}/g) || [];
      if (keywords.length === 0) continue;

      // Check if at least half the keywords appear in text
      const found = keywords.filter((kw) => normalizedText.includes(kw.toLowerCase()));
      if (found.length < Math.ceil(keywords.length * 0.5)) {
        issues.push({
          type: "consistency" as const,
          position: 0,
          detail: `[정보 누락] 블루프린트에서 요구한 팩트가 본문에 없습니다: "${fact}" (키워드 ${found.length}/${keywords.length} 매칭)`,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}
