/**
 * Direction Designer — 연출 설계 생성기
 *
 * Sits between seed generation and blueprint generation.
 * Generates narrative direction metadata (address matrix, info budget,
 * emotion curve, hook strategy) that guides how the story is told.
 */

import { getAgent } from "@/lib/agents/llm-agent";
import { DirectionDesignSchema, type DirectionDesign } from "@/lib/schema/direction";
import { getAddressHintForPair, getRelationshipFactForPair } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

/** Roles considered "key" characters — limit address_matrix to these. */
const KEY_ROLES = new Set(["mc", "ml", "fl", "rival", "mentor", "villain"]);
const MAX_ADDRESS_CHARS = 5;

/**
 * Select key characters from the seed (mc, ml + up to 3 important supporting).
 */
function selectKeyCharacters(seed: NovelSeed) {
  const key = seed.characters.filter((c) => KEY_ROLES.has(c.role));
  const rest = seed.characters.filter((c) => !KEY_ROLES.has(c.role));
  const selected = [...key, ...rest].slice(0, MAX_ADDRESS_CHARS);
  return selected;
}

/**
 * Compute up to 3 chapter ranges for info_budget / emotion_curve.
 * e.g. total=30 → "1-3", "4-15", "16-30"
 */
function computeChapterRanges(totalChapters: number): string[] {
  if (totalChapters <= 5) return [`1-${totalChapters}`];
  if (totalChapters <= 15) {
    return ["1-3", `4-${totalChapters}`];
  }
  const mid = Math.floor(totalChapters * 0.4);
  return ["1-3", `4-${mid}`, `${mid + 1}-${totalChapters}`];
}


function relationTextBetween(from: NovelSeed["characters"][number], to: NovelSeed["characters"][number]): string {
  const rel = from.state.relationships || {};
  return String(rel[to.id] || rel[to.name] || rel[to.name.split(/\s+/)[0] || ""] || "");
}

function inferAddressEntry(
  from: NovelSeed["characters"][number],
  to: NovelSeed["characters"][number],
): { address: string; speech_level: "formal" | "polite" | "casual" | "intimate"; note?: string } {
  const explicit = getAddressHintForPair(from, to);
  if (explicit?.address && explicit?.speech_level) {
    return { address: explicit.address, speech_level: explicit.speech_level, note: explicit.note };
  }

  const structured = getRelationshipFactForPair(from, to);
  if (structured?.address_default && structured?.speech_mode_default) {
    return {
      address: structured.address_default,
      speech_level: structured.speech_mode_default,
      note: structured.note || structured.preferred_register,
    };
  }

  const relation = relationTextBetween(from, to);
  if (/(언니|누나)/.test(relation)) {
    return { address: "언니", speech_level: "polite", note: "자매 관계 유지" };
  }
  if (/(오빠|형)/.test(relation)) {
    return { address: relation.match(/오빠|형/)?.[0] || to.name, speech_level: "polite", note: "형제 관계 유지" };
  }
  if (/(동생)/.test(relation)) {
    return { address: to.name.split(/\s+/)[0] || to.name, speech_level: "casual", note: "윗형제가 아랫형제를 부름" };
  }

  if (from.social_rank === "servant") {
    if (to.social_rank === "royal") {
      return { address: "전하", speech_level: "formal", note: "시종/하인이 왕족에게 말함" };
    }
    if (to.social_rank === "noble" || to.social_rank === "gentry") {
      if (to.gender === "male") {
        return { address: "도련님", speech_level: "polite", note: "시종/하인이 상급 남성에게 말함" };
      }
      return { address: "아가씨", speech_level: "polite", note: "시녀/하인이 상급 여성에게 말함" };
    }
  }

  if ((from.social_rank === "noble" || from.social_rank === "gentry" || from.social_rank === "royal") && to.social_rank === "servant") {
    return { address: to.name.split(/\s+/)[0] || to.name, speech_level: "casual", note: "상급자가 시종/하인을 부름" };
  }

  return {
    address: to.name,
    speech_level: "polite",
  };
}

/**
 * Build the prompt for generating a DirectionDesign from a seed.
 * Scoped to key characters and 3 chapter ranges to keep output compact.
 */
export function buildDirectionDesignPrompt(seed: NovelSeed): string {
  const keyChars = selectKeyCharacters(seed);

  // Build character pairs only for key characters
  const charPairs: string[] = [];
  for (let i = 0; i < keyChars.length; i++) {
    for (let j = 0; j < keyChars.length; j++) {
      if (i === j) continue;
      const a = keyChars[i];
      const b = keyChars[j];
      charPairs.push(`${a.name}(${a.role}) → ${b.name}(${b.role})`);
    }
  }

  // Build arc info for emotion curve
  const arcInfo = seed.arcs
    .slice(0, 3)
    .map((a) => `- ${a.name} (${a.start_chapter}~${a.end_chapter}화): ${a.summary}`)
    .join("\n");

  // Chapter 1 outline for hook strategy
  const ch1Outline = seed.chapter_outlines.find((o) => o.chapter_number === 1);
  const ch1Info = ch1Outline
    ? `1화 아웃라인: ${ch1Outline.one_liner}\n핵심 사건: ${ch1Outline.key_points.map((p) => typeof p === "string" ? p : p.what).join(", ")}`
    : "1화 아웃라인 없음";

  const ranges = computeChapterRanges(seed.total_chapters);
  const rangeExamples = ranges.map((r) => `"${r}"`).join(", ");

  return `당신은 한국 웹소설 연출 설계 전문가입니다.

## 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
총 화수: ${seed.total_chapters}

## 핵심 캐릭터 (${keyChars.length}명)
${keyChars.map((c) => `- ${c.name} (${c.role}): ${c.voice.tone}`).join("\n")}

## 아크 (상위 3개)
${arcInfo || "미정"}

## ${ch1Info}

---

**반드시 아래 JSON 구조만 출력하세요. 설명, 마크다운 코드블록 없이 순수 JSON만.**

4가지를 생성:

1. **address_matrix**: 위 핵심 캐릭터 쌍만 (${charPairs.length}개 항목)
   대상 쌍: ${charPairs.join(", ")}
   각 항목: { "from", "to", "address" (호칭), "speech_level" ("formal"|"polite"|"casual"|"intimate"), "note"? }

2. **info_budget**: 정확히 ${ranges.length}개 항목, chapter_range: ${rangeExamples}
   각 항목: { "chapter_range", "new_characters_max" (정수), "new_concepts_max" (정수), "worldbuilding_style" ("action_only"|"brief_aside"|"narration_ok"), "backstory_allowed" ("none"|"one_sentence"|"brief_flashback"|"full_scene"), "info_priority" (문자열 배열, 2-3개) }

3. **emotion_curve**: 정확히 ${ranges.length}개 항목, chapter_range: ${rangeExamples}
   각 항목: { "chapter_range", "primary_emotion", "tension_range" (예: "3→7"), "reader_question" }

4. **hook_strategy**: 1개 객체
   { "opening_scene", "reader_knows_in_3_paragraphs" (3개 문자열 배열), "reader_must_NOT_know" (1-2개 문자열 배열), "emotional_hook" }

출력:
{"address_matrix":[...],"info_budget":[...],"emotion_curve":[...],"hook_strategy":{...}}`;
}

/**
 * Build a minimal fallback DirectionDesign from seed data.
 * Used when LLM generation fails.
 */
function buildFallbackDesign(seed: NovelSeed): DirectionDesign {
  console.warn("[direction-designer] LLM 생성 실패, 폴백 사용");

  const keyChars = selectKeyCharacters(seed);

  // Minimal address matrix from key characters
  const addressMatrix = [];
  for (let i = 0; i < keyChars.length; i++) {
    for (let j = 0; j < keyChars.length; j++) {
      if (i === j) continue;
      const from = keyChars[i];
      const to = keyChars[j];
      const inferred = inferAddressEntry(from, to);
      addressMatrix.push({
        from: from.name,
        to: to.name,
        address: inferred.address,
        speech_level: inferred.speech_level,
        ...(inferred.note ? { note: inferred.note } : {}),
      });
    }
  }

  const ranges = computeChapterRanges(seed.total_chapters);

  return {
    address_matrix: addressMatrix,
    info_budget: ranges.map((r) => ({
      chapter_range: r,
      new_characters_max: 2,
      new_concepts_max: 1,
      worldbuilding_style: "action_only" as const,
      backstory_allowed: "none" as const,
      info_priority: [],
    })),
    emotion_curve: ranges.map((r) => ({
      chapter_range: r,
      primary_emotion: "궁금",
      tension_range: "3→6",
      reader_question: "이 이야기는 어디로 향하는가?",
    })),
    hook_strategy: undefined,
  };
}

/**
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * Returns null if repair is not feasible.
 */
function tryRepairTruncatedJson(raw: string): unknown | null {
  // Find the start of JSON
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return null;

  let text = raw.slice(jsonStart);

  // Track open brackets/braces
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // If we're in a string, close it
  if (inString) text += '"';

  // Close all open brackets/braces
  while (stack.length > 0) {
    text += stack.pop();
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

  // --- Attempt 1: structured call with schema validation ---
  try {
    const result = await agent.callStructured({
      prompt,
      system: "한국 웹소설 연출 설계 전문가. 유효한 JSON만 출력. 마크다운 코드블록 금지.",
      temperature: 0.5,
      maxTokens: 8192,
      schema: DirectionDesignSchema,
      format: "json",
      taskId: "direction-design",
      retryCount: 2,
    });
    return { data: result.data, usage: result.usage };
  } catch (structuredErr) {
    console.warn(
      `[direction-designer] 구조적 호출 실패: ${structuredErr instanceof Error ? structuredErr.message : structuredErr}`
    );
  }

  // --- Attempt 2: plain text call + manual parse (handles truncation) ---
  try {
    const plainResult = await agent.call({
      prompt,
      system: "한국 웹소설 연출 설계 전문가. 유효한 JSON만 출력. 코드블록 금지. 간결하게.",
      temperature: 0.5,
      maxTokens: 8192,
      taskId: "direction-design-plain",
    });

    const rawText = plainResult.data;

    // Try normal parse first
    let parsed: unknown = null;
    try {
      // Extract JSON from possible markdown blocks
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/)
        || rawText.match(/```\s*([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
      const startIdx = jsonText.indexOf("{");
      if (startIdx !== -1) {
        parsed = JSON.parse(jsonText.slice(startIdx));
      }
    } catch {
      // JSON was likely truncated — attempt repair
      console.warn("[direction-designer] JSON 파싱 실패, 복구 시도...");
      parsed = tryRepairTruncatedJson(rawText);
    }

    if (parsed) {
      const validation = DirectionDesignSchema.safeParse(parsed);
      if (validation.success) {
        return { data: validation.data, usage: plainResult.usage };
      }
      // Partial parse succeeded but validation failed — try with defaults
      console.warn("[direction-designer] 스키마 검증 실패, 부분 데이터 사용 시도");
      const partial = parsed as Record<string, unknown>;
      const patched = {
        address_matrix: Array.isArray(partial.address_matrix) ? partial.address_matrix : [],
        info_budget: Array.isArray(partial.info_budget) ? partial.info_budget : [],
        emotion_curve: Array.isArray(partial.emotion_curve) ? partial.emotion_curve : [],
        hook_strategy: partial.hook_strategy ?? undefined,
      };
      const patchValidation = DirectionDesignSchema.safeParse(patched);
      if (patchValidation.success) {
        return { data: patchValidation.data, usage: plainResult.usage };
      }
    }
  } catch (plainErr) {
    console.warn(
      `[direction-designer] 일반 호출도 실패: ${plainErr instanceof Error ? plainErr.message : plainErr}`
    );
  }

  // --- Attempt 3: static fallback ---
  return {
    data: buildFallbackDesign(seed),
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
  };
}
