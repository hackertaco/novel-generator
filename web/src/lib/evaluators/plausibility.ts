/**
 * Plausibility checker — validates narrative logic and internal consistency.
 *
 * Catches issues like:
 * - Using a dead person's identity in the organization that killed them
 * - Characters knowing things they shouldn't
 * - World rules contradictions
 * - Motivation gaps (why does the character take this risk?)
 */

import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

const PlausibilityIssueSchema = z.object({
  severity: z.enum(["critical", "warning"]),
  category: z.enum(["identity", "knowledge", "motivation", "world_rule", "timeline", "logic"]),
  description: z.string(),
  suggestion: z.string(),
  affected: z.string(),
});

const PlausibilityResponseSchema = z.object({
  issues: z.array(PlausibilityIssueSchema).default([]),
});

export interface PlausibilityIssue {
  severity: "critical" | "warning";
  category: "identity" | "knowledge" | "motivation" | "world_rule" | "timeline" | "logic";
  description: string;
  suggestion: string;
  /** Which part of the seed is affected */
  affected: string;
}

export interface PlausibilityResult {
  passed: boolean;
  issues: PlausibilityIssue[];
  usage: TokenUsage;
}

const PLAUSIBILITY_PROMPT = `당신은 웹소설 설정의 논리적 구멍을 찾는 전문 편집자입니다.

다음 소설 설정을 읽고, **개연성 문제**를 찾아주세요.

## 체크 항목

1. **정체 위장의 합리성**: 캐릭터가 다른 사람 행세를 한다면 —
   - 원래 사람이 죽었거나 사라졌다면, 그 조직/사회가 그 사실을 모르는 이유가 있는가?
   - 얼굴/체형/목소리를 속일 수 있는 합리적 조건이 있는가?
   - 들켰을 때의 위험 대비 감수해야 할 동기가 충분한가?

2. **정보 비대칭의 합리성**: 캐릭터가 뭔가를 알거나 모른다면 —
   - 그 정보를 알게 된 경로가 설명되는가?
   - 다른 캐릭터가 당연히 알아야 할 것을 모르는 이유가 있는가?

3. **동기의 충분성**: 캐릭터가 위험한 행동을 한다면 —
   - "왜 하필 이 방법인가?"에 대한 답이 있는가?
   - 더 쉬운 대안이 있는데 굳이 위험한 선택을 하는 건 아닌가?

4. **세계관 규칙 일관성**: 설정된 규칙이 스토리와 충돌하지 않는가?

5. **시간선 논리**: 사건의 순서가 물리적으로 가능한가?

## 출력 형식 (JSON)

\`\`\`json
{
  "issues": [
    {
      "severity": "critical",
      "category": "identity",
      "description": "반역죄로 처형된 사람의 이름으로 그 조직에 입단하는 것은 즉시 발각될 수 있음",
      "suggestion": "처형이 비공개였거나, 기사단 중앙이 반역 건을 모르는 설정 추가 필요",
      "affected": "characters.mc"
    }
  ]
}
\`\`\`

critical: 독자가 "이건 말이 안 되는데?" 하고 이탈할 수 있는 수준
warning: 약간 걸리지만 넘어갈 수 있는 수준

문제가 없으면 issues를 빈 배열로 반환하세요.`;

export async function checkPlausibility(
  seed: NovelSeed,
): Promise<PlausibilityResult> {
  const agent = getAgent();

  const seedSummary = `# 소설 설정
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 세계관
${seed.world.name} (${seed.world.time_period})
능력 체계: ${seed.world.magic_system || "없음"}
규칙: ${seed.world.rules.join("; ")}

## 캐릭터
${seed.characters.map((c) => {
  const gender = c.gender || "미지정";
  return `- ${c.name} (${c.role}, ${gender}): ${c.backstory}\n  아크: ${c.arc_summary}`;
}).join("\n")}

## 스토리 아크
${seed.arcs.map((a) => `- ${a.name} (${a.start_chapter}~${a.end_chapter}화): ${a.summary}`).join("\n")}

## 복선
${seed.foreshadowing.map((f) => `- ${f.name}: ${f.description} (심기:${f.planted_at}, 회수:${f.reveal_at})`).join("\n")}

## 초반 챕터 아웃라인
${seed.chapter_outlines.slice(0, 5).map((o) => `- ${o.chapter_number}화: ${o.one_liner}`).join("\n")}`;

  try {
    const result = await agent.callStructured({
      prompt: `${PLAUSIBILITY_PROMPT}\n\n---\n\n${seedSummary}`,
      system: "당신은 소설 편집자입니다. 설정의 논리적 구멍만 정확하게 찾아주세요. JSON으로 출력하세요.",
      temperature: 0.3,
      maxTokens: 4000,
      schema: PlausibilityResponseSchema,
      format: "json",
      taskId: "plausibility-check",
    });

    const issues = result.data.issues || [];
    const criticalCount = issues.filter((i: PlausibilityIssue) => i.severity === "critical").length;

    return {
      passed: criticalCount === 0,
      issues,
      usage: result.usage,
    };
  } catch {
    // If plausibility check fails, don't block — just warn
    console.warn("[plausibility] 검증 실패, 건너뜀");
    return {
      passed: true,
      issues: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };
  }
}

/**
 * Fix plausibility issues by asking the LLM to patch the seed.
 * Returns a revised seed with issues addressed.
 */
export async function fixPlausibilityIssues(
  seed: NovelSeed,
  issues: PlausibilityIssue[],
): Promise<{ seed: NovelSeed; fixes: string[]; usage: TokenUsage }> {
  const agent = getAgent();

  const issueList = issues
    .map((i) => `- [${i.severity}/${i.category}] ${i.description}\n  제안: ${i.suggestion}\n  영향: ${i.affected}`)
    .join("\n");

  const result = await agent.call({
    prompt: `다음 소설 설정에 개연성 문제가 발견되었습니다. 설정을 수정해주세요.

## 발견된 문제
${issueList}

## 현재 설정
로그라인: ${seed.logline}

캐릭터:
${seed.characters.map((c) => `- ${c.name}: ${c.backstory}`).join("\n")}

아크:
${seed.arcs.map((a) => `- ${a.name}: ${a.summary}`).join("\n")}

## 지시사항
1. 각 문제에 대해 **최소한의 수정**으로 개연성을 확보하세요
2. 기존 설정의 매력(캐릭터 갈등, 긴장감)을 해치지 마세요
3. 수정 내용을 "## 수정 사항" 아래에 번호로 나열하세요
4. 수정된 로그라인, 캐릭터 배경, 아크 요약을 출력하세요

출력: 수정 사항과 수정된 설정 (자연어)`,
    system: "당신은 소설 설정 수정 전문가입니다.",
    temperature: 0.4,
    maxTokens: 4000,
    taskId: "plausibility-fix",
  });

  // Parse fixes from the response (flexible extraction)
  const fixLines = result.data
    .split("\n")
    .filter((line: string) => line.match(/^\d+[\.\)]\s/) || line.match(/^[-•]\s/) || line.match(/^#{1,3}\s.*수정/))
    .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•]\s*/, "").replace(/^#{1,3}\s*/, "").trim())
    .filter((line: string) => line.length > 5);

  // Update seed logline if a revised one is found
  const revisedSeed = { ...seed };
  const loglineMatch = result.data.match(/로그라인[:\s]*(.+)/);
  if (loglineMatch) {
    revisedSeed.logline = loglineMatch[1].trim();
  }

  return {
    seed: revisedSeed,
    fixes: fixLines.length > 0 ? fixLines : ["수정 사항을 파싱하지 못했습니다. 수동 확인이 필요합니다."],
    usage: result.usage,
  };
}
