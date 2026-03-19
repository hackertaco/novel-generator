import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import type { TokenUsage } from "@/lib/agents/types";
import { runPlotPipeline } from "@/lib/agents/plot-pipeline";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  WorldSettingSchema,
  PlotArcSchema,
  ChapterOutlineSchema,
  StyleGuideSchema,
} from "@/lib/schema/novel";
import { CharacterSchema } from "@/lib/schema/character";
import { ForeshadowingSchema } from "@/lib/schema/foreshadowing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedGeneratorConfig {
  genre: string;
  /** Optional premise/logline to use (if not provided, generates one via plot pipeline) */
  premise?: string;
  /** Target total chapters (default: 200) */
  totalChapters?: number;
  /** Model to use for generation */
  model?: string;
  /** Progress callback */
  onProgress?: (step: string) => void;
}

export interface SeedGeneratorResult {
  seed: NovelSeed;
  usage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyUsage(): TokenUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

// ---------------------------------------------------------------------------
// Inline Zod schemas for each step
// ---------------------------------------------------------------------------

const WorldStepSchema = WorldSettingSchema;

const CharacterStepSchema = z.array(CharacterSchema);

const StoryStructureSchema = z.object({
  arcs: z.array(PlotArcSchema),
  chapter_outlines: z.array(ChapterOutlineSchema),
});

const ForeshadowingStepSchema = z.array(ForeshadowingSchema);

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function generateRichSeed(
  config: SeedGeneratorConfig,
): Promise<SeedGeneratorResult> {
  const {
    genre,
    totalChapters = 200,
    model,
    onProgress,
  } = config;

  const agent = getAgent();
  let usage = emptyUsage();
  const callOpts = model ? { model } : {};

  // =========================================================================
  // Step 1: Premise
  // =========================================================================
  onProgress?.("Step 1/5: 프리미스 생성 중...");

  let title: string;
  let logline: string;
  let arcSummary: string[];

  if (config.premise) {
    title = "";
    logline = config.premise;
    arcSummary = [];

    // Generate a title from the premise
    const titleResult = await agent.call({
      prompt: `다음 프리미스로 ${genre} 웹소설 제목을 하나만 생성하세요. 제목만 출력하세요.\n\n프리미스: ${config.premise}`,
      system: "당신은 한국 웹소설 제목 전문가입니다.",
      temperature: 0.7,
      maxTokens: 100,
      taskId: "seed-title",
      ...callOpts,
    });
    title = titleResult.data.trim().replace(/^["'「『]|["'」』]$/g, "");
    usage = addUsage(usage, titleResult.usage);
  } else {
    const plotResult = await runPlotPipeline(genre);
    usage = addUsage(usage, plotResult.usage);

    const best = plotResult.plots[0];
    if (!best) throw new Error("Plot pipeline returned no plots");

    title = best.title;
    logline = best.logline;
    arcSummary = best.arc_summary;
  }

  // =========================================================================
  // Step 2: World Building
  // =========================================================================
  onProgress?.("Step 2/5: 세계관 설계 중...");

  const worldPrompt = `다음 프리미스를 가진 ${genre} 웹소설의 세계관을 설계하세요.

제목: ${title}
로그라인: ${logline}
${arcSummary.length > 0 ? `아크 요약:\n${arcSummary.map((a, i) => `${i + 1}. ${a}`).join("\n")}` : ""}

다음 요소를 반드시 포함하세요:
- name: 세계/배경의 이름
- genre: "${genre}"
- sub_genre: 구체적인 서브장르
- time_period: 시대적 배경
- magic_system: 마법/능력 체계 (해당 없으면 null)
- key_locations: 최소 4개 이상의 주요 장소 (장소명: 설명)
- factions: 최소 3개 이상의 세력/조직 (이름: 설명)
- rules: 최소 3개 이상의 세계 규칙

JSON 형식으로 출력하세요.`;

  const worldResult = await agent.callStructured({
    prompt: worldPrompt,
    system: "당신은 한국 웹소설 세계관 설계 전문가입니다.",
    temperature: 0.7,
    maxTokens: 4096,
    schema: WorldStepSchema,
    format: "json",
    taskId: "seed-world",
    ...callOpts,
  });
  const world = worldResult.data;
  usage = addUsage(usage, worldResult.usage);

  // =========================================================================
  // Step 3: Character Sheet
  // =========================================================================
  onProgress?.("Step 3/5: 캐릭터 설계 중...");

  const worldContext = JSON.stringify(world, null, 2);

  const characterPrompt = `다음 세계관과 프리미스를 바탕으로 8~12명의 캐릭터를 설계하세요.

제목: ${title}
로그라인: ${logline}

세계관:
${worldContext}

각 캐릭터에 대해 다음을 포함하세요:
- id: 고유 ID (예: "char_1", "char_2")
- name: 한국식 이름
- role: 역할 (주인공, 히로인, 악역, 조력자, 멘토 등)
- introduction_chapter: 첫 등장 화수 (주인공은 1, 나머지는 1~30 사이에 분산)
- voice: 캐릭터 목소리 설정
  - tone: 전체적인 말투 톤
  - speech_patterns: 최소 3개 이상의 고유한 말투 패턴
  - sample_dialogues: 최소 5개 이상의 대표 대사 (실제 소설에서 사용할 수 있는 수준)
  - personality_core: 핵심 성격 설명
- backstory: 배경 스토리
- arc_summary: 캐릭터 성장 아크 요약
- state: 초기 상태
  - location: 시작 위치
  - status: "normal"
  - relationships: 다른 캐릭터와의 관계 (이름: 관계)

**핵심 요구사항**: 각 캐릭터의 대사 샘플은 즉시 구분 가능해야 합니다. 두 캐릭터가 같은 존댓말/반말 수준이나 말투 패턴을 공유해서는 안 됩니다.
예를 들어:
- 주인공은 짧고 무뚝뚝한 반말 ("...알았어.", "그래서?")
- 히로인은 활발한 반말 ("진짜?! 대박이다!", "야야야 잠깐만!")
- 멘토는 권위 있는 존댓말 ("그것은 네가 결정할 일이다.", "배움에는 끝이 없느니라.")

JSON 배열 형식으로 출력하세요.`;

  const characterResult = await agent.callStructured({
    prompt: characterPrompt,
    system: "당신은 캐릭터 설계 전문가입니다. 각 캐릭터의 목소리가 확실히 구분되어야 합니다.",
    temperature: 0.7,
    maxTokens: 8192,
    schema: CharacterStepSchema,
    format: "json",
    taskId: "seed-characters",
    ...callOpts,
  });
  const characters = characterResult.data;
  usage = addUsage(usage, characterResult.usage);

  // =========================================================================
  // Step 4: Story Structure (Arcs + Chapter Outlines)
  // =========================================================================
  onProgress?.("Step 4/5: 스토리 구조 설계 중...");

  const characterSummary = characters
    .map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`)
    .join("\n");

  const structurePrompt = `다음 세계관과 캐릭터를 바탕으로 ${totalChapters}화 장편 웹소설의 스토리 구조를 설계하세요.

제목: ${title}
로그라인: ${logline}

세계관: ${world.name} (${world.genre}/${world.sub_genre})
주요 장소: ${Object.keys(world.key_locations).join(", ")}
세력: ${Object.keys(world.factions).join(", ")}

캐릭터:
${characterSummary}

다음을 설계하세요:

1. arcs (플롯 아크) - 처음 60화를 **6~8개 아크**로 분할:
   - ⚠️ 각 아크는 반드시 **8~15화** 길이여야 합니다. 20화 이상의 아크는 금지!
   - 예시: 아크1(1~10화), 아크2(11~20화), 아크3(21~28화), 아크4(29~38화), ...
   - 각 아크: id, name, start_chapter, end_chapter, summary, key_events (3~5개), climax_chapter, theme, tension_curve
   - theme: 아크의 주제적 핵심 (예: "신뢰와 배신", "각성과 대가")
   - tension_curve: 아크 내 각 화의 긴장도 수치 배열 (1~10). 배열 길이 = end_chapter - start_chapter + 1
   - 아크 간 전환이 자연스러워야 합니다 (이전 아크의 결말이 다음 아크의 시작을 유발)

2. chapter_outlines (회차 개요) - 처음 10화:
   - 각 회차: chapter_number, title, arc_id, one_liner, key_points (3개 이상), characters_involved, tension_level (1~10)
   - 1화는 캐릭터 2명 이하만 등장. 이후 화마다 1명씩 추가
   - tension_level은 1화에서 시작해 점진적으로 상승해야 합니다

**아크 크기 규칙 (절대 준수)**:
- 최소 8화, 최대 15화
- 60화에 아크 1~2개만 있으면 틀린 것입니다
- 카카오페이지 인기작처럼: 도입(10화) → 첫 위기(8화) → 성장(12화) → 대결(10화) → 전환(8화) → ...

JSON 형식으로 다음 구조로 출력하세요:
{
  "arcs": [...],
  "chapter_outlines": [...]
}`;

  const structureResult = await agent.callStructured({
    prompt: structurePrompt,
    system: "당신은 200화 장편 웹소설의 구조를 설계하는 전문가입니다.",
    temperature: 0.5,
    maxTokens: 8192,
    schema: StoryStructureSchema,
    format: "json",
    taskId: "seed-structure",
    ...callOpts,
  });
  const { arcs, chapter_outlines } = structureResult.data;
  usage = addUsage(usage, structureResult.usage);

  // =========================================================================
  // Step 5: Foreshadowing
  // =========================================================================
  onProgress?.("Step 5/5: 복선 설계 중...");

  const arcSummaryForForeshadowing = arcs
    .map((a) => `- ${a.name} (${a.start_chapter}~${a.end_chapter}화): ${a.summary}`)
    .join("\n");

  const foreshadowingPrompt = `다음 스토리 구조를 바탕으로 5~8개의 복선(foreshadowing)을 설계하세요.

제목: ${title}
로그라인: ${logline}

아크 구조:
${arcSummaryForForeshadowing}

캐릭터:
${characterSummary}

각 복선에 대해:
- id: 고유 ID (예: "fs_1", "fs_2")
- name: 복선의 짧은 이름
- description: 복선의 구체적 내용
- importance: "critical" 또는 "normal" 또는 "minor"
- planted_at: 복선을 심는 화수
- hints_at: 힌트를 주는 화수 배열 (3~5개, 5~8화 간격으로 분산)
- reveal_at: 복선을 회수하는 화수
- status: "pending"
- hint_count: 0

**복선 설계 규칙 (절대 준수)**:
1. 심기(planted_at)와 회수(reveal_at) 사이에 최소 3개 힌트가 있어야 합니다
2. 힌트 간격은 5~8화입니다 (2화에 심고 48화에 회수하면서 힌트 없이 방치하는 것은 금지!)
3. 회수(reveal_at)가 전부 같은 화에 몰리면 안 됩니다. 복선마다 다른 아크에서 회수
4. 복선은 반드시 아크를 가로질러야 합니다 (같은 아크 안에서 심고 회수하는 건 복선이 아님)
5. 최소 2개는 importance가 "critical"이어야 합니다

**나쁜 예 (금지)**:
  fs_1: planted_at=2, hints_at=[10], reveal_at=48  → 힌트 1개, 간격 38화 = 독자가 까먹음
  fs_2: planted_at=4, hints_at=[], reveal_at=48    → 힌트 0개, 회수가 fs_1과 같은 화 = 금지

**좋은 예**:
  fs_1: planted_at=2, hints_at=[8, 14, 20], reveal_at=25     → 힌트 3개, 균일 간격
  fs_2: planted_at=5, hints_at=[12, 19, 27, 34], reveal_at=38 → 힌트 4개, 다른 아크에서 회수

JSON 배열 형식으로 출력하세요.`;

  const foreshadowingResult = await agent.callStructured({
    prompt: foreshadowingPrompt,
    system: "당신은 복선 설계 전문가입니다.",
    temperature: 0.5,
    maxTokens: 4096,
    schema: ForeshadowingStepSchema,
    format: "json",
    taskId: "seed-foreshadowing",
    ...callOpts,
  });
  const foreshadowing = foreshadowingResult.data;
  usage = addUsage(usage, foreshadowingResult.usage);

  // =========================================================================
  // Assemble the seed
  // =========================================================================
  onProgress?.("시드 조립 완료!");

  const seed: NovelSeed = {
    title,
    logline,
    total_chapters: totalChapters,
    world,
    characters,
    arcs,
    chapter_outlines,
    foreshadowing,
    style: StyleGuideSchema.parse({}),
  };

  return { seed, usage };
}
