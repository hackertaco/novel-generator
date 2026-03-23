import type { StyleGuide } from "../schema/novel";

export interface StyleResult {
  dialogue_ratio: {
    actual_ratio: number;
    target_ratio: number;
    score: number;
    pass: boolean;
  };
  paragraph_length: {
    total_paragraphs: number;
    violations: number;
    max_allowed_sentences: number;
    score: number;
    pass: boolean;
  };
  sentence_length: {
    total_sentences: number;
    short_sentences: number;
    short_ratio: number;
    score: number;
    pass: boolean;
  };
  hook_ending: {
    has_hook: boolean;
    last_paragraph: string;
    score: number;
    pass: boolean;
  };
  overall_score: number;
}

export function evaluateStyle(
  content: string,
  styleGuide: StyleGuide,
): StyleResult {
  const dialogueResult = checkDialogueRatio(content, styleGuide.dialogue_ratio);
  const paragraphResult = checkParagraphLength(
    content,
    styleGuide.max_paragraph_length,
  );
  const sentenceResult = checkSentenceLength(content);
  const hookResult = checkHookEnding(content);

  const overall =
    dialogueResult.score * 0.3 +
    paragraphResult.score * 0.2 +
    sentenceResult.score * 0.2 +
    hookResult.score * 0.3;

  return {
    dialogue_ratio: dialogueResult,
    paragraph_length: paragraphResult,
    sentence_length: sentenceResult,
    hook_ending: hookResult,
    overall_score: overall,
  };
}

function checkDialogueRatio(content: string, target: number) {
  const dialoguePattern = /["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]/g;
  let dialogueChars = 0;
  let match;
  while ((match = dialoguePattern.exec(content)) !== null) {
    dialogueChars += match[1].length;
  }
  const totalChars = content.length;
  const ratio = totalChars > 0 ? dialogueChars / totalChars : 0;
  const score = 1.0 - Math.min(Math.abs(ratio - target) / target, 1.0);
  return {
    actual_ratio: ratio,
    target_ratio: target,
    score,
    pass: score >= 0.7,
  };
}

function checkParagraphLength(content: string, maxAllowed: number) {
  const paragraphs = content.split("\n\n").filter((p) => p.trim());
  let violations = 0;
  for (const para of paragraphs) {
    const sentences = para.split(/[.!?]\s+/);
    if (sentences.length > maxAllowed) violations++;
  }
  const score =
    paragraphs.length > 0 ? 1.0 - violations / paragraphs.length : 1.0;
  return {
    total_paragraphs: paragraphs.length,
    violations,
    max_allowed_sentences: maxAllowed,
    score,
    pass: score >= 0.8,
  };
}

function checkSentenceLength(content: string) {
  const sentences = content.split(/[.!?]\s+/).filter((s) => s.trim());
  const shortThreshold = 50;
  const shortCount = sentences.filter(
    (s) => s.length <= shortThreshold,
  ).length;
  const ratio = sentences.length > 0 ? shortCount / sentences.length : 1.0;
  return {
    total_sentences: sentences.length,
    short_sentences: shortCount,
    short_ratio: ratio,
    score: ratio,
    pass: ratio >= 0.6,
  };
}

function checkHookEnding(content: string) {
  const paragraphs = content.split("\n\n").filter((p) => p.trim());
  if (paragraphs.length === 0)
    return { has_hook: false, last_paragraph: "", score: 0, pass: false };

  const lastPara = paragraphs[paragraphs.length - 1];
  const hookPatterns = [
    /\.{3}$/,           // 말줄임표
    /[?!]$/,            // 의문/감탄
    /["\u201C\u201D]/, // 대사로 끝남 (긴장감 있는 대사 후킹)
    /그때/,
    /순간/,
    /하지만/,
    /그러나/,
    /바로/,
    /아니/,
    /없었다\.$/,        // 부정적 종결 (불안감)
    /못했다\.$/,
    /몰랐다\.$/,
    /않았다\.$/,
    /있었다\.$/,        // 존재/발견 종결
    /보였다\.$/,
    /들렸다\.$/,
    /열렸다\.$/,
    /닫혔다\.$/,
  ];
  const hasHook = hookPatterns.some((p) => p.test(lastPara));

  return {
    has_hook: hasHook,
    last_paragraph:
      lastPara.length > 100 ? lastPara.slice(0, 100) + "..." : lastPara,
    score: hasHook ? 1.0 : 0.3,
    pass: hasHook,
  };
}
