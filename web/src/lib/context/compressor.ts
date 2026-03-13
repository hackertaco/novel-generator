import { getAgent } from "@/lib/agents/llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import { estimateTokens } from "./token-estimator";

/**
 * Check if any arcs need compression at the given chapter.
 * Returns arc names that just completed (end_chapter === currentChapter - 1).
 */
export function getCompletedArcs(
  seed: NovelSeed,
  currentChapter: number,
  existingCompressed: Set<string>,
): string[] {
  return seed.arcs
    .filter(
      (arc) =>
        arc.end_chapter === currentChapter - 1 &&
        !existingCompressed.has(arc.name),
    )
    .map((arc) => arc.name);
}

/**
 * Compress all chapter summaries for a completed arc into a ~200 token summary.
 * Uses a low-cost model (gpt-4o-mini equivalent).
 */
export async function compressArcSummary(
  arcName: string,
  seed: NovelSeed,
  arcSummaries: ChapterSummary[],
): Promise<{ summary: string; tokens: number; cost_usd: number }> {
  const arc = seed.arcs.find((a) => a.name === arcName);
  if (!arc) throw new Error(`Arc "${arcName}" not found`);

  // Build the input: all chapter summaries for this arc
  const chaptersText = arcSummaries
    .filter(
      (s) =>
        s.chapter_number >= arc.start_chapter &&
        s.chapter_number <= arc.end_chapter,
    )
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((s) => `${s.chapter_number}화 "${s.title}": ${s.plot_summary}`)
    .join("\n");

  const prompt = `다음은 웹소설 "${seed.title}"의 아크 "${arcName}" (${arc.start_chapter}~${arc.end_chapter}화)의 챕터별 요약입니다.

${chaptersText}

이 아크 전체를 200자 이내로 압축 요약해주세요. 핵심 사건, 캐릭터 변화, 주요 반전만 포함하세요.
출력: 요약 텍스트만 (메타 정보 없이)`;

  const agent = getAgent();
  const result = await agent.call({
    prompt,
    system:
      "당신은 소설 요약 전문가입니다. 간결하고 핵심적인 요약을 합니다.",
    temperature: 0.3,
    maxTokens: 500,
    taskId: `compress-arc-${arcName}`,
  });

  const summary = result.data.trim();
  return {
    summary,
    tokens: estimateTokens(summary),
    cost_usd: result.usage.cost_usd,
  };
}

/**
 * Compress all newly completed arcs.
 * Returns a map of arc name -> compressed summary.
 */
export async function compressNewlyCompletedArcs(
  seed: NovelSeed,
  currentChapter: number,
  allSummaries: ChapterSummary[],
  existingCompressed: Record<string, string>,
): Promise<Record<string, string>> {
  const existingSet = new Set(Object.keys(existingCompressed));
  const arcsToCompress = getCompletedArcs(seed, currentChapter, existingSet);

  if (arcsToCompress.length === 0) return existingCompressed;

  const result = { ...existingCompressed };
  for (const arcName of arcsToCompress) {
    const compressed = await compressArcSummary(arcName, seed, allSummaries);
    result[arcName] = compressed.summary;
  }

  return result;
}
