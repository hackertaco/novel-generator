import type { Character, GenreOrigin } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";
import type { SimulationEvent, SimulationState } from "./types";

export interface GenreConventionEventBuildContext {
  state: SimulationState;
  seed: NovelSeed;
  chapter: number;
  nextSequence: number;
}

export interface GenreConventionOriginPlan {
  character: Character;
  origin: GenreOrigin;
  events: SimulationEvent[];
  mustUnderstand: string[];
}

function findPastLifeMemoryId(
  state: SimulationState,
  characterId: string,
): string | undefined {
  const memoryState = state.memories[characterId];
  if (!memoryState) return undefined;
  for (const memoryId of memoryState.timeline) {
    const memory = memoryState.byId[memoryId];
    if (!memory) continue;
    if (memory.tags.includes("past_life")) {
      return memoryId;
    }
  }
  return undefined;
}

function buildRegressionEvents(
  context: GenreConventionEventBuildContext,
  character: Character,
  origin: GenreOrigin,
): SimulationEvent[] {
  const { chapter } = context;
  let sequence = context.nextSequence;
  const events: SimulationEvent[] = [];

  const summary = origin.past_life_summary?.trim()
    ? origin.past_life_summary
    : `${character.name}는 전생의 마지막 순간을 떠올렸다.`;
  const triggerSummary = origin.trigger?.trim()
    ? origin.trigger
    : "익숙하지만 한 발 앞선 시간으로 의식이 돌아왔다";
  const realizationBelief = `${character.name}는 회귀했다 — ${triggerSummary}`;
  const realizationCause = origin.trigger?.trim()
    ? `회귀 트리거: ${origin.trigger}`
    : "전생의 마지막 통증과 동일한 풍경의 충돌";

  const memoryId = findPastLifeMemoryId(context.state, character.id);

  events.push({
    id: `genre:${character.id}:time_jump:ch${chapter}:${sequence}`,
    chapter,
    sequence: sequence++,
    type: "time_jump",
    actorId: character.id,
    summary: `${character.name}의 의식이 전생에서 현재로 돌아왔다`,
    payload: {
      fromChapter: 0,
      toChapter: chapter,
      summary: `${character.name}의 의식이 전생에서 현재로 돌아왔다`,
      source: "genre_convention:regression",
    },
    tags: [
      "event:time_jump",
      "genre:regression",
      "genre-convention",
      "audience-must-understand",
    ],
  });

  events.push({
    id: `genre:${character.id}:recollection:ch${chapter}:${sequence}`,
    chapter,
    sequence: sequence++,
    type: "recollection_surfaced",
    actorId: character.id,
    summary: `${character.name}가 전생의 마지막 기억을 떠올렸다`,
    payload: {
      characterId: character.id,
      memoryId,
      summary,
      visibility: "audience",
      source: "genre_convention:regression",
    },
    tags: [
      "event:recollection_surfaced",
      "genre:regression",
      "genre-convention",
      "audience-must-understand",
    ],
  });

  events.push({
    id: `genre:${character.id}:realization:ch${chapter}:${sequence}`,
    chapter,
    sequence: sequence++,
    type: "realization",
    actorId: character.id,
    summary: `${character.name}는 자신이 회귀했음을 자각했다`,
    payload: {
      characterId: character.id,
      subject: "회귀 자각",
      belief: realizationBelief,
      cause: realizationCause,
      visibility: "audience",
      source: "genre_convention:regression",
    },
    tags: [
      "event:realization",
      "genre:regression",
      "genre-convention",
      "audience-must-understand",
    ],
  });

  return events;
}

function buildEventsForCharacter(
  context: GenreConventionEventBuildContext,
  character: Character,
  origin: GenreOrigin,
): SimulationEvent[] {
  switch (origin.kind) {
    case "regression":
      return buildRegressionEvents(context, character, origin);
    case "possession":
    case "transmigration":
    case "awakening":
    default:
      return [];
  }
}

function collectMustUnderstand(
  character: Character,
  origin: GenreOrigin,
): string[] {
  const items: string[] = [];
  if (origin.must_understand && origin.must_understand.length > 0) {
    items.push(...origin.must_understand);
  } else if (origin.kind === "regression") {
    items.push(
      `${character.name}는 회귀자다`,
      origin.past_life_summary?.trim()
        ? `전생: ${origin.past_life_summary}`
        : `${character.name}는 전생을 기억한다`,
    );
    if (origin.trigger?.trim()) {
      items.push(`회귀 트리거: ${origin.trigger}`);
    }
  }
  return items;
}

export interface GenreConventionFallback {
  item: string;
  line: string;
  kind: "flashback" | "realization" | "time_jump";
  characterId: string;
}

function defaultFallbackLineForRegression(
  character: Character,
  origin: GenreOrigin,
  kind: "flashback" | "realization" | "time_jump",
): string {
  const pastLife = origin.past_life_summary?.trim();
  const trigger = origin.trigger?.trim();
  switch (kind) {
    case "flashback":
      return pastLife
        ? `${character.name}는 ${pastLife}를 떠올렸다.`
        : `${character.name}는 전생의 마지막 순간을 다시 떠올렸다.`;
    case "realization":
      return trigger
        ? `${character.name}는 ${trigger} — 회귀했음을 깨달았다.`
        : `${character.name}는 자신이 회귀했음을 깨달았다.`;
    case "time_jump":
      return `${character.name}의 의식이 전생에서 현재로 돌아왔다.`;
  }
}

function collectFallbacksForCharacter(
  character: Character,
  origin: GenreOrigin,
  mustUnderstand: string[],
): GenreConventionFallback[] {
  if (origin.kind !== "regression") return [];

  const fallbacks = origin.fallback_lines ?? {};
  const fallbackLine = (kind: "flashback" | "realization" | "time_jump"): string => {
    const explicit = fallbacks[kind]?.trim();
    return explicit && explicit.length > 0
      ? explicit
      : defaultFallbackLineForRegression(character, origin, kind);
  };

  const pickKind = (item: string): "flashback" | "realization" | "time_jump" => {
    if (/회귀|자각|깨달|되돌아|돌아왔/.test(item)) return "realization";
    if (/전생|이전 생|마지막|독|죽음|기억/.test(item)) return "flashback";
    return "time_jump";
  };

  return mustUnderstand.map((item) => {
    const kind = pickKind(item);
    return {
      item,
      line: fallbackLine(kind),
      kind,
      characterId: character.id,
    };
  });
}

export interface ChapterGenreConventionCoverage {
  mustUnderstand: string[];
  fallbacks: GenreConventionFallback[];
}

export function collectChapterGenreConventionCoverage(
  seed: NovelSeed,
  chapter: number,
): ChapterGenreConventionCoverage {
  const mustUnderstand: string[] = [];
  const fallbacks: GenreConventionFallback[] = [];

  for (const character of seed.characters) {
    const origin = character.genre_origin;
    if (!origin) continue;
    const awarenessChapter = origin.awareness_chapter ?? 1;
    if (chapter !== awarenessChapter) continue;

    const items = collectMustUnderstand(character, origin);
    if (items.length === 0) continue;

    mustUnderstand.push(...items);
    fallbacks.push(...collectFallbacksForCharacter(character, origin, items));
  }

  return { mustUnderstand, fallbacks };
}

export function buildGenreConventionPlans(
  context: GenreConventionEventBuildContext,
): GenreConventionOriginPlan[] {
  const { seed, chapter, state } = context;
  const plans: GenreConventionOriginPlan[] = [];
  let runningSequence = context.nextSequence;

  for (const character of seed.characters) {
    const origin = character.genre_origin;
    if (!origin) continue;
    const awarenessChapter = origin.awareness_chapter ?? 1;
    if (chapter !== awarenessChapter) continue;
    if (!state.characters[character.id]) continue;

    const events = buildEventsForCharacter(
      { ...context, nextSequence: runningSequence },
      character,
      origin,
    );
    if (events.length === 0) continue;

    runningSequence += events.length;
    plans.push({
      character,
      origin,
      events,
      mustUnderstand: collectMustUnderstand(character, origin),
    });
  }

  return plans;
}

export function buildGenreConventionEvents(
  context: GenreConventionEventBuildContext,
): SimulationEvent[] {
  return buildGenreConventionPlans(context).flatMap((plan) => plan.events);
}
