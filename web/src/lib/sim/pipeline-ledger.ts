import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint, SceneSpec } from "@/lib/schema/planning";

import type { SimulationEvent } from "./types";
import type { SimulationEventInvolvedEntity } from "./causal-ledger";
import type { WorldStateAuthority } from "./world-state-authority";

function normalizeWhitespace(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function optionalNormalizedString(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : undefined;
}

function formatSceneId(chapterNumber: number, sceneIndex: number): string {
  return `scene_${String(chapterNumber).padStart(3, "0")}_${String(sceneIndex + 1).padStart(2, "0")}`;
}

function formatSceneEventId(chapterNumber: number, sceneIndex: number): string {
  return `evt_ch${String(chapterNumber).padStart(3, "0")}_sc${String(sceneIndex + 1).padStart(2, "0")}_plot`;
}

function normalizeIdSegment(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  if (!trimmed) {
    return "unknown";
  }

  return Array.from(trimmed)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "x")
    .join("-");
}

function compactExcerpt(value: string | undefined, maxLength = 180): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function resolveSceneActorId(
  seed: NovelSeed,
  blueprint: ChapterBlueprint,
  scene: SceneSpec,
): string | undefined {
  if (blueprint.pov_character) {
    const resolved = seed.characters.find((character) =>
      character.id === blueprint.pov_character
      || character.name === blueprint.pov_character
    );
    if (resolved && scene.characters.includes(resolved.id)) {
      return resolved.id;
    }
  }

  return scene.characters[0];
}

function resolveSceneTargetId(
  scene: SceneSpec,
  actorId: string | undefined,
): string | undefined {
  return scene.characters.find((characterId) => characterId !== actorId);
}

function buildSceneEventSummary(
  scene: SceneSpec,
  sceneText: string | undefined,
): string {
  return normalizeWhitespace(scene.purpose)
    || compactExcerpt(sceneText)
    || "Generated scene major plot action";
}

function buildCanonicalFact(
  scene: SceneSpec,
  summary: string,
  sceneText: string | undefined,
): string {
  const primaryReveal = scene.must_reveal
    .map((value) => normalizeWhitespace(value))
    .find(Boolean);

  return primaryReveal
    ?? normalizeWhitespace(scene.leads_to)
    ?? normalizeWhitespace(scene.triggered_by)
    ?? summary
    ?? compactExcerpt(sceneText)
    ?? "Generated plot action";
}

function buildInvolvedEntities(
  seed: NovelSeed,
  scene: SceneSpec,
  actorId: string | undefined,
  targetId: string | undefined,
): SimulationEvent["involvedEntities"] {
  const characters = scene.characters.map((characterId) => {
    const character = seed.characters.find((candidate) => candidate.id === characterId);
    const role: SimulationEventInvolvedEntity["role"] =
      characterId === actorId
        ? "actor"
        : characterId === targetId
          ? "target"
          : "witness";

    return {
      entityId: characterId,
      entityType: "character" as const,
      role,
      label: optionalNormalizedString(character?.name),
    };
  }).filter((entity) => normalizeWhitespace(entity.entityId).length > 0);

  const location = normalizeWhitespace(scene.where_detail)
    ? [{
        entityId: `location:${normalizeIdSegment(normalizeWhitespace(scene.where_detail))}`,
        entityType: "location" as const,
        role: "location" as const,
        label: normalizeWhitespace(scene.where_detail),
      }]
    : [];

  return [
    ...characters,
    ...location,
  ].filter((entity, index, values) =>
    values.findIndex((candidate) =>
      candidate.entityId === entity.entityId
      && candidate.entityType === entity.entityType
      && candidate.role === entity.role
    ) === index
  );
}

function buildScenePrerequisites(
  scene: SceneSpec,
  sceneId: string,
  previousEvent: SimulationEvent | undefined,
): SimulationEvent["prerequisites"] {
  const prerequisites: NonNullable<SimulationEvent["prerequisites"]> = [];

  if (previousEvent) {
    prerequisites.push({
      prerequisiteId: `prior-event:${previousEvent.id}`,
      type: "event",
      description: previousEvent.summary,
      eventId: previousEvent.id,
      stateKey: `event:${previousEvent.id}`,
    });
  }

  const triggeredBy = normalizeWhitespace(scene.triggered_by);
  if (triggeredBy) {
    prerequisites.push({
      prerequisiteId: `scene-trigger:${sceneId}`,
      type: "scene_state",
      description: triggeredBy,
      stateKey: `scene:${sceneId}:trigger`,
    });
  }

  return prerequisites;
}

function buildSceneEvent(
  seed: NovelSeed,
  blueprint: ChapterBlueprint,
  chapterNumber: number,
  scene: SceneSpec,
  sceneIndex: number,
  sceneText: string | undefined,
  previousEvent: SimulationEvent | undefined,
): SimulationEvent {
  const sceneId = formatSceneId(chapterNumber, sceneIndex);
  const actorId = resolveSceneActorId(seed, blueprint, scene);
  const targetId = resolveSceneTargetId(scene, actorId);
  const summary = buildSceneEventSummary(scene, sceneText);
  const canonicalFact = buildCanonicalFact(scene, summary, sceneText);
  const sceneType = normalizeWhitespace(scene.type);
  const location = normalizeWhitespace(scene.where_detail) || undefined;

  return {
    id: formatSceneEventId(chapterNumber, sceneIndex),
    chapter: chapterNumber,
    episode: chapterNumber,
    sceneId,
    type: "plot_action",
    actorId,
    targetId,
    location,
    summary,
    prerequisites: buildScenePrerequisites(scene, sceneId, previousEvent),
    involvedEntities: buildInvolvedEntities(seed, scene, actorId, targetId),
    tags: uniqueStrings([
      "pipeline:generated-scene",
      "major-plot-action",
      sceneType ? `scene-type:${sceneType}` : undefined,
      location ? "scene-has-location" : undefined,
    ]),
    payload: {
      source: "generated_scene_pipeline",
      subject: canonicalFact,
      predicate: "major_action",
      object: canonicalFact,
      canonicalFact,
      canonicalSummary: summary,
      visibility: "audience",
      sceneCharacterIds: [...scene.characters],
      sceneType: scene.type,
      mustReveal: scene.must_reveal,
      triggeredBy: scene.triggered_by,
      leadsTo: scene.leads_to,
      sceneTextExcerpt: compactExcerpt(sceneText),
    },
  };
}

export interface GeneratedChapterSceneLedgerInput {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint?: ChapterBlueprint;
  sceneTexts?: string[];
}

export function emitGeneratedChapterSceneLedger(
  authority: WorldStateAuthority,
  input: GeneratedChapterSceneLedgerInput,
): SimulationEvent[] {
  const blueprint = input.blueprint;
  if (!blueprint || blueprint.scenes.length === 0) {
    return [];
  }

  const emittedEvents: SimulationEvent[] = [];
  let previousEvent: SimulationEvent | undefined;

  blueprint.scenes.forEach((scene, sceneIndex) => {
    const event = buildSceneEvent(
      input.seed,
      blueprint,
      input.chapterNumber,
      scene,
      sceneIndex,
      input.sceneTexts?.[sceneIndex],
      previousEvent,
    );
    authority.applyEvent(event);
    emittedEvents.push(event);
    previousEvent = event;
  });

  return emittedEvents;
}
