import type { NovelSeed } from "../schema/novel";
import type { ChapterSummary } from "../schema/chapter";
import type { ChapterBlueprint } from "../schema/planning";
import { shouldAct } from "../schema/foreshadowing";
import { selectRelevantContext } from "./relevance";
import { trimToFit, estimateTokens } from "./token-estimator";

export interface ChapterContext {
  novelInfo: string;
  currentArc: string;
  chapterOutline: string;
  characters: string;
  foreshadowing: string;
  previousSummaries: string;
  styleGuide: string;
}

export function buildChapterContext(
  seed: NovelSeed,
  chapterNum: number,
  previousSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>,
): string {
  const parts: string[] = [];

  // Novel info
  parts.push(`# 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
`);

  // Current arc
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
${currentArc.summary}
클라이맥스: ${currentArc.climax_chapter}화
`);
  }

  // Chapter outline
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNum,
  );
  if (outline) {
    parts.push(`# ${chapterNum}화 아웃라인
제목: ${outline.title}
핵심: ${outline.one_liner}
포인트:
${outline.key_points.map((p) => `- ${p}`).join("\n")}
긴장도: ${outline.tension_level}/10
`);
  }

  // Characters
  const characterIds = outline?.characters_involved || [];
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(`
## ${char.name} (${char.role})
톤: ${char.voice.tone}
말투: ${char.voice.speech_patterns.join(", ")}
예시 대사:
${char.voice.sample_dialogues
  .slice(0, 3)
  .map((d) => `- "${d}"`)
  .join("\n")}
`);
    }
  }

  // Foreshadowing
  const activeFs = seed.foreshadowing.filter(
    (fs) => shouldAct(fs, chapterNum) !== null,
  );
  if (activeFs.length > 0) {
    parts.push("# 복선 처리");
    for (const fs of activeFs) {
      const action = shouldAct(fs, chapterNum);
      parts.push(`- [${action}] ${fs.name}: ${fs.description}`);
    }
  }

  // Previous summaries (last 5)
  const recentSummaries = previousSummaries.slice(-5);
  if (recentSummaries.length > 0) {
    parts.push("# 이전 내용 요약");
    for (const s of recentSummaries) {
      parts.push(`- ${s.chapter}화: ${s.summary.slice(0, 100)}...`);
    }
  }

  // Style guide
  parts.push(`# 스타일 가이드
- 문단: ${seed.style.max_paragraph_length}문장 이하
- 대화 비율: ${Math.round(seed.style.dialogue_ratio * 100)}%
- 시점: ${seed.style.pov}
- 시제: ${seed.style.tense}
- 후킹 엔딩: ${seed.style.hook_ending ? "필수" : "선택"}
규칙:
${seed.style.formatting_rules.map((r) => `- ${r}`).join("\n")}
`);

  return parts.join("\n");
}

export interface SmartContextOptions {
  seed: NovelSeed;
  chapterNum: number;
  allSummaries: ChapterSummary[];
  arcSummaries?: Record<string, string>;
  contextBudgetTokens?: number; // default 3000
}

export function buildSmartChapterContext(options: SmartContextOptions): string {
  const {
    seed,
    chapterNum,
    allSummaries,
    arcSummaries,
    contextBudgetTokens = 3000,
  } = options;
  const parts: string[] = [];

  // Fixed parts (always included, not subject to trimming)
  // Novel info
  parts.push(
    `# 소설 정보\n제목: ${seed.title}\n로그라인: ${seed.logline}\n장르: ${seed.world.genre} / ${seed.world.sub_genre}\n`,
  );

  // Current arc
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    parts.push(
      `# 현재 아크\n${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)\n${currentArc.summary}\n클라이맥스: ${currentArc.climax_chapter}화\n`,
    );
  }

  // Chapter outline
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNum,
  );
  if (outline) {
    parts.push(
      `# ${chapterNum}화 아웃라인\n제목: ${outline.title}\n핵심: ${outline.one_liner}\n포인트:\n${outline.key_points.map((p) => `- ${p}`).join("\n")}\n긴장도: ${outline.tension_level}/10\n`,
    );
  }

  // Characters (always include characters for this chapter)
  const characterIds = outline?.characters_involved || [];
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);
  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(
        `\n## ${char.name} (${char.role})\n톤: ${char.voice.tone}\n말투: ${char.voice.speech_patterns.join(", ")}\n예시 대사:\n${char.voice.sample_dialogues
          .slice(0, 3)
          .map((d) => `- "${d}"`)
          .join("\n")}\n`,
      );
    }
  }

  // Active foreshadowing
  const activeFs = seed.foreshadowing.filter(
    (fs) => shouldAct(fs, chapterNum) !== null,
  );
  if (activeFs.length > 0) {
    parts.push("# 복선 처리");
    for (const fs of activeFs) {
      const action = shouldAct(fs, chapterNum);
      parts.push(`- [${action}] ${fs.name}: ${fs.description}`);
    }
  }

  // Style guide (always included)
  parts.push(
    `# 스타일 가이드\n- 문단: ${seed.style.max_paragraph_length}문장 이하\n- 대화 비율: ${Math.round(seed.style.dialogue_ratio * 100)}%\n- 시점: ${seed.style.pov}\n- 시제: ${seed.style.tense}\n- 후킹 엔딩: ${seed.style.hook_ending ? "필수" : "선택"}\n규칙:\n${seed.style.formatting_rules.map((r) => `- ${r}`).join("\n")}\n`,
  );

  // Calculate fixed part token count
  const fixedText = parts.join("\n");
  const fixedTokens = estimateTokens(fixedText);

  // Smart context: use remaining budget for relevant summaries
  const remainingBudget = Math.max(0, contextBudgetTokens - fixedTokens);

  if (remainingBudget > 0) {
    const relevantItems = selectRelevantContext({
      seed,
      currentChapter: chapterNum,
      allSummaries,
      arcSummaries,
    });

    const { selected } = trimToFit(relevantItems, remainingBudget);

    if (selected.length > 0) {
      parts.push("# 관련 맥락");
      // Sort selected back by priority order for readability
      for (const item of selected.sort((a, b) => a.priority - b.priority)) {
        parts.push(item.content);
      }
    }
  }

  return parts.join("\n");
}

export function buildBlueprintContext(
  seed: NovelSeed,
  chapterNum: number,
  previousSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>,
  blueprint?: ChapterBlueprint,
): string {
  // Fall back to basic context if no blueprint
  if (!blueprint) {
    return buildChapterContext(seed, chapterNum, previousSummaries);
  }

  const parts: string[] = [];

  // Novel info
  parts.push(`# 소설 정보
제목: ${seed.title}
로그라인: ${seed.logline}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
`);

  // Current arc
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
${currentArc.summary}
클라이맥스: ${currentArc.climax_chapter}화
`);
  }

  // Blueprint details
  parts.push(`# ${chapterNum}화 블루프린트
제목: ${blueprint.title}
핵심: ${blueprint.one_liner}
아크 내 역할: ${blueprint.role_in_arc}
감정선: ${blueprint.emotional_arc}
목표 분량: ${blueprint.target_word_count}자
`);

  // Scene plan
  if (blueprint.scenes.length > 0) {
    parts.push("# 씬 구성");
    blueprint.scenes.forEach((scene, i) => {
      parts.push(
        `${i + 1}. [${scene.type}] ${scene.purpose} (~${scene.estimated_chars}자, 톤: ${scene.emotional_tone})`,
      );
    });
    parts.push("");
  }

  // Dependencies
  if (blueprint.dependencies.length > 0) {
    parts.push("# 의존성");
    for (const dep of blueprint.dependencies) {
      parts.push(`- ${dep}`);
    }
    parts.push("");
  }

  // Key points
  if (blueprint.key_points.length > 0) {
    parts.push("# 핵심 포인트");
    for (const point of blueprint.key_points) {
      parts.push(`- ${point}`);
    }
    parts.push("");
  }

  // Characters (same format as existing)
  const characterIds = blueprint.characters_involved || [];
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(`
## ${char.name} (${char.role})
톤: ${char.voice.tone}
말투: ${char.voice.speech_patterns.join(", ")}
예시 대사:
${char.voice.sample_dialogues
  .slice(0, 3)
  .map((d) => `- "${d}"`)
  .join("\n")}
`);
    }
  }

  // Foreshadowing
  const activeFs = seed.foreshadowing.filter(
    (fs) => shouldAct(fs, chapterNum) !== null,
  );
  if (activeFs.length > 0) {
    parts.push("# 복선 처리");
    for (const fs of activeFs) {
      const action = shouldAct(fs, chapterNum);
      parts.push(`- [${action}] ${fs.name}: ${fs.description}`);
    }
  }

  // Previous summaries (last 5)
  const recentSummaries = previousSummaries.slice(-5);
  if (recentSummaries.length > 0) {
    parts.push("# 이전 내용 요약");
    for (const s of recentSummaries) {
      parts.push(`- ${s.chapter}화: ${s.summary.slice(0, 100)}...`);
    }
  }

  // Style guide
  parts.push(`# 스타일 가이드
- 문단: ${seed.style.max_paragraph_length}문장 이하
- 대화 비율: ${Math.round(seed.style.dialogue_ratio * 100)}%
- 시점: ${seed.style.pov}
- 시제: ${seed.style.tense}
- 후킹 엔딩: ${seed.style.hook_ending ? "필수" : "선택"}
규칙:
${seed.style.formatting_rules.map((r) => `- ${r}`).join("\n")}
`);

  return parts.join("\n");
}
