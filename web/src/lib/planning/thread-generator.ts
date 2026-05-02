/**
 * Generate story threads from an existing seed.
 * Runs as a separate, lightweight LLM call after seed creation.
 */

import { getAgent } from "../agents/llm-agent";
import type { NovelSeed, StoryThread } from "../schema/novel";
import { z } from "zod";
import { ThreadRelationSchema, RevealTimelineEntrySchema } from "../schema/novel";

const ThreadResponseSchema = z.object({
  story_threads: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["main", "sub", "secret", "emotion", "plot_twist", "relationship"]).default("sub"),
    owner: z.string().optional(),
    description: z.string(),
    relations: z.array(ThreadRelationSchema).default([]),
    reveal_timeline: z.array(RevealTimelineEntrySchema).default([]),
  })),
  chapter_thread_map: z.record(z.string(), z.array(z.string())).default({}),
});

export async function generateStoryThreads(seed: NovelSeed): Promise<{
  threads: StoryThread[];
  chapterThreadMap: Record<string, string[]>;
}> {
  const agent = getAgent();
  const outlinesSummary = seed.chapter_outlines
    .slice(0, 10)
    .map((o) => `Ch${o.chapter_number}: ${o.one_liner}`)
    .join("\n");

  const prompt = `이 소설의 스토리 스레드(메인/서브 줄거리)를 분석하세요.

제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre}
${seed.romance_core ? `로맨스 장르 약속: ${seed.romance_core.primary_pair.join(" ↔ ")} / ${seed.romance_core.mode} / 장애물: ${seed.romance_core.obstacle} / 보상: ${seed.romance_core.promise}` : ""}

아웃라인:
${outlinesSummary}

## 지시사항
1. 메인 스레드 1개 + 서브 스레드 2~3개를 정의하세요.
1-1. 장르가 로맨스/로맨스 판타지 계열이면 romance 또는 relationship 타입 스레드를 최소 1개 포함하세요.
2. 스레드 간 관계를 정의하세요 (feeds_into, conflicts_with, blocked_by, reveals).
3. 각 화(chapter_number)가 어떤 스레드를 진전시키는지 매핑하세요.

JSON으로 출력:
{
  "story_threads": [
    {"id": "main", "name": "핵심 줄거리", "type": "main", "description": "...", "relations": []},
    {"id": "romance", "name": "로맨스", "type": "sub", "description": "...", "relations": [{"target": "main", "relation": "conflicts_with", "description": "..."}]}
  ],
  "chapter_thread_map": {
    "1": ["main"],
    "2": ["main", "romance"],
    "3": ["romance", "conspiracy"]
  }
}`;

  try {
    const result = await agent.callStructured({
      prompt,
      system: "한국 웹소설 구조 분석 전문가입니다. JSON만 출력하세요.",
      temperature: 0.4,
      maxTokens: 4000,
      schema: ThreadResponseSchema,
      format: "json",
      taskId: "story-threads",
    });

    // Apply thread map to seed outlines
    const map = result.data.chapter_thread_map;
    for (const outline of seed.chapter_outlines) {
      const key = String(outline.chapter_number);
      if (map[key]) {
        outline.advances_thread = map[key];
      }
    }

    return {
      threads: result.data.story_threads,
      chapterThreadMap: map,
    };
  } catch {
    // Fallback: create minimal threads from logline
    const threads: StoryThread[] = [
      { id: "main", name: seed.logline.slice(0, 30), type: "main", description: seed.logline, relations: [], reveal_timeline: [] },
    ];
    const genreText = `${seed.world.genre} ${seed.world.sub_genre}`.toLowerCase();
    if (genreText.includes("로맨스") || genreText.includes("romance")) {
      const romanceDescription = seed.romance_core
        ? `${seed.romance_core.primary_pair.join("과 ")} 사이의 ${seed.romance_core.mode} 감정선 — 장애물: ${seed.romance_core.obstacle} / 약속: ${seed.romance_core.promise}`
        : "주요 인물 사이의 감정선과 관계 전환";
      threads.push({
        id: "romance",
        name: "로맨스",
        type: "relationship",
        description: romanceDescription,
        relations: [{ target: "main", relation: "conflicts_with", description: "로맨스가 메인 갈등과 얽혀 진행됨" }],
        reveal_timeline: [],
      });
    }
    return {
      threads,
      chapterThreadMap: {},
    };
  }
}
