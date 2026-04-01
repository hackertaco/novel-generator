/**
 * Direction Designer — 연출 설계 생성기
 *
 * Sits between seed generation and blueprint generation.
 * Generates narrative direction metadata (address matrix, info budget,
 * emotion curve, hook strategy) that guides how the story is told.
 */

import { getAgent } from "@/lib/agents/llm-agent";
import { DirectionDesignSchema, type DirectionDesign } from "@/lib/schema/direction";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

/**
 * Build the prompt for generating a DirectionDesign from a seed.
 */
export function buildDirectionDesignPrompt(seed: NovelSeed): string {
  // Build character pairs for address matrix
  const charPairs: string[] = [];
  for (let i = 0; i < seed.characters.length; i++) {
    for (let j = 0; j < seed.characters.length; j++) {
      if (i === j) continue;
      const a = seed.characters[i];
      const b = seed.characters[j];
      charPairs.push(`${a.name}(${a.role}${a.social_rank ? `/${a.social_rank}` : ""}) → ${b.name}(${b.role}${b.social_rank ? `/${b.social_rank}` : ""})`);
    }
  }

  // Build arc info for emotion curve
  const arcInfo = seed.arcs.map((a) =>
    `- ${a.name} (${a.start_chapter}~${a.end_chapter}화): ${a.summary}`,
  ).join("\n");

  // Chapter 1 outline for hook strategy
  const ch1Outline = seed.chapter_outlines.find((o) => o.chapter_number === 1);
  const ch1Info = ch1Outline
    ? `1화 아웃라인: ${ch1Outline.one_liner}\n핵심 사건: ${ch1Outline.key_points.map((p) => typeof p === "string" ? p : p.what).join(", ")}`
    : "1화 아웃라인 없음";

  return `당신은 한국 웹소설 연출 설계 전문가입니다. 소설 시드를 분석하고, 서사 연출에 필요한 메타데이터를 생성해주세요.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
총 화수: ${seed.total_chapters}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}${c.social_rank ? `/${c.social_rank}` : ""}): ${c.voice.tone}, 성격: ${c.voice.personality_core}`).join("\n")}

## 아크 구조
${arcInfo || "미정"}

## ${ch1Info}

---

다음 4가지를 생성해주세요:

### 1. 호칭 매트릭스 (address_matrix)
각 캐릭터 쌍에 대해 호칭과 존댓말 수준을 정의하세요.
고려할 캐릭터 쌍:
${charPairs.join("\n")}

**규칙:**
- social_rank가 높은 쪽에게는 격식체/존댓말
- 같은 rank면 관계에 따라 결정
- 비밀 관계(예: 적이지만 연인)면 공식/비공식 호칭 구분 note에 기재
- 예시: from:"카시안", to:"레오나", address:"레오나", speech_level:"casual", note:"둘만 있을 때"

### 2. 정보 예산 (info_budget)
챕터 구간별로 정보 공개량을 제한하세요.

**구간 예시:**
- "1-3" (도입): 새 캐릭터 2명 이하, 새 개념 1개, 행동으로만 전달, 회상 금지
- "4-10" (전개): 새 캐릭터 3명, 새 개념 2개, 짧은 설명 허용, 한 문장 회상
- "11-30" (심화): 새 캐릭터 2명, 새 개념 3개, 서술 허용, 회상 씬 가능

**info_priority에는 각 구간에서 독자에게 알려줄 정보를 우선순위대로 나열하세요.**

### 3. 감정 커브 (emotion_curve)
챕터 구간별 목표 감정과 긴장도를 설정하세요.

**규칙:**
- primary_emotion: 궁금, 긴장, 설렘, 분노, 슬픔, 카타르시스, 공포, 안도 등
- tension_range: "3→7" (점진적 상승) 또는 "steady 5" (유지)
- reader_question: 독자가 이 구간에서 품어야 할 핵심 질문

### 4. 1화 훅 전략 (hook_strategy)
1화 첫 3문단의 구체적 전략을 세우세요.

**규칙:**
- opening_scene: 가장 흥미로운 순간부터 시작 (in medias res 권장)
- reader_knows_in_3_paragraphs: 3문단 안에 독자가 알아야 할 정보 3가지
- reader_must_NOT_know: 1화에서 절대 밝히면 안 되는 정보 (서스펜스)
- emotional_hook: 독자가 느낄 감정적 매력 포인트

## 출력 형식 (JSON)

\`\`\`json
{
  "address_matrix": [
    {
      "from": "카시안",
      "to": "레오나",
      "address": "레오나",
      "speech_level": "casual",
      "note": "둘만 있을 때"
    }
  ],
  "info_budget": [
    {
      "chapter_range": "1-3",
      "new_characters_max": 2,
      "new_concepts_max": 1,
      "worldbuilding_style": "action_only",
      "backstory_allowed": "none",
      "info_priority": ["주인공의 처지", "세계관 핵심 규칙"]
    }
  ],
  "emotion_curve": [
    {
      "chapter_range": "1-3",
      "primary_emotion": "궁금",
      "tension_range": "3→6",
      "reader_question": "이 주인공은 어떻게 살아남을까?"
    }
  ],
  "hook_strategy": {
    "opening_scene": "독화살이 날아오는 혼례식 한가운데",
    "reader_knows_in_3_paragraphs": ["주인공은 적국 공주", "정략 결혼", "누군가 황제를 죽이려 함"],
    "reader_must_NOT_know": ["황제가 이미 알고 있었다는 사실"],
    "emotional_hook": "죽을 수도 있는 상황에서 냉정한 주인공의 매력"
  }
}
\`\`\`

JSON만 출력하세요.`;
}

/**
 * Build a minimal fallback DirectionDesign from seed data.
 * Used when LLM generation fails.
 */
function buildFallbackDesign(seed: NovelSeed): DirectionDesign {
  console.warn("[direction-designer] LLM 생성 실패, 폴백 사용");

  // Minimal address matrix from character relationships
  const addressMatrix = [];
  for (let i = 0; i < seed.characters.length; i++) {
    for (let j = 0; j < seed.characters.length; j++) {
      if (i === j) continue;
      const from = seed.characters[i];
      const to = seed.characters[j];
      addressMatrix.push({
        from: from.name,
        to: to.name,
        address: to.name,
        speech_level: "polite" as const,
      });
    }
  }

  return {
    address_matrix: addressMatrix,
    info_budget: [
      {
        chapter_range: "1-3",
        new_characters_max: 2,
        new_concepts_max: 1,
        worldbuilding_style: "action_only" as const,
        backstory_allowed: "none" as const,
        info_priority: [],
      },
    ],
    emotion_curve: [
      {
        chapter_range: "1-3",
        primary_emotion: "궁금",
        tension_range: "3→6",
        reader_question: "이 이야기는 어디로 향하는가?",
      },
    ],
    hook_strategy: undefined,
  };
}

/**
 * Generate a DirectionDesign from a NovelSeed.
 *
 * Calls the planning model to produce address matrix, info budget,
 * emotion curve, and hook strategy.
 */
export async function generateDirectionDesign(
  seed: NovelSeed,
): Promise<{ data: DirectionDesign; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = buildDirectionDesignPrompt(seed);

  let result;
  try {
    result = await agent.callStructured({
      prompt,
      system: "당신은 한국 웹소설 연출 설계 전문가입니다. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록이나 설명 없이 순수 JSON만.",
      temperature: 0.5,
      maxTokens: 8000,
      schema: DirectionDesignSchema,
      format: "json",
      taskId: "direction-design",
    });
  } catch (err) {
    console.warn(`[direction-designer] 구조적 호출 실패, 폴백 사용: ${err instanceof Error ? err.message : err}`);
    return {
      data: buildFallbackDesign(seed),
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };
  }

  return {
    data: result.data,
    usage: result.usage,
  };
}
