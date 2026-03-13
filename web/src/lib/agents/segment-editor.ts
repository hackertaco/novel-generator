import { getAgent } from "./llm-agent";
import type { TokenUsage } from "./types";
import type { Segment } from "./segmenter";
import type { SegmentIssue } from "@/lib/evaluators/issue-locator";
import type { NovelSeed } from "@/lib/schema/novel";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";

export function buildSegmentEditPrompt(
  target: Segment,
  issues: string[],
  prev: Segment | null,
  next: Segment | null,
  genre: string,
  issueContext?: SegmentIssue["context"],
): string {
  let contextSection = "";
  if (issueContext?.characterVoice && issueContext.characterVoice.length > 0) {
    contextSection += "\n## 캐릭터 말투 참고\n";
    for (const cv of issueContext.characterVoice) {
      contextSection += `- ${cv.name}: ${cv.speechPatterns.join(", ")}\n`;
    }
  }
  if (issueContext?.foreshadowing && issueContext.foreshadowing.length > 0) {
    contextSection += "\n## 복선 참고\n";
    for (const fs of issueContext.foreshadowing) {
      contextSection += `- ${fs.name}: ${fs.description}\n`;
    }
  }

  const prevSection = prev
    ? `--- 문맥 (읽기 전용, 수정하지 마세요) ---\n${prev.text}\n\n`
    : "";
  const nextSection = next
    ? `\n\n--- 문맥 (읽기 전용, 수정하지 마세요) ---\n${next.text}`
    : "";

  return `당신은 카카오페이지 웹소설 전문 편집자입니다.
아래 "수정 대상" 구간만 수정하세요. 문맥 구간은 절대 수정하지 마세요.

장르: ${genre}
${contextSection}
${prevSection}--- 수정 대상 ---
${target.text}
${nextSection}

--- 수정 지시 ---
${issues.map((i) => `- ${i}`).join("\n")}

출력: 수정된 "수정 대상" 본문만. 문맥 구간은 출력하지 마세요.`;
}

export async function* editSegment(
  target: Segment,
  issues: string[],
  prev: Segment | null,
  next: Segment | null,
  seed: NovelSeed,
  chapterNumber: number,
  issueContext?: SegmentIssue["context"],
): AsyncGenerator<string, TokenUsage> {
  const agent = getAgent();
  const tier = selectModelTier(seed, chapterNumber);
  const model = getModelForTier(tier);

  const prompt = buildSegmentEditPrompt(
    target, issues, prev, next, seed.world.genre, issueContext,
  );

  const stream = agent.callStream({
    prompt,
    system: "당신은 소설의 특정 구간만 수정하는 편집자입니다. 지시된 문제만 고치고, 문체와 톤은 유지하세요.",
    model,
    temperature: 0.3,
    maxTokens: 3000,
    taskId: `segment-edit-${chapterNumber}-${target.id}`,
  });

  let result = await stream.next();
  while (!result.done) {
    yield result.value;
    result = await stream.next();
  }
  return result.value;
}
