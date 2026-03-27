import type { NovelSeed } from "../schema/novel";
import type { ChapterSummary } from "../schema/chapter";
import type { ChapterBlueprint } from "../schema/planning";
import { shouldAct } from "../schema/foreshadowing";
import { selectRelevantContext } from "./relevance";
import { trimToFit, estimateTokens } from "./token-estimator";

const RANK_ORDER = ["royal", "noble", "gentry", "commoner", "servant", "slave", "outcast"];
const RANK_LABEL: Record<string, string> = {
  royal: "왕족", noble: "귀족", gentry: "사대부/기사", commoner: "평민",
  servant: "하인/시녀", slave: "노예", outcast: "추방자",
};

/** Build social rank interaction pairs for characters in a chapter */
function buildRankPairs(chars: Array<{ name: string; social_rank?: string }>): string[] {
  const ranked = chars.filter((c) => c.social_rank);
  const pairs: string[] = [];
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i], b = ranked[j];
      const ra = RANK_ORDER.indexOf(a.social_rank || "commoner");
      const rb = RANK_ORDER.indexOf(b.social_rank || "commoner");
      if (ra !== rb) {
        const higher = ra < rb ? a : b;
        const lower = ra < rb ? b : a;
        pairs.push(`${lower.name}(${RANK_LABEL[lower.social_rank!] || lower.social_rank}) → ${higher.name}(${RANK_LABEL[higher.social_rank!] || higher.social_rank}): 존대`);
      }
    }
  }
  return pairs;
}

/** Infer honorific hint from character backstory/role */
function getHonorificHint(char: { backstory?: string; role?: string }): string {
  const bs = (char.backstory || "") + " " + (char.role || "");
  if (bs.includes("황제") || bs.includes("황후")) return "\n호칭 규칙: 이 인물은 '전하' 또는 '폐하'로 불림 (전 화에서 사용한 호칭을 유지)";
  if (bs.includes("공주") || bs.includes("공녀") || bs.includes("황녀")) return "\n호칭 규칙: 이 인물은 '전하' 또는 '공주님'으로 불림 (전 화에서 사용한 호칭을 유지)";
  if (bs.includes("공작")) return "\n호칭 규칙: 이 인물은 '각하' 또는 '공작님'으로 불림";
  if (bs.includes("후작") || bs.includes("백작")) return "\n호칭 규칙: 이 인물은 작위에 맞는 호칭 사용";
  if (bs.includes("영애") || bs.includes("귀족")) return "\n호칭 규칙: 이 인물은 '아가씨'로 불림";
  return "";
}

/**
 * Format a PlotPoint (string or {what, why, reveal}) for writer context.
 * - immediate: show what + why to writer
 * - delayed: show what only, hide why (writer should hint, not explain)
 * - implicit: show what only with "독자가 추론하도록 힌트만" note
 */
function formatPlotPoint(point: string | { what: string; why?: string; reveal?: string }): string {
  if (typeof point === "string") return `- ${point}`;
  const { what, why, reveal } = point;
  if (reveal === "delayed") {
    return `- ${what} (⚠ 이유는 아직 밝히지 마세요. 독자에게 의문만 남기세요.)`;
  }
  if (reveal === "implicit") {
    return `- ${what} (이유를 직접 말하지 말고 힌트만 주세요: ${why || ""})`;
  }
  // immediate (default)
  return why ? `- ${what} — 이유: ${why} (독자에게 명확히 설명하세요)` : `- ${what}`;
}

export interface ChapterContext {
  novelInfo: string;
  currentArc: string;
  chapterOutline: string;
  characters: string;
  foreshadowing: string;
  previousSummaries: string;
  styleGuide: string;
}

/**
 * For chapters 1-3, radically limit context so the writer CAN'T cram everything in.
 * The less the writer knows, the slower it writes.
 */
function buildStarvedContext(
  seed: NovelSeed,
  chapterNum: number,
): string {
  const mc = seed.characters.find((c) => c.role === "주인공" || c.id === "mc");
  const parts: string[] = [];

  parts.push(`# 소설 정보
제목: ${seed.title}
장르: ${seed.world.genre} / ${seed.world.sub_genre}
`);

  // Only protagonist info
  if (mc) {
    parts.push(`# 주인공
이름: ${mc.name}
성격: ${mc.voice.personality_core}
말투: ${mc.voice.tone}
예시 대사:
${mc.voice.sample_dialogues.slice(0, 2).map((d) => `- "${d}"`).join("\n")}
`);
  }

  // Chapter 1: just the situation, no plot details
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNum,
  );
  if (outline) {
    if (chapterNum === 1) {
      // Ch1: only show the mood/setting, not the plot. Strip out specific events.
      parts.push(`# 1화
분위기: ${outline.one_liner}
(주의: 위 내용은 이 소설 전체의 출발점입니다. 1화에서 다 보여줄 필요 없습니다. 주인공의 일상 한 장면만 쓰세요.)
`);
    } else {
      parts.push(`# ${chapterNum}화
${outline.one_liner}
`);
      // Ch2-3: max 1 key_point.
      if (chapterNum >= 2 && outline.key_points.length > 0) {
        parts.push(`포인트: ${outline.key_points[0]}`);
      }
    }
  }

  // Style guide (minimal)
  parts.push(`# 스타일
- 시점: ${seed.style.pov}
- 시제: ${seed.style.tense}
- 문단: ${seed.style.max_paragraph_length}문장 이하
`);

  // Previous summaries for ch2-3
  if (chapterNum > 1) {
    const recent = seed.chapter_outlines
      .filter((o) => o.chapter_number < chapterNum)
      .slice(-2);
    if (recent.length > 0) {
      parts.push("# 이전 내용");
      for (const o of recent) {
        parts.push(`- ${o.chapter_number}화: ${o.one_liner}`);
      }
    }
  }

  return parts.join("\n");
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


  // First chapter: reader needs world-building context
  if (chapterNum === 1) {
    const mcChar = seed.characters.find((c) => c.role === "주인공" || c.role === "protagonist");
    parts.push(`# ⚠ 1화 도입 — 독자는 이 세계를 모릅니다
주인공: ${mcChar ? mcChar.name + " — " + mcChar.backstory.slice(0, 100) : "미정"}
배경: ${seed.world.time_period || ""}, ${seed.world.name || ""}

초반 1~2문단에서 주인공의 이름/처지/상황을 독자에게 알려주세요.
배경 없이 장면에 바로 던지지 마세요. 최소한의 맥락을 먼저 제공하세요.
`);
  }
  // Current arc (reduced info for early chapters)
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    const isEarlyInArc = chapterNum <= currentArc.start_chapter + 2;
    if (isEarlyInArc) {
      // Early chapters: only show arc name and theme, not summary/climax
      parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
이 아크의 시작 단계입니다. 급하게 전개하지 말고, 상황과 분위기를 충분히 보여주세요.
`);
    } else {
      parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
${currentArc.summary}
클라이맥스: ${currentArc.climax_chapter}화
`);
    }
  }

  // Chapter outline
  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNum,
  );
  if (outline) {
    // Limit key_points for early chapters (but allow enough for pacing)
    const maxPoints = chapterNum <= 2 ? 3 : outline.key_points.length;
    const points = outline.key_points.slice(0, maxPoints);
    // Story threads this chapter advances
    const threadIds = outline.advances_thread || [];
    const threadObjects = threadIds
      .map((tid: string) => seed.story_threads?.find((t: { id: string }) => t.id === tid))
      .filter(Boolean) as Array<{ id: string; name: string; type?: string; relations?: Array<{ target: string; relation: string; description: string }> }>;
    const threads = threadObjects.map((t) => `${t.type === "main" ? "🔴 메인" : "🔵 서브"}: ${t.name}`);

    // Show thread relations for context
    const relationHints: string[] = [];
    for (const t of threadObjects) {
      if (!t.relations) continue;
      for (const rel of t.relations) {
        const targetThread = seed.story_threads?.find((st: { id: string }) => st.id === rel.target);
        if (!targetThread) continue;
        const relLabel = rel.relation === "feeds_into" ? "→ 도움" : rel.relation === "conflicts_with" ? "⚡ 충돌" : rel.relation === "blocked_by" ? "🔒 의존" : "💡 드러냄";
        relationHints.push(`${t.name} ${relLabel} ${(targetThread as { name: string }).name}: ${rel.description}`);
      }
    }

    parts.push(`# ${chapterNum}화 아웃라인
제목: ${outline.title}
핵심: ${outline.one_liner}${threads.length > 0 ? `\n이번 화가 진전시키는 스토리 라인:\n${threads.map((t: string) => `- ${t}`).join("\n")}${relationHints.length > 0 ? `\n스레드 간 관계:\n${relationHints.map((h) => `- ${h}`).join("\n")}` : ""}` : ""}
포인트:
${points.map((p) => formatPlotPoint(p)).join("\n")}
긴장도: ${outline.tension_level}/10
`);
  }

  // Characters — filter by introduction_chapter to prevent premature appearances
  const characterIds = outline?.characters_involved || [];
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter((c) => c && c.introduction_chapter <= chapterNum);

  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(`
## ${char.name} (${char.role}${char.social_rank ? ` / ${char.social_rank}` : ""})
톤: ${char.voice.tone}
말투: ${char.voice.speech_patterns.join(", ")}${getHonorificHint(char)}
예시 대사:
${char.voice.sample_dialogues
  .slice(0, 3)
  .map((d) => `- "${d}"`)
  .join("\n")}
`);
    }
  }
    // Rank-based interaction hints (data only)
    const validChars = charsInChapter.filter((c): c is NonNullable<typeof c> => !!c);
    const rankPairs = buildRankPairs(validChars);
    if (rankPairs.length > 0) {
      parts.push(`# 신분 관계\n${rankPairs.join("\n")}\n`);
    }

  // Characters NOT allowed yet — explicit prohibition
  const forbiddenChars = seed.characters
    .filter((c) => c.introduction_chapter > chapterNum)
    .map((c) => c.name);
  if (forbiddenChars.length > 0) {
    parts.push(`# ⛔ 등장 금지 캐릭터 (이 화에서 절대 사용 금지!)
${forbiddenChars.join(", ")}
위 인물은 아직 등장하면 안 됩니다. 이름, 대사, 행동 묘사 모두 금지.
`);
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

  // Current arc (reduced info for early chapters)
  const currentArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNum && chapterNum <= a.end_chapter,
  );
  if (currentArc) {
    const isEarlyInArc = chapterNum <= currentArc.start_chapter + 2;
    if (isEarlyInArc) {
      parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
이 아크의 시작 단계입니다. 급하게 전개하지 말고, 상황과 분위기를 충분히 보여주세요.
`);
    } else {
      parts.push(`# 현재 아크
${currentArc.name} (${currentArc.start_chapter}~${currentArc.end_chapter}화)
${currentArc.summary}
클라이맥스: ${currentArc.climax_chapter}화
`);
    }
  }

  // Blueprint details
  const funFields: string[] = [];
  if (blueprint.curiosity_hook) {
    funFields.push(`호기심 질문: ${blueprint.curiosity_hook} — 이 질문을 독자 머릿속에 심으세요.`);
  }
  if (blueprint.emotional_peak_position != null) {
    const pct = Math.round(blueprint.emotional_peak_position * 100);
    funFields.push(`감정 피크: 전체 분량의 약 ${pct}% 지점에서 감정이 최고조에 달하도록 페이싱하세요.`);
  }
  if (blueprint.cliffhanger_type) {
    const cliffLabels: Record<string, string> = {
      question: "독자에게 풀리지 않은 질문을 던지며 끝내세요",
      crisis: "주인공이 위기에 빠진 순간에서 끊으세요",
      revelation: "충격적인 사실이 드러나는 순간에서 끊으세요",
      twist: "독자의 예상을 뒤집는 반전으로 끝내세요",
    };
    funFields.push(`엔딩 방식: [${blueprint.cliffhanger_type}] ${cliffLabels[blueprint.cliffhanger_type] || blueprint.cliffhanger_type}`);
  }

  // Tension level guidance
  if (blueprint.tension_level != null) {
    funFields.push(`긴장도: ${blueprint.tension_level}/10 — 이 챕터의 긴장도는 ${blueprint.tension_level}/10입니다. 그에 맞는 페이스로 작성하세요.`);
  }

  parts.push(`# ${chapterNum}화 블루프린트
제목: ${blueprint.title}
핵심: ${blueprint.one_liner}
아크 내 역할: ${blueprint.role_in_arc}
감정선: ${blueprint.emotional_arc}
목표 분량: ${blueprint.target_word_count}자
${funFields.length > 0 ? "\n## 재미 가이드\n" + funFields.join("\n") + "\n" : ""}`);

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

  // Key points (limited for early chapters)
  if (blueprint.key_points.length > 0) {
    const maxPoints = chapterNum <= 2 ? 3 : blueprint.key_points.length;
    const points = blueprint.key_points.slice(0, maxPoints);
    parts.push("# 핵심 포인트 (모두 이번 화에서 소화하세요)");
    for (const point of points) {
      parts.push(`- ${point}`);
    }
    if (blueprint.key_points.length > maxPoints) {
      parts.push(`(나머지 ${blueprint.key_points.length - maxPoints}개는 후속 화에서 전개)`);
    }
    parts.push("");
  }

  // Characters — filter by introduction_chapter to prevent premature appearances
  const characterIds = blueprint.characters_involved || [];
  const charsInChapter = characterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter((c) => c && c.introduction_chapter <= chapterNum);

  if (charsInChapter.length > 0) {
    parts.push("# 등장 캐릭터");
    for (const char of charsInChapter) {
      if (!char) continue;
      parts.push(`
## ${char.name} (${char.role}${char.social_rank ? ` / ${char.social_rank}` : ""})
톤: ${char.voice.tone}
말투: ${char.voice.speech_patterns.join(", ")}${getHonorificHint(char)}
예시 대사:
${char.voice.sample_dialogues
  .slice(0, 3)
  .map((d) => `- "${d}"`)
  .join("\n")}
`);
    }
  }

  // Characters NOT allowed yet — explicit prohibition
  const forbiddenChars = seed.characters
    .filter((c) => c.introduction_chapter > chapterNum)
    .map((c) => c.name);
  if (forbiddenChars.length > 0) {
    parts.push(`# ⛔ 등장 금지 캐릭터 (이 화에서 절대 사용 금지!)
${forbiddenChars.join(", ")}
위 인물은 아직 등장하면 안 됩니다. 이름, 대사, 행동 묘사 모두 금지.
`);
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
