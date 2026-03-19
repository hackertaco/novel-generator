/**
 * ConsistencyChecker — post-generation verification against settings.
 *
 * Separate from CriticAgent (which evaluates style/craft).
 * This checks factual consistency:
 * - Character voice matches their profile
 * - World rules are not violated
 * - Timeline events don't contradict
 * - Dead/absent characters don't appear
 * - Location/time continuity
 */

import { z } from "zod";
import { getAgent } from "./llm-agent";
import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";
import { accumulateUsage } from "./pipeline";

const ConsistencyIssueSchema = z.object({
  type: z.enum(["voice", "world_rule", "timeline", "character_state", "location", "knowledge"]),
  severity: z.enum(["critical", "warning"]),
  description: z.string(),
  evidence: z.string().describe("본문에서 문제가 되는 구체적 문장/대사"),
  fix_suggestion: z.string(),
});

const ConsistencyReportSchema = z.object({
  issues: z.array(ConsistencyIssueSchema).default([]),
  voice_check: z.object({
    passed: z.boolean(),
    details: z.string().default(""),
  }).default({ passed: true, details: "" }),
});

export type ConsistencyIssue = z.infer<typeof ConsistencyIssueSchema>;

/**
 * ConsistencyChecker runs after WriterAgent and before QualityLoop.
 * If critical issues are found, it asks the writer to fix them.
 */
export class ConsistencyChecker implements PipelineAgent {
  name = "consistency-checker";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    if (!ctx.text || ctx.text.length < 500) return;

    yield { type: "stage_change", stage: "consistency_check" };

    const agent = getAgent();
    const { seed, chapterNumber } = ctx;

    // Build settings reference
    const charProfiles = seed.characters
      .filter((c) => c.introduction_chapter <= chapterNumber)
      .map((c) => {
        const gender = c.gender || "male";
        const genderLabel = gender === "female" ? "여성" : "남성";
        const state = c.state;
        return `### ${c.name} (${c.id}, ${c.role}, ${genderLabel})
말투: ${c.voice.tone}
말투 특징: ${c.voice.speech_patterns?.join(", ") || "없음"}
대사 예시: ${c.voice.sample_dialogues?.slice(0, 3).map((d) => `"${d}"`).join(", ") || "없음"}
현재 상태: ${state.status || "normal"}
현재 위치: ${state.location || "불명"}
관계: ${Object.entries(state.relationships || {}).map(([k, v]) => `${k}(${v})`).join(", ") || "없음"}
알고 있는 비밀: ${state.secrets_known?.join(", ") || "없음"}`;
      })
      .join("\n\n");

    const worldRules = seed.world.rules.length > 0
      ? seed.world.rules.join("\n- ")
      : "특별한 규칙 없음";

    const prompt = `다음 소설 본문이 설정과 일치하는지 검증하세요.

## 세계관
이름: ${seed.world.name}
시대: ${seed.world.time_period}
능력 체계: ${seed.world.magic_system || "없음"}
규칙:
- ${worldRules}

## 캐릭터 설정
${charProfiles}

## ${chapterNumber}화 본문
${ctx.text.slice(0, 6000)}

## 검증 항목

1. **말투 일관성 (voice)**: 각 캐릭터의 대사가 설정된 말투와 일치하는가?
   - 존댓말/반말 혼용 없는가?
   - 캐릭터 고유 어미/패턴이 유지되는가?
   - A 캐릭터가 B 캐릭터의 말투로 말하고 있지 않은가?

2. **세계관 규칙 (world_rule)**: 설정된 규칙이 위반되지 않는가?
   - 마법/능력 체계에 맞는가?
   - 시대에 맞지 않는 용어/기술이 사용되지 않는가?

3. **캐릭터 상태 (character_state)**:
   - 부상/사망한 캐릭터가 멀쩡하게 행동하는가?
   - 모르는 정보를 아는 것처럼 행동하는가?
   - 있어야 할 곳이 아닌 곳에 있는가?

4. **타임라인 (timeline)**: 사건 순서가 논리적인가?

5. **위치 연속성 (location)**: 장소 이동이 자연스러운가?

## 출력 (JSON)
\`\`\`json
{
  "issues": [
    {
      "type": "voice",
      "severity": "critical",
      "description": "유디트가 반말을 사용함 (설정은 존댓말)",
      "evidence": "\"가자.\" 유디트가 말했다.",
      "fix_suggestion": "\"가시죠.\" 유디트가 말했다."
    }
  ],
  "voice_check": {
    "passed": false,
    "details": "유디트의 말투가 2곳에서 설정과 불일치"
  }
}
\`\`\`

문제가 없으면 issues를 빈 배열로 반환하세요. critical만 수정이 필요합니다.`;

    try {
      const result = await agent.callStructured({
        prompt,
        system: "당신은 소설 설정 일관성 검증 전문가입니다. 본문과 설정을 비교하여 불일치를 찾아냅니다.",
        schema: ConsistencyReportSchema,
        format: "json",
        temperature: 0.2,
        maxTokens: 2000,
        taskId: `consistency-check-${chapterNumber}`,
      });

      ctx.totalUsage = accumulateUsage(ctx.totalUsage, result.usage);
      yield { type: "usage", ...result.usage };

      const report = result.data;
      const criticalIssues = report.issues.filter((i) => i.severity === "critical");

      if (criticalIssues.length > 0) {
        // Build repair prompt with specific fixes
        const fixInstructions = criticalIssues.map((issue, idx) =>
          `${idx + 1}. [${issue.type}] ${issue.description}\n   문제 부분: "${issue.evidence}"\n   수정 방향: ${issue.fix_suggestion}`
        ).join("\n");

        yield { type: "stage_change", stage: "consistency_fix" };

        const fixResult = await agent.call({
          prompt: `다음 소설 본문에서 설정 일관성 문제가 발견되었습니다. 수정해주세요.

## 발견된 문제
${fixInstructions}

## 수정 규칙
- 문제가 있는 부분만 최소한으로 수정하세요
- 전체 흐름과 감정을 해치지 마세요
- 수정된 전체 본문을 출력하세요

## 현재 본문
${ctx.text}`,
          system: "당신은 소설 편집자입니다. 설정 일관성 문제만 최소한으로 수정하세요.",
          temperature: 0.2,
          maxTokens: 12000,
          taskId: `consistency-fix-${chapterNumber}`,
        });

        ctx.totalUsage = accumulateUsage(ctx.totalUsage, fixResult.usage);
        yield { type: "usage", ...fixResult.usage };

        const fixedText = fixResult.data.trim();
        if (fixedText.length > ctx.text.length * 0.7) {
          ctx.text = fixedText;
          yield { type: "replace_text", content: ctx.text };
        }
      }

      // Report voice check status
      if (!report.voice_check.passed) {
        ctx.ruleIssues.push({
          type: "consistency",
          severity: "warning",
          message: `말투 일관성: ${report.voice_check.details}`,
          position: 0,
          detail: report.voice_check.details,
        });
      }
    } catch (err) {
      console.warn(`[consistency-checker] 검증 실패, 건너뜀: ${err instanceof Error ? err.message : err}`);
    }
  }
}
